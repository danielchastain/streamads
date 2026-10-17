import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/admin";
import { db, type Booking } from "@/lib/db";
import { abs, APP_URL } from "@/lib/env";
import { refundBooking } from "@/lib/payouts";

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
  }
  return NextResponse.redirect(abs("/admin"), 303);
}
