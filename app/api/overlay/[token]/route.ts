import { NextResponse } from "next/server";
import { db, type Booking, type Streamer } from "@/lib/db";
import { STREAM_CHECKS } from "@/lib/env";
import { maybeSweepPayouts, settlePayouts } from "@/lib/payouts";
import { checkStream, persistCheck } from "@/lib/twitch";

const MAX_CREDIT_SECONDS = 30; // never credit more than this per heartbeat
const MIN_BEAT_MS = 5_000; // ignore heartbeats faster than this

// The OBS browser source calls this every ~10s with the booking it is currently showing (null if it isn't
// really showing it: image not loaded, source hidden in OBS, ...). Elapsed time since the previous heartbeat
// is credited to that booking, but only while Twitch confirms the streamer is live with VODs on; then the
// next ad is returned.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const streamer = db.prepare("SELECT * FROM streamers WHERE overlay_token = ?").get(token) as Streamer | undefined;
  if (!streamer) return new NextResponse("Not found", { status: 404 });
  // Disabled by an admin: show nothing and credit nothing.
  if (streamer.disabled) return NextResponse.json({ ad: null }, { headers: { "Cache-Control": "no-store" } });

  const body = (await req.json().catch(() => ({}))) as { showing?: number | null };
  const now = Date.now();

  const state = db.prepare("SELECT last_beat_at FROM overlay_state WHERE streamer_id = ?").get(streamer.id) as
    | { last_beat_at: number }
    | undefined;
  const elapsedMs = state ? now - state.last_beat_at : 0;

  // Ask Twitch (cached ~1 min). With STREAM_CHECKS off the result is only recorded, not enforced.
  const gate = await checkStream(streamer);
  const counting = !STREAM_CHECKS || gate.ok;

  if (typeof body.showing === "number" && state && elapsedMs >= MIN_BEAT_MS && counting) {
    const credit = Math.min(MAX_CREDIT_SECONDS, Math.round(elapsedMs / 1000));
    const credited = db
      .prepare(
        `UPDATE bookings SET seconds_delivered = MIN(seconds_total, seconds_delivered + ?), last_credited_at = ?
         WHERE id = ? AND streamer_id = ? AND status = 'approved'`,
      )
      .run(credit, now, body.showing, streamer.id);
    if (credited.changes > 0 && gate.vodId && gate.vodCreatedAt) {
      // Remember where in the VOD this aired, so anyone can check it afterwards.
      const offset = Math.max(0, Math.round((now - gate.vodCreatedAt) / 1000 - credit));
      db.prepare(
        `INSERT INTO booking_proofs (booking_id, vod_id, offset_s, seconds, last_at) VALUES (?,?,?,?,?)
         ON CONFLICT(booking_id, vod_id) DO UPDATE SET seconds = seconds + excluded.seconds, last_at = excluded.last_at`,
      ).run(body.showing, gate.vodId, offset, credit, now);
    }
    const done = db
      .prepare(
        `UPDATE bookings SET status = 'completed', completed_at = ?
         WHERE streamer_id = ? AND status = 'approved' AND seconds_delivered >= seconds_total`,
      )
      .run(now, streamer.id);
    // Fire and forget: the heartbeat response must not wait on Stripe. (Held payouts wait out PAYOUT_HOLD_HOURS.)
    if (done.changes > 0) void settlePayouts(streamer.id).catch((e) => console.error("settlePayouts:", e));
  }
  if (!state || elapsedMs >= MIN_BEAT_MS) {
    db.prepare(
      "INSERT INTO overlay_state (streamer_id, last_beat_at) VALUES (?,?) ON CONFLICT(streamer_id) DO UPDATE SET last_beat_at = excluded.last_beat_at",
    ).run(streamer.id, now);
  }
  persistCheck(streamer.id, gate);
  maybeSweepPayouts();

  // Rotate: show the approved booking with the least airtime so far.
  const next = db
    .prepare(
      `SELECT b.*, s.width AS slot_width, s.height AS slot_height, s.position AS slot_position
       FROM bookings b JOIN slots s ON s.id = b.slot_id
       WHERE b.streamer_id = ? AND b.status = 'approved'
       ORDER BY b.seconds_delivered ASC, b.id ASC LIMIT 1`,
    )
    .get(streamer.id) as (Booking & { slot_width: number; slot_height: number; slot_position: string }) | undefined;

  return NextResponse.json(
    {
      ad: next
        ? {
            id: next.id,
            image: `/api/creative/${next.creative_file}`,
            company: next.company,
            width: next.slot_width,
            height: next.slot_height,
            position: next.slot_position,
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
