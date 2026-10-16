import { NextResponse } from "next/server";
import { db, type Booking, type Streamer } from "@/lib/db";
import { settlePayouts } from "@/lib/payouts";

const MAX_CREDIT_SECONDS = 30; // never credit more than this per heartbeat
const MIN_BEAT_MS = 5_000; // ignore heartbeats faster than this

// The OBS browser source calls this every ~10s with the booking it is currently showing.
// Elapsed time since the previous heartbeat is credited to that booking, then the next ad is returned.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const streamer = db.prepare("SELECT * FROM streamers WHERE overlay_token = ?").get(token) as Streamer | undefined;
  if (!streamer) return new NextResponse("Not found", { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { showing?: number | null };
  const now = Date.now();

  const state = db.prepare("SELECT last_beat_at FROM overlay_state WHERE streamer_id = ?").get(streamer.id) as
    | { last_beat_at: number }
    | undefined;
  const elapsedMs = state ? now - state.last_beat_at : 0;

  if (typeof body.showing === "number" && state && elapsedMs >= MIN_BEAT_MS) {
    const credit = Math.min(MAX_CREDIT_SECONDS, Math.round(elapsedMs / 1000));
    db.prepare(
      `UPDATE bookings SET seconds_delivered = MIN(seconds_total, seconds_delivered + ?)
       WHERE id = ? AND streamer_id = ? AND status = 'approved'`,
    ).run(credit, body.showing, streamer.id);
    const done = db
      .prepare("UPDATE bookings SET status = 'completed' WHERE streamer_id = ? AND status = 'approved' AND seconds_delivered >= seconds_total")
      .run(streamer.id);
    // Fire and forget: the heartbeat response must not wait on Stripe.
    if (done.changes > 0) void settlePayouts(streamer.id).catch((e) => console.error("settlePayouts:", e));
  }
  if (!state || elapsedMs >= MIN_BEAT_MS) {
    db.prepare(
      "INSERT INTO overlay_state (streamer_id, last_beat_at) VALUES (?,?) ON CONFLICT(streamer_id) DO UPDATE SET last_beat_at = excluded.last_beat_at",
    ).run(streamer.id, now);
  }

  // Rotate: show the approved booking with the least airtime so far.
  const next = db
    .prepare(
      "SELECT * FROM bookings WHERE streamer_id = ? AND status = 'approved' ORDER BY seconds_delivered ASC, id ASC LIMIT 1",
    )
    .get(streamer.id) as Booking | undefined;

  return NextResponse.json(
    { ad: next ? { id: next.id, image: `/api/creative/${next.creative_file}`, company: next.company } : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
