import { notFound } from "next/navigation";
import { db, type Slot, type Streamer } from "@/lib/db";
import { STRIPE_ENABLED } from "@/lib/env";
import PublicNav from "../public-nav";

const ERRORS: Record<string, string> = {
  invalid_details: "Please enter a valid email address and a company name.",
  invalid_link: "The website link must start with http:// or https://.",
  invalid_image: "Please upload a PNG, JPG, GIF or WebP image.",
  image_too_large: "That image is over 2 MB. Please upload a smaller one.",
};

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

const STEPS = [
  { n: "1", title: "Pick a slot", body: "Choose how many minutes of airtime you want." },
  { n: "2", title: "Upload your banner and pay", body: "Pay by card. You're only charged once, at checkout." },
  { n: "3", title: "The streamer reviews it", body: "They check your banner before it goes live." },
  { n: "4", title: "It plays on their stream", body: "Track the minutes delivered on your booking page." },
];

const FAQ = [
  {
    q: "What size should my banner be?",
    a: "It's shown in the bottom-left corner of the stream at up to 420×140 px. A wide image around 840×280 px (3:1) works best. PNG, JPG, GIF or WebP, up to 2 MB.",
  },
  {
    q: "When does my ad run?",
    a: "Your banner is shown while the streamer is live, until the minutes you bought are used up. If they have several sponsors, banners rotate.",
  },
  {
    q: "What if the streamer declines my banner?",
    a: "You get your money back for any airtime that wasn't delivered. If it never aired, that's the full amount.",
  },
  {
    q: "Do I need an account?",
    a: "No. After you pay you get a booking page with a link you can bookmark to see its progress.",
  },
];

export default async function StreamerPage({
  params,
  searchParams,
}: {
  params: Promise<{ login: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { login } = await params;
  const { error } = await searchParams;
  const streamer = db.prepare("SELECT * FROM streamers WHERE login = ?").get(login.toLowerCase()) as Streamer | undefined;
  if (!streamer) notFound();
  const slots = db.prepare("SELECT * FROM slots WHERE streamer_id = ? AND active = 1 ORDER BY price_cents").all(streamer.id) as Slot[];

  return (
    <div className="home">
      <PublicNav />
      <div className="adv-wrap">
        <section className="streamer-head">
          {streamer.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={streamer.avatar_url} alt="" width={84} height={84} className="avatar" />
          ) : (
            <div className="avatar ph">{streamer.display_name[0]?.toUpperCase()}</div>
          )}
          <div>
            <p className="kicker" style={{ margin: 0 }}>{"// advertise on"}</p>
            <h1>{streamer.display_name}</h1>
            <a href={`https://twitch.tv/${streamer.login}`} target="_blank" rel="noreferrer noopener">
              twitch.tv/{streamer.login}
            </a>
          </div>
        </section>
        <p className="lede" style={{ margin: "14px 0 24px", fontSize: 17 }}>
          Put your brand in front of {streamer.display_name}&apos;s live audience. Your banner appears in the corner of
          their stream, and you only pay for the airtime you book.
        </p>

        <ol className="how adv-how">
          {STEPS.map((s) => (
            <li key={s.n}>
              <b>{s.n}</b>
              <span>
                <strong>{s.title}</strong>
                <small>{s.body}</small>
              </span>
            </li>
          ))}
        </ol>

        {error && <div className="flash">{ERRORS[error] ?? "Something went wrong. Please try again."}</div>}

        <h2 className="adv-h">Choose an ad slot</h2>
        {slots.length === 0 && (
          <div className="card empty">
            <b>No ad slots are open right now</b>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {streamer.display_name} hasn&apos;t opened any ad slots yet. Check back soon.
            </p>
          </div>
        )}
        {slots.map((s) => (
          <details className="card slotcard" key={s.id} open={slots.length === 1}>
            <summary>
              <span className="slot-main">
                <b>{s.name}</b>
                <small>
                  {s.minutes} minutes on stream · {usd(Math.round(s.price_cents / s.minutes))} per minute
                </small>
              </span>
              <span className="slot-price">{usd(s.price_cents)}</span>
              <span className="btn sm">Book</span>
            </summary>
            <form className="book-form" method="post" action="/api/book" encType="multipart/form-data">
              <input type="hidden" name="slot_id" value={s.id} />

              <div className="fieldset">
                <p className="legend"><span className="num">1</span> About you</p>
                <div className="two">
                  <label>
                    Your email
                    <input name="email" type="email" placeholder="you@company.com" required />
                  </label>
                  <label>
                    Company or brand
                    <input name="company" maxLength={80} placeholder="Acme Energy" required />
                  </label>
                </div>
                <label>
                  Website (optional)
                  <input name="link" type="url" placeholder="https://acme.example" />
                </label>
              </div>

              <div className="fieldset">
                <p className="legend"><span className="num">2</span> Your banner</p>
                <label>
                  Upload an image (PNG, JPG, GIF or WebP, max 2 MB)
                  <input name="creative" type="file" accept="image/png,image/jpeg,image/gif,image/webp" required />
                </label>
                <p className="muted small" style={{ margin: 0 }}>
                  Shown at up to 420×140 px in the corner of the stream. A wide 3:1 image like 840×280 px works best.
                </p>
              </div>

              <div className="fieldset">
                <p className="legend"><span className="num">3</span> Review and pay</p>
                <div className="summary">
                  <div><span>{s.name}</span><span>{s.minutes} min</span></div>
                  <div className="total"><span>Total today</span><span>{usd(s.price_cents)}</span></div>
                </div>
                <button type="submit" className="big-pay">Pay {usd(s.price_cents)}</button>
                <p className="muted small" style={{ margin: "10px 0 0" }}>
                  {STRIPE_ENABLED
                    ? "Secure checkout by Stripe. We never see your card details. If the streamer declines your banner, you're refunded for any undelivered airtime."
                    : "Test mode: no payment is taken in this environment."}
                </p>
              </div>
            </form>
          </details>
        ))}

        <h2 className="adv-h">Good to know</h2>
        {FAQ.map((f) => (
          <details className="card faq" key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}

        <p className="muted small" style={{ textAlign: "center", marginTop: 32 }}>
          Are you a streamer? <a href="/sign-up">Sell ad space on your own stream with StreamAds</a>.
        </p>
      </div>
    </div>
  );
}
