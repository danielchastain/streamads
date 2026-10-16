import { NextResponse } from "next/server";
import { getStreamer } from "@/lib/auth";
import { abs, STRIPE_ENABLED } from "@/lib/env";
import { startOnboarding } from "@/lib/payouts";

async function handle() {
  const streamer = await getStreamer();
  if (!streamer) return NextResponse.redirect(abs("/"), 303);
  if (!STRIPE_ENABLED) return NextResponse.redirect(abs("/dashboard?connect=unconfigured"), 303);
  try {
    return NextResponse.redirect(await startOnboarding(streamer), 303);
  } catch (err) {
    console.error("Connect onboarding failed:", err);
    return NextResponse.redirect(abs("/dashboard?connect=error"), 303);
  }
}

// POST from the dashboard button; GET is Stripe's refresh_url when an onboarding link expires.
export const POST = handle;
export const GET = handle;
