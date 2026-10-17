import { getStreamer } from "@/lib/auth";
import { FEE_PERCENT } from "@/lib/env";
import SlotDemo from "./slot-demo";

const ICONS = {
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  card: "M2 5h20v14H2zM2 10h20",
  check: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3",
  monitor: "M2 3h20v14H2zM8 21h8M12 17v4",
  dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  zap: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  arrow: "M5 12h14M13 6l6 6-6 6",
} as const;

function Icon({ name, size = 22 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

const FLOW = [
  { icon: "link", title: "Share your link", body: "Put your StreamAds page in your Twitch bio." },
  { icon: "card", title: "Brand pays", body: "They pick a slot, upload a banner and pay by card." },
  { icon: "check", title: "You approve", body: "Review the banner. Nothing airs without your OK." },
  { icon: "monitor", title: "It plays on stream", body: "Your OBS overlay shows it automatically." },
  { icon: "dollar", title: "You get paid", body: "Your share is sent to you through Stripe." },
] as const;

const TILES = [
  { icon: "shield", title: "Brands pay first", body: "Payment is collected before an ad is ever approved. No invoices to chase." },
  { icon: "check", title: "Approval on every ad", body: "See the banner before it goes live and reject anything that doesn't fit your channel." },
  { icon: "clock", title: "Airtime counted for you", body: "The overlay tracks how long each ad was actually on screen and stops when the purchase is used up." },
  { icon: "dollar", title: "Automatic payouts", body: "When an ad finishes its airtime, your share is transferred to your Stripe account." },
  { icon: "zap", title: "Fair rotation", body: "Several brands at once? The overlay rotates them so everyone gets their airtime." },
  { icon: "link", title: "One link, no setup for brands", body: "Advertisers don't need an account. They open your link, upload, and pay." },
] as const;

const FAQ = [
  { q: "What does it cost?", a: `Signing up is free and there's no monthly fee. We keep ${FEE_PERCENT}% of each booking; you receive the rest.` },
  { q: "Can I set my own prices?", a: "Yes. You decide what every slot costs, from a few dollars to hundreds. Brands pay exactly the price you set." },
  { q: "Can I choose the ad size and where it appears?", a: "Yes. Pick a preset or type any size up to the full 1920×1080 screen, then choose a corner or the top or bottom center. You can sell several slots, such as a small cheap one and a large premium one." },
  { q: "How do advertisers buy?", a: "They open your bio link, choose a slot, upload a banner and pay by card. They don't need an account." },
  { q: "What do I need in OBS?", a: "One Browser Source with your private overlay URL, set to 1920×1080. Each ad appears at the size and position you chose for its slot." },
  { q: "Can I turn an ad down?", a: "Yes. Every booking waits for your approval, and you can reject one at any time." },
  { q: "How do I get paid?", a: "You connect a Stripe account from your dashboard. When a booking's airtime is delivered, your share is transferred to it." },
];

export default async function Home() {
  const streamer = await getStreamer();

  const cta = streamer ? (
    <a className="btn big" href="/dashboard">Open your dashboard <Icon name="arrow" size={18} /></a>
  ) : (
    <a className="btn big" href="/sign-up">Sign up with Twitch <Icon name="arrow" size={18} /></a>
  );

  return (
    <div className="home">
      <header className="nav">
        <span className="logo"><i /><strong>StreamAds</strong></span>
        <nav>
          <a href="#how">How it works</a>
          <a href="#obs">OBS setup</a>
          <a href="#faq">FAQ</a>
          {streamer ? (
            <a className="btn" href="/dashboard">Dashboard</a>
          ) : (
            <>
              <a href="/log-in">Log in</a>
              <a className="btn" href="/sign-up">Sign up</a>
            </>
          )}
        </nav>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow"><span className="dot" /> Ad infrastructure for streamers</span>
          <h1>
            Sell ad space on your stream. <span className="grad">On autopilot.</span>
          </h1>
          <p className="lede">
            You set the price, the ad size and where it appears. Put one link in your Twitch bio, brands book and pay,
            you approve the banner, and it plays on your stream automatically.
          </p>
          <div className="cta-row">
            {cta}
            <a className="btn big ghost" href="#how">See how it works</a>
          </div>
        </div>

        <div className="mock" aria-hidden="true">
          <div className="screen">
            <div className="screen-bar">
              <span className="live"><i /> LIVE</span>
              <span className="tag">overlay / browser source</span>
            </div>
            <div className="ad">
              <div className="ad-logo">A</div>
              <div>
                <b>Acme Energy</b>
                <small>SPONSORED</small>
              </div>
            </div>
          </div>
          <div className="float a">
            <span className="ico"><Icon name="card" size={18} /></span>
            <span>
              New booking
              <small>Corner banner · <span className="amt">$25.00</span></small>
            </span>
            <span className="approve">Approve</span>
          </div>
          <div className="float b">
            <span className="ico"><Icon name="dollar" size={18} /></span>
            <span>
              Payout sent
              <small><span className="amt">$21.25</span> to your Stripe account</small>
            </span>
          </div>
          <span className="mock-note">illustrative preview</span>
        </div>
      </section>

      <div className="facts">
        <div className="fact"><b>{100 - FEE_PERCENT}%</b><span>of every booking is yours</span></div>
        <div className="fact"><b>$0</b><span>monthly fee</span></div>
        <div className="fact"><b>Your price</b><span>charge whatever you want</span></div>
        <div className="fact"><b>Any size</b><span>up to a full 1920×1080 screen</span></div>
      </div>

      <section id="how" className="section">
        <p className="kicker">// how it works</p>
        <h2>From bio link to payout</h2>
        <p className="sub">Five steps, and only two of them are yours: approve the banner and get paid.</p>
        <ol className="flow">
          {FLOW.map((s, i) => (
            <li key={s.title}>
              <span className="n">0{i + 1}</span>
              <div className="ic"><Icon name={s.icon} /></div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="control" className="section">
        <p className="kicker">// create your listing</p>
        <h2>Create your listing in a minute</h2>
        <p className="sub">
          A listing is one ad slot that brands can buy. You build it yourself in your dashboard, and nothing about it is
          fixed by us. Try it on the right.
        </p>
        <div className="split control">
          <div className="rules">
            <div className="rule">
              <b>1</b>
              <div>
                <strong>Name it, price it, time it</strong>
                <p>Call it whatever you like, charge $5 or $500, and choose how many minutes it covers. You keep {100 - FEE_PERCENT}% of what brands pay.</p>
              </div>
            </div>
            <div className="rule">
              <b>2</b>
              <div>
                <strong>Pick the ad size</strong>
                <p>Choose Small, Medium or Large, or type any size up to a full 1920×1080 screen. Sell a small banner cheap and a big one for more.</p>
              </div>
            </div>
            <div className="rule">
              <b>3</b>
              <div>
                <strong>Drag it where it goes</strong>
                <p>Put it in any corner, or top or bottom center, and see a live preview on a to-scale stream screen.</p>
              </div>
            </div>
            <div className="rule">
              <b>4</b>
              <div>
                <strong>Brands buy it from your link</strong>
                <p>Your listing goes on your StreamAds page. When a brand books it, you approve the banner, it plays on stream, and the ad stops when the minutes are used up.</p>
              </div>
            </div>
          </div>

          <SlotDemo
            feePercent={FEE_PERCENT}
            ctaHref={streamer ? "/dashboard" : "/sign-up"}
            ctaLabel={streamer ? "Create your listing in your dashboard" : "Sign up and create your listing"}
          />
        </div>
      </section>

      <section className="section">
        <p className="kicker">// built for streamers</p>
        <h2>You stay in control</h2>
        <p className="sub">The things that make selling your own ad space risky are handled for you.</p>
        <div className="bento">
          {TILES.map((t) => (
            <div className="tile" key={t.title}>
              <div className="ic"><Icon name={t.icon} /></div>
              <h3>{t.title}</h3>
              <p>{t.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="obs" className="section">
        <div className="split">
          <div>
            <p className="kicker">// setup</p>
            <h2>Add it to OBS in under a minute</h2>
            <p className="sub" style={{ marginBottom: 0 }}>
              Your dashboard gives you a private overlay URL. Add it once and every approved ad shows up on its own.
            </p>
            <ul className="ticks">
              <li>Works with OBS, Streamlabs and any app that supports browser sources</li>
              <li>Transparent background, so it sits cleanly over your scene</li>
              <li>Regenerate the URL any time if you need to</li>
            </ul>
          </div>
          <div className="term" aria-hidden="true">
            <div className="term-bar"><i /><i /><i /><span>OBS · Add Source · Browser</span></div>
            <div className="term-body">
              <div><span className="k">URL</span><span className="v hl">https://your-site/overlay/••••••••••••</span></div>
              <div><span className="k">Width</span><span className="v">1920</span></div>
              <div><span className="k">Height</span><span className="v">1080</span></div>
              <div className="rule" />
              <div><span className="k">Status</span><span className="v" style={{ color: "var(--ok)" }}>● connected</span><span className="cursor" style={{ marginLeft: 8 }} /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="adv-card">
          <div>
            <h2>Want to advertise on a stream?</h2>
            <p>
              There&apos;s nothing to sign up for. Open the streamer&apos;s link from their Twitch bio, choose an ad slot,
              upload your banner and pay. It goes live once they approve it.
            </p>
          </div>
        </div>
      </section>

      <section id="faq" className="section">
        <p className="kicker">// faq</p>
        <h2>Questions</h2>
        <div style={{ marginTop: 24 }}>
          {FAQ.map((f) => (
            <details className="card faq" key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="final">
        <h2>Turn your viewers into <span className="grad">revenue</span></h2>
        {cta}
      </section>

      <footer className="foot muted small">© StreamAds · Not affiliated with Twitch or Stripe.</footer>
    </div>
  );
}
