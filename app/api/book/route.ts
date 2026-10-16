import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db, UPLOAD_DIR, type Slot, type Streamer } from "@/lib/db";
import { abs, FEE_PERCENT, IS_PROD, STRIPE_ENABLED } from "@/lib/env";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

function back(login: string, error: string) {
  return NextResponse.redirect(abs(`/${login}?error=${error}`), 303);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const slot = db.prepare("SELECT * FROM slots WHERE id = ? AND active = 1").get(Number(form.get("slot_id"))) as Slot | undefined;
  if (!slot) return NextResponse.redirect(abs("/"), 303);
  const streamer = db.prepare("SELECT * FROM streamers WHERE id = ?").get(slot.streamer_id) as Streamer;

  const email = String(form.get("email") ?? "").trim();
  const company = String(form.get("company") ?? "").trim().slice(0, 80);
  let link = String(form.get("link") ?? "").trim();
  const file = form.get("creative");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !company) return back(streamer.login, "invalid_details");
  if (link) {
    try {
      const u = new URL(link);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
      link = u.toString();
    } catch {
      return back(streamer.login, "invalid_link");
    }
  }
  if (!(file instanceof File) || !TYPES[file.type]) return back(streamer.login, "invalid_image");
  if (file.size > MAX_BYTES) return back(streamer.login, "image_too_large");

  const creativeFile = `${randomBytes(16).toString("hex")}.${TYPES[file.type]}`;
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, creativeFile),Buffer.from(await file.arrayBuffer()));

  const fee = Math.round((slot.price_cents * FEE_PERCENT) / 100);
  const r = db
    .prepare(
      `INSERT INTO bookings (slot_id, streamer_id, advertiser_email, company, link_url, creative_file, price_cents, fee_cents, seconds_total, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,'pending_payment',?)`,
    )
    .run(slot.id, streamer.id, email, company, link || null, creativeFile, slot.price_cents, fee, slot.minutes * 60, Date.now());
  const bookingId = Number(r.lastInsertRowid);

  if (STRIPE_ENABLED) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: slot.price_cents,
            product_data: { name: `${slot.name} on ${streamer.display_name}'s stream (${slot.minutes} min)` },
          },
        },
      ],
      metadata: { booking_id: String(bookingId) },
      success_url: abs(`/booking/${bookingId}?paid=1`),
      cancel_url: abs(`/${streamer.login}`),
    });
    db.prepare("UPDATE bookings SET stripe_session_id = ? WHERE id = ?").run(session.id, bookingId);
    return NextResponse.redirect(session.url!, 303);
  }

  // No Stripe keys: dev-only shortcut that marks the booking as paid.
  if (IS_PROD) return new NextResponse("Payments are not configured", { status: 503 });
  db.prepare("UPDATE bookings SET status = 'pending_approval' WHERE id = ?").run(bookingId);
  return NextResponse.redirect(abs(`/booking/${bookingId}?paid=1`), 303);
}
