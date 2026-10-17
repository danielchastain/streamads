import { notFound } from "next/navigation";
import { getAdmin } from "@/lib/admin";
import { db, type Booking, type Proof } from "@/lib/db";
import { FEE_PERCENT, FREE_TEST_MODE, PAYOUT_HOLD_HOURS, STREAM_CHECKS } from "@/lib/env";
import { payoutNote } from "@/lib/payouts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false, follow: false } };

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const mins = (s: number) => Math.round(s / 60);
const when = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;

function ago(ms: number | null) {
  if (!ms) return "never";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

type StreamerRow = {
  id: number;
  login: string;
  display_name: string;
  created_at: number;
  payouts_enabled: number;
  disabled: number;
  slot_count: number;
  booking_count: number;
  earned: number | null;
  last_beat_at: number | null;
  tw_live: number | null;
  tw_vod: number | null;
  tw_checked_at: number | null;
};

type BookingRow = Booking & { login: string; payouts_enabled: number };

const vodTime = (s: number) =>
  `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m${String(s % 60).padStart(2, "0")}s`;

export default async function Admin() {
  const admin = await getAdmin();
  if (!admin) notFound(); // to everyone else this page simply doesn't exist

  const streamers = db
    .prepare(
      `SELECT s.id, s.login, s.display_name, s.created_at, s.payouts_enabled, s.disabled,
         (SELECT COUNT(*) FROM slots WHERE streamer_id = s.id AND active = 1) AS slot_count,
         (SELECT COUNT(*) FROM bookings WHERE streamer_id = s.id AND status != 'pending_payment') AS booking_count,
         (SELECT SUM(price_cents - fee_cents) FROM bookings WHERE streamer_id = s.id AND status = 'completed') AS earned,
         o.last_beat_at, o.tw_live, o.tw_vod, o.tw_checked_at
       FROM streamers s LEFT JOIN overlay_state o ON o.streamer_id = s.id
       ORDER BY s.created_at DESC`,
    )
    .all() as StreamerRow[];

  const bookings = db
    .prepare(
      `SELECT b.*, s.login, s.payouts_enabled
       FROM bookings b JOIN streamers s ON s.id = b.streamer_id
       WHERE b.status != 'pending_payment'
       ORDER BY b.id DESC LIMIT 200`,
    )
    .all() as BookingRow[];

  // VOD proof for the bookings on this page, grouped by booking.
  const proofsByBooking = new Map<number, Proof[]>();
  if (bookings.length > 0) {
    const ids = bookings.map((b) => b.id);
    const rows = db
      .prepare(`SELECT * FROM booking_proofs WHERE booking_id IN (${ids.map(() => "?").join(",")}) ORDER BY last_at DESC`)
      .all(...ids) as Proof[];
    for (const p of rows) proofsByBooking.set(p.booking_id, [...(proofsByBooking.get(p.booking_id) ?? []), p]);
  }

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS n,
         SUM(CASE WHEN status = 'pending_approval' THEN 1 ELSE 0 END) AS waiting,
         SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS on_air,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done,
         SUM(CASE WHEN status != 'rejected' THEN price_cents ELSE 0 END) AS volume,
         SUM(CASE WHEN status = 'completed' THEN fee_cents ELSE 0 END) AS fees,
         SUM(seconds_delivered) AS seconds
       FROM bookings WHERE status != 'pending_payment'`,
    )
    .get() as { n: number; waiting: number | null; on_air: number | null; done: number | null; volume: number | null; fees: number | null; seconds: number | null };

  const liveNow = streamers.filter((s) => s.last_beat_at && Date.now() - s.last_beat_at < 30_000).length;
  const [activeStreamers, disabledStreamers] = [streamers.filter((s) => !s.disabled), streamers.filter((s) => s.disabled)];

  return (
    <div className="home dash">
      <header className="nav">
        <a className="logo" href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <i /><strong>StreamAds</strong> <span className="pill" style={{ marginLeft: 8 }}>admin</span>
        </a>
        <nav>
          <a href="/dashboard">My dashboard</a>
          <form method="post" action="/api/auth/logout"><button className="ghost sm">Log out</button></form>
        </nav>
      </header>

      <div className="dash-inner admin">
        <h1 className="dash-title">Admin</h1>
        <p className="muted" style={{ margin: "0 0 12px" }}>
          Signed in as <strong>{admin.display_name}</strong>. Only Twitch logins listed in <code>ADMIN_LOGINS</code> can see this page.
        </p>
        {FREE_TEST_MODE && (
          <div className="flash">Free test mode is ON: bookings skip payment, so the money figures below are test data.</div>
        )}
        <p className="muted small" style={{ margin: "0 0 12px" }}>
          Airtime checks: {STREAM_CHECKS ? "ON (airtime counts only while live with VODs on)" : "recording only, not blocking"}. Payouts are
          held {PAYOUT_HOLD_HOURS} h after a booking completes.
        </p>

        <div className="stats">
          <div><b>{activeStreamers.length}</b><span>streamers{disabledStreamers.length ? ` (+${disabledStreamers.length} disabled)` : ""}</span></div>
          <div><b>{liveNow}</b><span>overlays connected now</span></div>
          <div><b>{totals.n}</b><span>bookings</span></div>
          <div><b className={totals.waiting ? "warn" : ""}>{totals.waiting ?? 0}</b><span>waiting for approval</span></div>
          <div><b>{totals.on_air ?? 0}</b><span>on air now</span></div>
          <div><b>{totals.done ?? 0}</b><span>completed</span></div>
          <div><b>{usd(totals.volume ?? 0)}</b><span>booked (not rejected)</span></div>
          <div><b>{usd(totals.fees ?? 0)}</b><span>your {FEE_PERCENT}% fee on completed</span></div>
        </div>
        <p className="muted small" style={{ margin: "8px 0 0" }}>{mins(totals.seconds ?? 0)} minutes of ads shown in total.</p>

        <h2 style={{ margin: "36px 0 12px" }}>Streamers ({streamers.length})</h2>
        <div className="admin-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Streamer</th><th>Joined</th><th>Overlay</th><th>Twitch</th><th>Slots</th><th>Bookings</th><th>Earned</th><th>Payouts</th><th></th>
              </tr>
            </thead>
            <tbody>
              {streamers.map((s) => {
                const live = !!s.last_beat_at && Date.now() - s.last_beat_at < 30_000;
                return (
                  <tr key={s.id} className={s.disabled ? "off" : ""}>
                    <td>
                      <a href={`/${s.login}`} target="_blank" rel="noreferrer noopener">{s.display_name}</a>
                      <div className="muted small">@{s.login}{s.disabled ? " · DISABLED" : ""}</div>
                    </td>
                    <td>{when(s.created_at)}</td>
                    <td>{live ? <span className="status done">● live</span> : <span className="muted">{ago(s.last_beat_at)}</span>}</td>
                    <td>
                      {s.tw_checked_at && Date.now() - s.tw_checked_at < 3 * 60_000 ? (
                        s.tw_live ? (
                          <span className={s.tw_vod === 0 ? "status todo" : "status done"}>
                            live · {s.tw_vod === 0 ? "NO VOD" : s.tw_vod === 1 ? "VOD on" : "VOD pending"}
                          </span>
                        ) : (
                          <span className="muted">not live</span>
                        )
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{s.slot_count}</td>
                    <td>{s.booking_count}</td>
                    <td>{usd(s.earned ?? 0)}</td>
                    <td>{s.payouts_enabled ? "connected" : "not set up"}</td>
                    <td>
                      {s.id !== admin.id && (
                        <form method="post" action="/api/admin/action">
                          <input type="hidden" name="id" value={s.id} />
                          {s.disabled ? (
                            <button name="intent" value="enable_streamer" className="ghost sm">Enable</button>
                          ) : (
                            <button name="intent" value="disable_streamer" className="danger sm">Disable</button>
                          )}
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {streamers.length === 0 && <tr><td colSpan={9} className="muted">No streamers yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ margin: "8px 0 0" }}>
          Disabling a streamer logs them out, hides their ad page, stops their overlay and blocks new bookings. Existing
          bookings are left as they are, so reject any you want refunded.
        </p>

        <h2 style={{ margin: "36px 0 12px" }}>Bookings (latest {bookings.length})</h2>
        <div className="admin-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th><th>Created</th><th>Streamer</th><th>Advertiser</th><th>Status</th><th>Price</th><th>Aired / proof</th><th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td><a href={`/booking/${b.id}`} target="_blank" rel="noreferrer noopener">{b.id}</a></td>
                  <td>{when(b.created_at)}</td>
                  <td>@{b.login}</td>
                  <td>
                    {b.company}
                    <div className="muted small">{b.advertiser_email}</div>
                  </td>
                  <td>
                    <span className="pill">{b.status.replace("_", " ")}</span>
                    {b.status === "completed" && (
                      <div className="muted small">{payoutNote(b, !!b.payouts_enabled, proofsByBooking.has(b.id))}</div>
                    )}
                  </td>
                  <td>{usd(b.price_cents)}</td>
                  <td>
                    {mins(b.seconds_delivered)} / {mins(b.seconds_total)} min
                    {(proofsByBooking.get(b.id) ?? []).slice(0, 3).map((p) => (
                      <div key={p.vod_id} className="small">
                        {p.source === "manual" ? (
                          <>
                            <a href={`https://www.twitch.tv/videos/${p.vod_id}`} target="_blank" rel="noreferrer noopener">VOD</a>
                            <span className="muted"> · sent by streamer (verified owner)</span>
                          </>
                        ) : (
                          <>
                            <a href={`https://www.twitch.tv/videos/${p.vod_id}?t=${vodTime(p.offset_s)}`} target="_blank" rel="noreferrer noopener">
                              VOD {vodTime(p.offset_s)}
                            </a>
                            <span className="muted"> · {Math.round(p.seconds / 60)} min</span>
                          </>
                        )}
                      </div>
                    ))}
                    {b.status !== "pending_approval" && b.seconds_delivered > 0 && !proofsByBooking.has(b.id) && (
                      <div className="muted small">no VOD proof recorded</div>
                    )}
                  </td>
                  <td>
                    {(b.status === "pending_approval" || b.status === "approved") && (
                      <form method="post" action="/api/admin/action">
                        <input type="hidden" name="id" value={b.id} />
                        <button name="intent" value="reject_booking" className="danger sm">Reject{FREE_TEST_MODE ? "" : " + refund"}</button>
                      </form>
                    )}
                    {b.status === "completed" && b.payout_status !== "paid" && b.payout_status !== "processing" && (
                      <form method="post" action="/api/admin/action">
                        <input type="hidden" name="id" value={b.id} />
                        {b.payout_hold ? (
                          <button name="intent" value="release_payout" className="ghost sm">Release payout</button>
                        ) : (
                          <>
                            <button name="intent" value="hold_payout" className="danger sm">Hold payout</button>{" "}
                            <button name="intent" value="release_payout" className="ghost sm">Release now</button>
                          </>
                        )}
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {bookings.length === 0 && <tr><td colSpan={8} className="muted">No bookings yet.</td></tr>}            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
