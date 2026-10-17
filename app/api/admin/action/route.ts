import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/admin";
import { db, type Booking } from "@/lib/db";
import { abs, APP_URL } from "@/lib/env";
import { refundBooking, settlePayouts } from "@/lib/payouts";

const notFound = () => new NextResponse("Not found", { status: 404 });

export async function POST(req: Request) {
  // Re-check on every request: hiding buttons in the page is not security.
  const admin = await getAdmin();
  if (!admin) return notFound();

  // The session cookie is SameSite=Lax (cross-site POSTs don't carry it); this also rejects a foreign Origin.
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(APP_URL).origin) return new NextResponse("Forbidden", { status: 403 });

  const form = await req.formData();
  const id = Number(form.get("id"));
  const intent = String(form.get("intent"));
  if (!Number.isInteger(id)) return NextResponse.redirect(abs("/admin"), 303);

  if (intent === "disable_streamer" || intent === "enable_streamer") {
    if (id !== admin.id) {
      // (An admin can't lock themselves out.)
      db.prepare("UPDATE streamers SET disabled = ? WHERE id = ?").run(intent === "disable_streamer" ? 1 : 0, id);
    }
  } else if (intent === "reject_booking") {
    const b = db
      .prepare("SELECT * FROM bookings WHERE id = ? AND status IN ('pending_approval','approved')")
      .get(id) as Booking | undefined;
    if (b) {
      db.prepare("UPDATE bookings SET status = 'rejected' WHERE id = ?").run(b.id);
      await refundBooking(b);
    }
  } else if (intent === "hold_payout") {
    // Pause a finished booking's payout while you look into it (nothing happens once it's already paid).
    db.prepare(
      "UPDATE bookings SET payout_hold = 1 WHERE id = ? AND status = 'completed' AND (payout_status IS NULL OR payout_status = 'failed')",
    ).run(id);
  } else if (intent === "release_payout") {
    // Lift a hold and skip the waiting period; the payout goes out now if the streamer's Stripe account is ready.
    const b = db.prepare("SELECT streamer_id FROM bookings WHERE id = ? AND status = 'completed'").get(id) as
      | { streamer_id: number }
      | undefined;
    if (b) {
      db.prepare("UPDATE bookings SET payout_hold = 0, completed_at = 0, proof_waived = 1 WHERE id = ?").run(id);
      await settlePayouts(b.streamer_id).catch((err) => console.error("release payout:", err));
    }
  }
  return NextResponse.redirect(abs("/admin"), 303);
}
