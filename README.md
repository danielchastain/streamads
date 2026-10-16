# StreamAds (MVP)

A streamer logs in with Twitch, sets prices for ad slots, and puts one link in their bio. Advertisers pay on that
page; once the streamer approves the banner it rotates in an OBS browser-source overlay until the purchased
airtime is delivered.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Twitch/Stripe keys set, development mode gives you a username-only login and
skips payment (bookings are marked paid immediately). These shortcuts are disabled when `NODE_ENV=production`.

Try it: log in → add a slot → open `/<yourname>` in a private window → book it → approve it in the dashboard →
open the overlay URL in a browser tab and watch the delivered minutes climb.

## Going real

1. Copy `.env.example` to `.env.local`.
2. **Twitch:** create an app at https://dev.twitch.tv/console/apps, set the redirect URL to
   `<APP_URL>/api/auth/callback`, and fill `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`.
3. **Stripe:** add test keys. Forward webhooks locally with
   `stripe listen --forward-to localhost:3000/api/stripe/webhook` and copy the signing secret to
   `STRIPE_WEBHOOK_SECRET`.
4. Set a long random `SESSION_SECRET`.

## Deploy (public site)

The app stores data in SQLite and uploads on disk, so it needs a host with a **persistent volume** (Railway, Fly.io,
Render with a disk, or any VPS). Vercel-style serverless hosts will not work without swapping storage first.

1. Push this folder to a GitHub repo (the `Dockerfile` is included).
2. Create a service from the repo on Railway (or Fly.io) and attach a volume mounted at `/data`.
3. Set environment variables: `APP_URL` (your public https URL), `SESSION_SECRET`, `TWITCH_CLIENT_ID`,
   `TWITCH_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PLATFORM_FEE_PERCENT`.
4. In the Twitch console, set the OAuth redirect URL to `<APP_URL>/api/auth/callback`.
5. In Stripe, add a webhook endpoint `<APP_URL>/api/stripe/webhook` for `checkout.session.completed` and use its signing secret.
6. Point your domain at the service. Streamers then sign up at your URL, and their bio link is `<APP_URL>/<twitch-name>`.

## How delivery is counted

The overlay posts a heartbeat to `/api/overlay/<token>` every 10 s. Time since the previous heartbeat (max 30 s) is
credited to the ad that was on screen. When delivered seconds reach the purchased total, the booking completes.

## Payouts (Stripe Connect)

Streamers click "Set up payouts" on the dashboard, which creates a Stripe Express account and sends them through
Stripe's hosted onboarding. Advertisers pay your platform account; when a booking's airtime is fully delivered,
the streamer's share (price minus `PLATFORM_FEE_PERCENT`) is sent with a Stripe transfer. If the streamer hasn't
finished onboarding yet, the money waits and is sent as soon as the dashboard sees their account is active (it
re-checks on every load). Transfers are idempotent per booking.

Setup: enable Connect in your Stripe dashboard (test mode is fine). Stripe's processing fee comes out of your
platform share, not the streamer's. The Express account uses your platform's country by default.

## Not built yet (in rough priority order)

- **Refunds** on rejected bookings (currently manual in the Stripe dashboard).
- **Live detection.** Use Twitch EventSub `stream.online` / `stream.offline` so airtime only counts while live.
  Today it counts whenever the overlay page is open, so tell streamers to enable "Shutdown source when not visible".
- Audience stats on the public page (Helix API), email notifications, timed/scheduled slots, other ad formats.
- Storage is SQLite + local files in `data/`. Move to Postgres and S3/R2 before deploying to a serverless host.
