import { redirect } from "next/navigation";
import { isAdminLogin } from "@/lib/admin";
import { getStreamer } from "@/lib/auth";
import { db, type Booking, type Slot } from "@/lib/db";
import { abs, FEE_PERCENT, IS_PROD, STREAM_CHECKS, STRIPE_ENABLED } from "@/lib/env";
import { payoutNote, refreshConnectStatus } from "@/lib/payouts";
import AutoRefresh from "./AutoRefresh";
import CopyField from "./CopyField";
import SlotForm from "./SlotForm";
import { POSITION_LABEL } from "@/lib/ad-geometry";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const mins = (s: number) => Math.round(s / 60);

const CONNECT_MSG: Record<string, string> = {
  unconfigured: IS_PROD
    ? "Payouts aren't available on this site yet. Please check back soon."
    : "Stripe keys aren't set on this server yet. Add STRIPE_SECRET_KEY to .env.local and restart to turn payouts on.",
  error: "We couldn't start Stripe setup. Please try again in a moment.",
};

function Status({ done }: { done: boolean }) {
  return <span className={`status ${done ? "done" : "todo"}`}>{done ? "Done" : "To do"}</span>;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ connect?: string; welcome?: string }> }) {
  let streamer = await getStreamer();
  if (!streamer) redirect("/");
  const { connect, welcome } = await searchParams;

  const slots = db.prepare("SELECT * FROM slots WHERE streamer_id = ? AND active = 1 ORDER BY id").all(streamer.id) as Slot[];
  const bookings = db
    .prepare("SELECT * FROM bookings WHERE streamer_id = ? AND status != 'pending_payment' ORDER BY id DESC")
    .all(streamer.id) as Booking[];

  // Pick up Stripe onboarding completion and retry waiting payouts, only when there's something to do.
  const owedPayout = bookings.some((b) => b.status === "completed" && b.payout_status !== "paid");
  if (STRIPE_ENABLED && streamer.stripe_account_id && (!streamer.payouts_enabled || owedPayout)) {
    try {
      await refreshConnectStatus(streamer);
      streamer = (await getStreamer())!;
    } catch (err) {
      console.error("refreshConnectStatus:", err);
    }
  }

  const beat = db.prepare("SELECT * FROM overlay_state WHERE streamer_id = ?").get(streamer.id) as
    | { last_beat_at: number; tw_live: number | null; tw_vod: number | null; tw_checked_at: number | null }
    | undefined;
  const overlayLive = !!beat && Date.now() - beat.last_beat_at < 30_000;
  const overlaySeen = !!beat;
  // What Twitch said at the last check (only fresh while the overlay is running).
  const twFresh = !!beat?.tw_checked_at && Date.now() - beat.tw_checked_at < 3 * 60_000;
  const twNotLive = twFresh && beat!.tw_live === 0;
  const twNoVod = twFresh && beat!.tw_live === 1 && beat!.tw_vod === 0;
  const twGood = twFresh && beat!.tw_live === 1 && beat!.tw_vod !== 0;

  const hasSlots = slots.length > 0;
  const payoutsOn = !!streamer.payouts_enabled;
  const doneCount = [hasSlots, overlaySeen, payoutsOn].filter(Boolean).length;

  const pending = bookings.filter((b) => b.status === "pending_approval");
  const onAir = bookings.filter((b) => b.status === "approved");
  const finished = bookings.filter((b) => b.status === "completed");
  const rejected = bookings.filter((b) => b.status === "rejected");
  const earned = bookings.filter((b) => b.status !== "rejected").reduce((sum, b) => sum + b.price_cents - b.fee_cents, 0);
  const delivered = bookings.reduce((sum, b) => sum + b.seconds_delivered, 0);

  const pageUrl = abs(`/${streamer.login}`);
  const overlayUrl = abs(`/overlay/${streamer.overlay_token}`);

  const bookingCard = (b: Booking) => (
    <div className={`card booking ${b.status === "pending_approval" ? "needs" : ""}`} key={b.id}>
      <div className="row">
        <strong>{b.company}</strong>
        <span className="pill">
          {b.status.replace("_", " ")}
          {b.status === "completed" && ` · ${payoutNote(b, !!streamer.payouts_enabled)}`}
        </span>
      </div>
      <div className="booking-body">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="creative" src={`/api/creative/${b.creative_file}`} alt={`${b.company} banner`} />
        <div>
          <p className="muted" style={{ margin: "0 0 4px" }}>
            Paid <strong style={{ color: "var(--text)" }}>{usd(b.price_cents)}</strong> · you receive{" "}
            <strong style={{ color: "var(--ok)" }}>{usd(b.price_cents - b.fee_cents)}</strong>
          </p>
          <p className="muted small" style={{ margin: "0 0 8px" }}>
            {b.advertiser_email}
            {b.link_url && (
              <>
                {" · "}
                <a href={b.link_url} target="_blank" rel="noreferrer noopener">their website</a>
              </>
            )}
          </p>
          <div className="bar"><i style={{ width: `${Math.round((b.seconds_delivered / b.seconds_total) * 100)}%` }} /></div>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            {mins(b.seconds_delivered)} of {mins(b.seconds_total)} min shown on stream
          </p>
        </div>
      </div>
      {(b.status === "pending_approval" || b.status === "approved") && (
        <form method="post" action="/api/dashboard/booking" className="row" style={{ justifyContent: "flex-start", marginTop: 12 }}>
          <input type="hidden" name="id" value={b.id} />
          {b.status === "pending_approval" && <button name="intent" value="approve">Approve and put on air</button>}
          <button name="intent" value="reject" className="danger">{b.status === "approved" ? "Stop and reject" : "Reject"}</button>
        </form>
      )}
    </div>
  );

  return (
    <div className="home dash">
      <AutoRefresh seconds={15} />
      <header className="nav">
        <a className="logo" href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <i /><strong>StreamAds</strong>
        </a>
        <nav>
          {isAdminLogin(streamer.login) && <a href="/admin">Admin</a>}
          <a href={`/${streamer.login}`} target="_blank" rel="noreferrer">View my ad page</a>
          <form method="post" action="/api/auth/logout"><button className="ghost sm">Log out</button></form>
        </nav>
      </header>

      <div className="dash-inner">
        <h1 className="dash-title">Hi, {streamer.display_name}</h1>
        <p className="muted" style={{ margin: "0 0 20px" }}>
          This is your control room for selling ad space on your stream.
        </p>

        {welcome && (
          <div className="flash ok">
            <strong>You&apos;re in.</strong> Follow the three setup steps below. It takes about five minutes, and then
            brands can start booking you.
          </div>
        )}
        {connect && CONNECT_MSG[connect] && <div className="flash">{CONNECT_MSG[connect]}</div>}

        <ol className="how">
          <li><b>1</b>Brands open your link and buy a slot</li>
          <li><b>2</b>You approve their banner</li>
          <li><b>3</b>It plays on your stream automatically</li>
          <li><b>4</b>You get paid</li>
        </ol>

        <section className="card hero-card">
          <p className="kicker" style={{ margin: 0 }}>{"// your ad page"}</p>
          <h2 style={{ margin: "4px 0 6px" }}>This is the link you share</h2>
          <p className="muted" style={{ margin: "0 0 14px" }}>
            Paste it in your Twitch bio and panels. Anyone who opens it can see your ad slots and buy one. They don&apos;t
            need an account.
          </p>
          <CopyField value={pageUrl} />
        </section>

        <div className="stats">
          <div><b>{usd(earned)}</b><span>earned after the {FEE_PERCENT}% fee</span></div>
          <div><b className={pending.length ? "warn" : ""}>{pending.length}</b><span>waiting for your approval</span></div>
          <div><b>{onAir.length}</b><span>on air now</span></div>
          <div><b>{mins(delivered)}</b><span>minutes of ads shown</span></div>
        </div>

        <div className="row" style={{ margin: "36px 0 12px" }}>
          <h2 style={{ margin: 0 }}>Get set up</h2>
          <span className="muted small">{doneCount} of 3 done</span>
        </div>
        <div className="bar big"><i style={{ width: `${(doneCount / 3) * 100}%` }} /></div>

        <details className="card step" open={!hasSlots}>
          <summary>
            <span className="num">1</span>
            <span className="step-title">
              <b>Create your ad slots</b>
              <small>Decide what you&apos;re selling and what it costs</small>
            </span>
            <Status done={hasSlots} />
          </summary>
          <div className="step-body">
            <p className="muted">
              An <strong>ad slot</strong> is a product brands can buy. <strong>You choose everything about it:</strong>{" "}
              the price, how many minutes it runs, how big the ad is, and where on your stream it appears. For example,{" "}
              <em>&ldquo;Corner banner, 30 minutes, $25, 480×160 in the bottom left&rdquo;</em>. The banner is shown
              whenever you&apos;re live until the minutes are used up. Add as many slots as you like, such as a small
              cheap one and a large premium one.
            </p>
            {slots.map((s) => (
              <div className="slot" key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <span className="muted small">
                    {" "}· {s.minutes} min · {s.width}×{s.height}px, {POSITION_LABEL[s.position]} ·{" "}
                    {usd(Math.round(s.price_cents / s.minutes))}/min
                  </span>
                </div>
                <div className="row" style={{ gap: 14 }}>
                  <strong>{usd(s.price_cents)}</strong>
                  <form method="post" action="/api/dashboard/slot">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={s.id} />
                    <button className="danger sm" type="submit">Remove</button>
                  </form>
                </div>
              </div>
            ))}
            <h3 className="sb-title">Add a slot</h3>
            <SlotForm />
          </div>
        </details>

        <details className="card step" open={hasSlots && !overlaySeen}>
          <summary>
            <span className="num">2</span>
            <span className="step-title">
              <b>Add the overlay to OBS</b>
              <small>This is what shows the ads on your stream</small>
            </span>
            {overlayLive ? <span className="status done">● Connected</span> : <Status done={overlaySeen} />}
          </summary>
          <div className="step-body">
            <p className="muted">
              The overlay is a transparent web page that displays whichever ad is booked. You add it to OBS once and
              never touch it again. Each ad appears at the size and position you chose for its slot.
            </p>
            <ol className="howto">
              <li>In OBS, under <strong>Sources</strong>, click <strong>+</strong> and choose <strong>Browser</strong>.</li>
              <li>Paste this URL (keep it private, it&apos;s unique to you):</li>
            </ol>
            <CopyField value={overlayUrl} secret />
            <ol className="howto" start={3}>
              <li>Set Width to <code>1920</code> and Height to <code>1080</code>, then click OK.</li>
              <li>This page will show <strong>● Connected</strong> as soon as OBS loads it.</li>
            </ol>
            <p className={`overlay-state ${overlayLive ? "live" : ""}`}>
              {overlayLive
                ? "● Your overlay is connected and ready."
                : overlaySeen
                  ? "Your overlay was connected before but isn't loading right now."
                  : "Waiting for your overlay to connect…"}
            </p>
            {twFresh && (
              <p className={`overlay-state ${twGood || !STREAM_CHECKS ? "live" : ""}`}>
                {twNotLive &&
                  (STREAM_CHECKS
                    ? "You're not live on Twitch right now. Ads only earn airtime while you're live."
                    : "You're not live on Twitch. (Test mode: airtime still counts, but once real payments are on it only counts while you're live.)")}
                {twNoVod &&
                  (STREAM_CHECKS
                    ? "You're live but Twitch isn't saving this stream as a VOD, so airtime isn't counting. Turn on Settings → Stream → Store past broadcasts."
                    : "You're live but Twitch isn't saving a VOD. Turn on Settings → Stream → Store past broadcasts; once real payments are on, airtime only counts with VODs on.")}
                {twGood && "● Live on Twitch with VODs on. Your airtime is counting."}
                {twFresh && beat!.tw_live === 1 && beat!.tw_vod === null && "● Live on Twitch. Checking that your VOD is being saved…"}
              </p>
            )}
            <p className="muted small" style={{ margin: "6px 0 0" }}>
              For advertisers to trust their airtime, ads count only while you&apos;re live on Twitch with{" "}
              <strong>Store past broadcasts</strong> turned on (Twitch → Settings → Stream).
            </p>
            <details className="more">
              <summary>Need a new overlay URL?</summary>
              <p className="muted small">
                If the URL leaked, you can replace it. The old one stops working immediately, so you&apos;ll need to
                paste the new one into OBS.
              </p>
              <form method="post" action="/api/dashboard/booking">
                <input type="hidden" name="intent" value="regenerate_token" />
                <button className="ghost sm" type="submit">Replace my overlay URL</button>
              </form>
            </details>
          </div>
        </details>

        <details className="card step" open={hasSlots && overlaySeen && !payoutsOn}>
          <summary>
            <span className="num">3</span>
            <span className="step-title">
              <b>Connect payouts</b>
              <small>So we know where to send your money</small>
            </span>
            <Status done={payoutsOn} />
          </summary>
          <div className="step-body">
            {payoutsOn ? (
              <p className="muted" style={{ margin: 0 }}>
                Your Stripe account is connected. When a brand&apos;s minutes are fully shown, your share is sent to it
                automatically.
              </p>
            ) : (
              <>
                <p className="muted">
                  Brands pay us up front. When their ad finishes playing, we send you your share ({100 - FEE_PERCENT}%).
                  Payouts go through Stripe, so you&apos;ll set up a short Stripe profile with your bank details. Until
                  then, money from finished ads is held safely for you.
                </p>
                <form method="post" action="/api/connect/onboard">
                  <button type="submit">{streamer.stripe_account_id ? "Continue Stripe setup" : "Set up payouts with Stripe"}</button>
                </form>
              </>
            )}
          </div>
        </details>

        <h2 style={{ margin: "40px 0 12px" }}>Bookings</h2>
        {bookings.length === 0 && (
          <div className="card empty">
            <b>No bookings yet</b>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              When a brand books one of your slots, it shows up here. You&apos;ll see their banner and can approve it
              with one click. Share your link above to get your first one.
            </p>
          </div>
        )}
        {pending.length > 0 && (
          <>
            <h3 className="group needs-title">Needs your approval ({pending.length})</h3>
            {pending.map(bookingCard)}
          </>
        )}
        {onAir.length > 0 && (
          <>
            <h3 className="group">On air</h3>
            {onAir.map(bookingCard)}
          </>
        )}
        {finished.length > 0 && (
          <>
            <h3 className="group">Finished</h3>
            {finished.map(bookingCard)}
          </>
        )}
        {rejected.length > 0 && (
          <>
            <h3 className="group">Rejected</h3>
            {rejected.map(bookingCard)}
          </>
        )}
      </div>
    </div>
  );
}
