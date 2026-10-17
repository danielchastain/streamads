import { NextResponse } from "next/server";
import { getStreamer } from "@/lib/auth";
import { db, type Booking } from "@/lib/db";
import { abs, TWITCH_ENABLED } from "@/lib/env";
import { settlePayouts } from "@/lib/payouts";
import { getVideo } from "@/lib/twitch";

const back = (result: string) => NextResponse.redirect(abs(`/dashboard?proof=${result}`), 303);

// A streamer sends a Twitch VOD link as proof that a booking aired (needed for a payout when the overlay didn't
// record proof by itself). The link is checked with Twitch: it must be one of THEIR recordings, from when the ad aired.
export async function POST(req: Request) {
  const streamer = await getStreamer();
  if (!streamer) return NextResponse.redirect(abs("/"), 303);

  const form = await req.formData();
  const id = Number(form.get("id"));
  const url = String(form.get("url") ?? "").trim();

  const b = db
    .prepare("SELECT * FROM bookings WHERE id = ? AND streamer_id = ? AND status IN ('approved','completed')")
    .get(id, streamer.id) as Booking | undefined;
  if (!b) return back("error");

  const m = /^https?:\/\/(?:www\.|m\.)?twitch\.tv\/videos\/(\d{3,})/i.exec(url);
  if (!m) return back("invalid");
  const vodId = m[1];

  // Dev accounts (no real Twitch) can't be verified; real accounts always are.
  const verify = TWITCH_ENABLED && !streamer.twitch_id.startsWith("dev-");
  if (verify) {
    const v = await getVideo(vodId);
    if (!v) return back("unverified"); // not found, or Twitch couldn't be reached
    if (v.userId !== streamer.twitch_id || v.type !== "archive") return back("notyours");
    // If we know when the ad last aired, the recording has to cover that moment.
    const at = b.last_credited_at;
    if (at && (at < v.startedAt - 60_000 || at > v.startedAt + v.durationS * 1000 + 60_000)) return back("wrongtime");
  }

  db.prepare(
    `INSERT INTO booking_proofs (booking_id, vod_id, offset_s, seconds, last_at, source) VALUES (?,?,?,?,?, 'manual')
     ON CONFLICT(booking_id, vod_id) DO NOTHING`,
  ).run(b.id, vodId, 0, 0, Date.now());
  // Pay it out now if its waiting period is already over (otherwise the periodic sweep does it later).
  void settlePayouts(streamer.id).catch((e) => console.error("settlePayouts:", e));
  return back("ok");
}
