export const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const IS_PROD = process.env.NODE_ENV === "production";
export const TWITCH_ENABLED = !!process.env.TWITCH_CLIENT_ID && !!process.env.TWITCH_CLIENT_SECRET;
export const STRIPE_ENABLED = !!process.env.STRIPE_SECRET_KEY;
/** Opt-in switch (works in production too): bookings skip payment and go straight to streamer approval. */
export const FREE_TEST_MODE = process.env.FREE_TEST_MODE === "true";
/** True when advertisers are actually sent to Stripe Checkout. */
export const PAYMENT_REQUIRED = STRIPE_ENABLED && !FREE_TEST_MODE;
export const FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT ?? 15);

/**
 * Airtime is only credited while the streamer is live on Twitch (REQUIRE_LIVE) and their stream is being saved
 * as a VOD (REQUIRE_VOD). On by default whenever real payments are on; off in FREE_TEST_MODE so you can test
 * without streaming. Set STREAM_CHECKS=true/false to override. When off, the checks still run and show on the
 * dashboard and admin page; they just don't block credit.
 */
export const STREAM_CHECKS = process.env.STREAM_CHECKS ? process.env.STREAM_CHECKS === "true" : !FREE_TEST_MODE;
export const REQUIRE_LIVE = process.env.REQUIRE_LIVE !== "false";
export const REQUIRE_VOD = process.env.REQUIRE_VOD !== "false";

/** Hours a finished booking's payout is held before it is sent to the streamer (time to spot cheating). */
const holdHours = Number(process.env.PAYOUT_HOLD_HOURS ?? 48);
export const PAYOUT_HOLD_HOURS = Number.isFinite(holdHours) && holdHours >= 0 ? holdHours : 48;

/** Twitch logins allowed into /admin (comma-separated, case-insensitive). Empty = nobody, so /admin is locked. */
export const ADMIN_LOGINS = (process.env.ADMIN_LOGINS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const abs = (path: string) => `${APP_URL}${path}`;

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (IS_PROD) throw new Error("SESSION_SECRET must be set in production");
  return "dev-only-secret";
}
