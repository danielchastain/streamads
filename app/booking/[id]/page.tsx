import { notFound } from "next/navigation";
import { db, type Booking, type Proof, type Slot, type Streamer } from "@/lib/db";
import { PAYMENT_REQUIRED } from "@/lib/env";
import AutoRefresh from "../../dashboard/AutoRefresh";
import PublicNav from "../../public-nav";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

// "1h02m05s": Twitch's format for a start time in a VOD link, also readable for people.
function vodTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${String(m).padStart(2, "0")}m${String(s % 60).padStart(2, "0")}s`;
}

function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

type Stage = { label: string; hint: string };
const STAGES: Stage[] = [
  { label: "Paid", hint: "Payment received" },
  { label: "Approved", hint: "Streamer reviewed your banner" },
  { label: "On air", hint: "Showing on stream" },
  { label: "Complete", hint: "All minutes delivered" },
];

// Index of the current stage (0-based); stages before it are complete.
function stageIndex(b: Booking): number {
  if (b.status === "pending_payment") return -1;
  if (b.status === "pending_approval") return 0;
  if (b.status === "approved") return b.seconds_delivered > 0 ? 2 : 1;
  if (b.status === "completed") return 3;
  return -2;
}

const HEADLINE: Record<string, { title: string; body: string }> = {
  pending_payment: { title: "Waiting for your payment", body: "We haven't received your payment yet. This page updates as soon as it arrives." },
  pending_approval: { title: "Waiting for the streamer to approve", body: "Your payment is in. The streamer is reviewing your banner, and it goes live as soon as they approve it." },
  approved: { title: "Approved, you're in the rotation", body: "Your banner will show whenever the streamer is live, until your minutes are used up." },
  completed: { title: "Campaign complete", body: "All the minutes you bought have been shown on stream. Thanks for advertising." },
};

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = db.prepare("SELECT * FROM bookings WHERE id = ?").get(Number(id)) as Booking | undefined;
  if (!b) notFound();
  const s = db.prepare("SELECT * FROM streamers WHERE id = ?").get(b.streamer_id) as Streamer;
  const slot = db.prepare("SELECT * FROM slots WHERE id = ?").get(b.slot_id) as Slot;

  const proofs = db
    .prepare("SELECT * FROM booking_proofs WHERE booking_id = ? ORDER BY last_at DESC LIMIT 10")
    .all(b.id) as Proof[];

  const stage = stageIndex(b);
  const rejected = b.status === "rejected";
  const head = rejected ? null : HEADLINE[b.status];
  const pct = Math.round((b.seconds_delivered / b.seconds_total) * 100);
  const shownMin = Math.floor(b.seconds_delivered / 60);
  const totalMin = Math.round(b.seconds_total / 60);

  return (
    <div className="home">
      {!rejected && b.status !== "completed" && <AutoRefresh seconds={15} />}
      <PublicNav />
      <div className="adv-wrap narrow">
        <p className="kicker" style={{ margin: "0 0 6px" }}>{`// booking #${b.id}`}</p>
        <h1 className="dash-title" style={{ fontSize: 30 }}>
          {rejected ? "The streamer declined this banner" : head!.title}
        </h1>
        <p className="muted" style={{ margin: "0 0 24px" }}>
          {rejected
            ? PAYMENT_REQUIRED
              ? b.refund_id
                ? "Your refund has been issued for the airtime that wasn't delivered. It can take 5–10 business days to show on your statement."
                : "Your refund for the airtime that wasn't delivered is being processed."
              : "This is test mode, so no payment was taken."
            : head!.body}
        </p>

        {!rejected && (
          <ol className="stages">
            {STAGES.map((st, i) => {
              const state = i < stage || (b.status === "completed" && i <= stage) ? "done" : i === stage ? "now" : "next";
              return (
                <li key={st.label} className={state}>
                  <span className="dot2">{state === "done" ? "✓" : i + 1}</span>
                  <b>{st.label}</b>
                  <small>{st.hint}</small>
                </li>
              );
            })}
          </ol>
        )}

        <section className="card">
          <div className="booking-body" style={{ marginTop: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="creative" src={`/api/creative/${b.creative_file}`} alt={`${b.company} banner`} />
            <div>
              <p style={{ margin: 0 }}>
                <strong>{b.company}</strong> on <a href={`/${s.login}`}>{s.display_name}</a>
              </p>
              <p className="muted small" style={{ margin: "2px 0 10px" }}>
                {slot?.name ?? "Ad slot"} · {totalMin} minutes
              </p>
              <div className="bar big"><i style={{ width: `${pct}%` }} /></div>
              <p className="muted small" style={{ margin: 0 }}>
                {shownMin} of {totalMin} minutes shown on stream
              </p>
            </div>
          </div>
        </section>

        {(b.last_credited_at || proofs.length > 0) && (
          <section className="card">
            <p style={{ margin: 0 }}>
              <strong>Proof it aired</strong>
              {b.last_credited_at && <span className="muted small"> · last on air {ago(b.last_credited_at)}</span>}
            </p>
            {proofs.length > 0 ? (
              <>
                <p className="muted small" style={{ margin: "4px 0 8px" }}>
                  Airtime is only counted while the streamer is live on Twitch and saving the stream. Watch the recording
                  from the moment your banner first appeared:
                </p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {proofs.map((p) => (
                    <li key={p.vod_id} className="small">
                      <a href={`https://www.twitch.tv/videos/${p.vod_id}?t=${vodTime(p.offset_s)}`} target="_blank" rel="noreferrer noopener">
                        Stream recording from {vodTime(p.offset_s)}
                      </a>
                      <span className="muted"> · {Math.round(p.seconds / 60)} min counted</span>
                    </li>
                  ))}
                </ul>
                <p className="muted small" style={{ margin: "8px 0 0" }}>
                  Twitch keeps recordings for a limited time, so check soon after your ad airs.
                </p>
              </>
            ) : (
              <p className="muted small" style={{ margin: "4px 0 0" }}>Recording links appear here once your ad has aired.</p>
            )}
          </section>
        )}

        <section className="card receipt">
          <div><span>Amount</span><span>{usd(b.price_cents)}</span></div>
          <div><span>Booked</span><span>{new Date(b.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}</span></div>
          <div><span>Booked by</span><span>{b.advertiser_email}</span></div>
        </section>

        <p className="muted small" style={{ marginTop: 18 }}>
          Bookmark this page. It&apos;s how you check on your ad, and it updates automatically.
          {!rejected && b.status !== "completed" && <> Want more airtime? <a href={`/${s.login}`}>Book another slot</a>.</>}
        </p>
      </div>
    </div>
  );
}
