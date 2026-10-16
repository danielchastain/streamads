import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  const sig = req.headers.get("stripe-signature");
  if (!secret || !key || !sig) return new NextResponse("Not configured", { status: 400 });

  const stripe = new Stripe(key);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), sig, secret);
  } catch {
    return new NextResponse("Bad signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid" && session.metadata?.booking_id) {
      const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
      db.prepare(
        "UPDATE bookings SET status = 'pending_approval', payment_intent = ? WHERE id = ? AND status = 'pending_payment' AND stripe_session_id = ?",
      ).run(pi, Number(session.metadata.booking_id), session.id);
    }
  }
  return NextResponse.json({ received: true });
}
