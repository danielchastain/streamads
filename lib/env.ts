export const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const IS_PROD = process.env.NODE_ENV === "production";
export const TWITCH_ENABLED = !!process.env.TWITCH_CLIENT_ID && !!process.env.TWITCH_CLIENT_SECRET;
export const STRIPE_ENABLED = !!process.env.STRIPE_SECRET_KEY;
/** Opt-in switch (works in production too): bookings skip payment and go straight to streamer approval. */
export const FREE_TEST_MODE = process.env.FREE_TEST_MODE === "true";
/** True when advertisers are actually sent to Stripe Checkout. */
export const PAYMENT_REQUIRED = STRIPE_ENABLED && !FREE_TEST_MODE;
export const FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT ?? 15);

export const abs = (path: string) => `${APP_URL}${path}`;

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (IS_PROD) throw new Error("SESSION_SECRET must be set in production");
  return "dev-only-secret";
}
