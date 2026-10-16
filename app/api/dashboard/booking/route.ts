import { NextResponse } from "next/server";
import { getStreamer, newToken } from "@/lib/auth";
import { db, type Booking } from "@/lib/db";
import { abs } from "@/lib/env";
import { refundBooking } from "@/lib/payouts";

export async function POST(req: Request) {
  const streamer = await getStreamer();
  if (!streamer) return NextResponse.redirect(abs("/"), 303);
  const form = await req.formData();
  const id = Number(form.get("id"));
  const intent = String(form.get("intent"));

  if (intent === "approve") {
    db.prepare("UPDATE bookings SET status = 'approved' WHERE id = ? AND streamer_id = ? AND status = 'pending_approval'").run(
      id,
      streamer.id,
    );
  } else if (intent === "reject") {
    const b = db
      .prepare("SELECT * FROM bookings WHERE id = ? AND streamer_id = ? AND status IN ('pending_approval','approved')")
      .get(id, streamer.id) as Booking | undefined;
    if (b) {
      db.prepare("UPDATE bookings SET status = 'rejected' WHERE id = ?").run(b.id);
      // Refund whatever airtime wasn't delivered back to the advertiser.
      await refundBooking(b);
    }
  } else if (intent === "regenerate_token") {
    db.prepare("UPDATE streamers SET overlay_token = ? WHERE id = ?").run(newToken(), streamer.id);
  }
  return NextResponse.redirect(abs("/dashboard"), 303);
}
