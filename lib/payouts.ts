import Stripe from "stripe";
import { db, type Booking, type Streamer } from "./db";
import { abs, PAYOUT_HOLD_HOURS, STREAM_CHECKS, STRIPE_ENABLED } from "./env";

export const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);

/** Creates the streamer's Express account if needed and returns a hosted onboarding URL. */
export async function startOnboarding(streamer: Streamer): Promise<string> {
  const stripe = getStripe();
  let accountId = streamer.stripe_account_id;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      business_type: "individual",
      capabilities: { transfers: { requested: true } },
      metadata: { streamer_id: String(streamer.id), twitch_login: streamer.login },
    });
    accountId = account.id;
    db.prepare("UPDATE streamers SET stripe_account_id = ? WHERE id = ?").run(accountId, streamer.id);
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: abs("/api/connect/onboard"),
    return_url: abs("/dashboard?connect=return"),
  });
  return link.url;
}

/** Re-reads the account from Stripe, stores whether it can receive transfers, and pays out anything waiting. */
export async function refreshConnectStatus(streamer: Streamer): Promise<boolean> {
  if (!STRIPE_ENABLED || !streamer.stripe_account_id) return false;
  const account = await getStripe().accounts.retrieve(streamer.stripe_account_id);
  const enabled = account.details_submitted && account.capabilities?.transfers === "active";
  db.prepare("UPDATE streamers SET payouts_enabled = ? WHERE id = ?").run(enabled ? 1 : 0, streamer.id);
  if (enabled) await settlePayouts(streamer.id);
  return !!enabled;
}

/**
 * Refunds the advertiser for the airtime that was not delivered (the full price if the ad never aired).
 * Called when a streamer rejects a paid booking. Idempotent per booking.
 */
export async function refundBooking(b: Booking): Promise<void> {
  if (!STRIPE_ENABLED || !b.payment_intent) return;
  const remaining = Math.round(b.price_cents * (1 - b.seconds_delivered / b.seconds_total));
  if (remaining <= 0) return;
  try {
    const refund = await getStripe().refunds.create(
      { payment_intent: b.payment_intent, amount: remaining, metadata: { booking_id: String(b.id) } },
      { idempotencyKey: `refund-booking-${b.id}` },
    );
    db.prepare("UPDATE bookings SET refund_id = ? WHERE id = ?").run(refund.id, b.id);
  } catch (err) {
    console.error(`Refund failed for booking ${b.id}:`, err);
  }
}

/**
 * Transfers the streamer's share (price minus platform fee) for every completed booking that hasn't been paid out.
 * Uses separate charges and transfers: the advertiser paid the platform, and we move the streamer's cut to them.
 * source_transaction ties the transfer to the original charge so it works before the funds settle.
 */
export async function settlePayouts(streamerId?: number): Promise<void> {
  if (!STRIPE_ENABLED) return;
  // Only bookings past their hold (completed_at + PAYOUT_HOLD_HOURS) that no admin is holding.
  const dueBefore = Date.now() - PAYOUT_HOLD_HOURS * 3_600_000;
  const rows = db
    .prepare(
      `SELECT b.*, s.stripe_account_id AS account FROM bookings b JOIN streamers s ON s.id = b.streamer_id
       WHERE b.status = 'completed' AND (b.payout_status IS NULL OR b.payout_status = 'failed')
         AND s.payouts_enabled = 1 AND s.stripe_account_id IS NOT NULL AND b.payment_intent IS NOT NULL
         AND b.payout_hold = 0 AND (b.completed_at IS NULL OR b.completed_at <= ?)
         AND (? = 0 OR b.proof_waived = 1 OR EXISTS (SELECT 1 FROM booking_proofs p WHERE p.booking_id = b.id))
         ${streamerId ? "AND b.streamer_id = ?" : ""}`,
    )
    .all(dueBefore, STREAM_CHECKS ? 1 : 0, ...(streamerId ? [streamerId] : [])) as (Booking & { account: string })[];

  const stripe = getStripe();
  for (const b of rows) {
    // Claim the row so concurrent heartbeats can't double-send.
    const claimed = db
      .prepare(
        "UPDATE bookings SET payout_status = 'processing' WHERE id = ? AND (payout_status IS NULL OR payout_status = 'failed')",
      )
      .run(b.id);
    if (claimed.changes === 0) continue;
    try {
      const pi = await stripe.paymentIntents.retrieve(b.payment_intent!);
      const charge = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id;
      const transfer = await stripe.transfers.create(
        {
          amount: b.price_cents - b.fee_cents,
          currency: "usd",
          destination: b.account,
          transfer_group: `booking_${b.id}`,
          ...(charge ? { source_transaction: charge } : {}),
          metadata: { booking_id: String(b.id) },
        },
        { idempotencyKey: `booking-transfer-${b.id}` },
      );
      db.prepare("UPDATE bookings SET payout_status = 'paid', transfer_id = ? WHERE id = ?").run(transfer.id, b.id);
    } catch (err) {
      console.error(`Payout failed for booking ${b.id}:`, err);
      db.prepare("UPDATE bookings SET payout_status = 'failed' WHERE id = ?").run(b.id);
    }
  }
}

let lastSweep = 0;

/**
 * Held payouts have no event that releases them, so the overlay heartbeat calls this; at most once every
 * 10 minutes it pays anything whose hold has run out (for any streamer).
 */
export function maybeSweepPayouts(): void {
  const now = Date.now();
  if (!STRIPE_ENABLED || now - lastSweep < 600_000) return;
  lastSweep = now;
  void settlePayouts().catch((err) => console.error("sweepPayouts:", err));
}

/** Short text about where a completed booking's payout stands, for dashboards. */
export function payoutNote(b: Booking, payoutsEnabled: boolean, hasProof = true): string {
  if (b.payout_status === "paid") return "paid out";
  if (b.payout_status === "processing") return "paying out…";
  if (b.payout_status === "failed") return "payout failed, will retry";
  if (b.payout_hold) return "payout on hold (under review)";
  if (STREAM_CHECKS && b.payment_intent && !hasProof && !b.proof_waived) return "needs a VOD link to be paid";
  const releaseAt = (b.completed_at ?? 0) + PAYOUT_HOLD_HOURS * 3_600_000;
  if (releaseAt > Date.now()) {
    return `payout releases ${new Date(releaseAt).toLocaleDateString("en-US", { dateStyle: "medium" })}`;
  }
  return payoutsEnabled ? "payout queued" : "waiting for payout setup";
}
