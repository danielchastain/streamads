import { redirect } from "next/navigation";
import { getStreamer } from "@/lib/auth";
import { abs, FEE_PERCENT, IS_PROD, TWITCH_ENABLED } from "@/lib/env";

const ERRORS: Record<string, string> = {
  twitch_not_configured: "Twitch login isn't configured on this server yet.",
  bad_state: "Your login session expired. Please try again.",
  token_exchange: "Twitch didn't complete the login. Please try again.",
  user_lookup: "We couldn't read your Twitch profile. Please try again.",
  bad_login: "Enter a valid username.",
  access_denied: "You cancelled the Twitch login.",
};

const NEXT_STEPS = [
  { n: "01", title: "Connect Twitch", body: "One click. We create your page at a link with your Twitch name on it." },
  { n: "02", title: "Set your ad slots", body: `Choose your prices and minutes of airtime. You keep ${100 - FEE_PERCENT}% of each booking.` },
  { n: "03", title: "Share your link", body: "Put it in your bio and add the overlay to OBS. Brands do the rest." },
];

function TwitchGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.43l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}

export default async function AuthPage({
  mode,
  searchParams,
}: {
  mode: "signup" | "login";
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getStreamer()) redirect("/dashboard");
  const { error } = await searchParams;
  const signup = mode === "signup";

  return (
    <div className="home auth-wrap">
      <header className="nav">
        <a className="logo" href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <i />
          <strong>StreamAds</strong>
        </a>
        <nav>
          <a href="/#how">How it works</a>
          {signup ? <a href="/log-in">Log in</a> : <a href="/sign-up">Sign up</a>}
        </nav>
      </header>

      <div className="auth">
        <div className="auth-card">
          <span className="eyebrow"><span className="dot" /> {signup ? "Free for streamers" : "Welcome back"}</span>
          <h1>{signup ? "Create your StreamAds page" : "Log in to StreamAds"}</h1>
          <p className="muted" style={{ margin: "0 0 22px" }}>
            {signup
              ? "Sign up with your Twitch account. There's no password to create and no form to fill in."
              : "Use the Twitch account you signed up with."}
          </p>

          {error && <div className="flash">{ERRORS[error] ?? "Something went wrong."}</div>}

          {TWITCH_ENABLED ? (
            <a className="twitch-btn" href="/api/auth/twitch">
              <TwitchGlyph /> Continue with Twitch
            </a>
          ) : (
            <>
              <span className="twitch-btn disabled" aria-disabled="true">
                <TwitchGlyph /> Continue with Twitch
              </span>
              {IS_PROD ? (
                <p className="flash">Twitch login is not configured.</p>
              ) : (
                <div className="setup card">
                  <strong>Twitch isn&apos;t connected yet</strong>
                  <ol>
                    <li>
                      Create an app at <code>dev.twitch.tv/console/apps</code>
                    </li>
                    <li>
                      Set the OAuth redirect URL to <code>{abs("/api/auth/callback")}</code>
                    </li>
                    <li>
                      Put the client ID and secret in <code>.env.local</code> as <code>TWITCH_CLIENT_ID</code> and{" "}
                      <code>TWITCH_CLIENT_SECRET</code>, then restart
                    </li>
                  </ol>
                  <p className="muted small" style={{ margin: "0 0 10px" }}>Until then, use a dev login:</p>
                  <form className="stack" method="post" action="/api/auth/dev">
                    <input name="login" placeholder="mystreamer" required aria-label="Dev username" />
                    <button type="submit" className="ghost">Continue with dev login</button>
                  </form>
                </div>
              )}
            </>
          )}

          <p className="muted small" style={{ margin: "18px 0 0" }}>
            We only read your public Twitch profile (name and avatar). We can&apos;t post, chat or change anything on your
            channel.
          </p>
          <p className="muted small" style={{ margin: "10px 0 0" }}>
            {signup ? (
              <>Already have a page? <a href="/log-in">Log in</a></>
            ) : (
              <>New here? <a href="/sign-up">Create your page</a></>
            )}
          </p>
        </div>

        {signup && (
          <ol className="next">
            <li className="kicker" style={{ listStyle: "none" }}>{"// what happens next"}</li>
            {NEXT_STEPS.map((s) => (
              <li key={s.n}>
                <span className="n">{s.n}</span>
                <div>
                  <b>{s.title}</b>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
