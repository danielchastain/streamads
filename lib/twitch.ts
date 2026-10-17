import { db, type Streamer } from "./db";
import { REQUIRE_LIVE, REQUIRE_VOD, TWITCH_ENABLED } from "./env";

// What Twitch says about a streamer right now. Uses the app's own token and public data only, so streamers
// don't have to grant anything extra. Cached briefly because the overlay pings every ~10 seconds.

const CACHE_MS = 60_000;
const STALE_OK_MS = 10 * 60_000; // if Twitch is unreachable, trust a recent answer this long
const VOD_GRACE_MS = 5 * 60_000; // a VOD can take a few minutes to appear after going live

export type StreamCheck = {
  checked: boolean; // false when Twitch couldn't be asked (dev account, no keys, API down with nothing cached)
  live: boolean | null;
  vod: boolean | null; // null = not live, or still inside the grace period
  vodId: string | null;
  vodCreatedAt: number | null;
  ok: boolean; // may airtime be credited right now?
  reason: "not_live" | "no_vod" | null;
  at: number;
};

// Overridable so tests can point at a fake Twitch.
const ID_BASE = process.env.TWITCH_ID_BASE ?? "https://id.twitch.tv";
const API_BASE = process.env.TWITCH_API_BASE ?? "https://api.twitch.tv/helix";

const cache = new Map<number, StreamCheck>();
let token: { value: string; expires: number } | null = null;

async function appToken(): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const res = await fetch(`${ID_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID!,
      client_secret: process.env.TWITCH_CLIENT_SECRET!,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`twitch token ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, expires: Date.now() + j.expires_in * 1000 };
  return token.value;
}

async function helix<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${await appToken()}`, "Client-Id": process.env.TWITCH_CLIENT_ID! },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 401) token = null; // expired early; fetch a new one next time
  if (!res.ok) throw new Error(`twitch ${res.status}`);
  return (await res.json()) as T;
}

export async function checkStream(streamer: Streamer): Promise<StreamCheck> {
  const now = Date.now();
  const unchecked: StreamCheck = { checked: false, live: null, vod: null, vodId: null, vodCreatedAt: null, ok: true, reason: null, at: now };
  if (!TWITCH_ENABLED || streamer.twitch_id.startsWith("dev-")) return unchecked;

  const hit = cache.get(streamer.id);
  if (hit && now - hit.at < CACHE_MS) return hit;

  try {
    const uid = encodeURIComponent(streamer.twitch_id);
    const streams = await helix<{ data: { id: string; started_at: string }[] }>(`/streams?user_id=${uid}`);
    const live = streams.data[0];

    let result: StreamCheck;
    if (!live) {
      result = { ...unchecked, checked: true, live: false, ok: !REQUIRE_LIVE, reason: REQUIRE_LIVE ? "not_live" : null };
    } else {
      const videos = await helix<{ data: { id: string; stream_id: string | null; created_at: string }[] }>(
        `/videos?user_id=${uid}&type=archive&first=10`,
      );
      const startedAt = Date.parse(live.started_at);
      // Match the VOD to this stream by id, or (if Twitch leaves the id empty) by start time.
      const vod = videos.data.find((v) => v.stream_id === live.id || Math.abs(Date.parse(v.created_at) - startedAt) < 120_000);
      const vodState = vod ? true : now - startedAt < VOD_GRACE_MS ? null : false;
      const blocked = REQUIRE_VOD && vodState === false;
      result = {
        checked: true,
        live: true,
        vod: vodState,
        vodId: vod?.id ?? null,
        vodCreatedAt: vod ? Date.parse(vod.created_at) : null,
        ok: !blocked,
        reason: blocked ? "no_vod" : null,
        at: now,
      };
    }
    cache.set(streamer.id, result);
    return result;
  } catch (err) {
    console.error("Twitch check failed:", err);
    if (hit && now - hit.at < STALE_OK_MS) return hit;
    return unchecked; // Twitch trouble must not cost streamers their airtime
  }
}

export type VideoInfo = { userId: string; type: string; startedAt: number; durationS: number };

/** "3h8m33s" -> seconds. */
function parseDuration(d: string): number {
  const m = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(d);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

/** Looks up one Twitch video by id (null if it doesn't exist or Twitch can't be asked). */
export async function getVideo(id: string): Promise<VideoInfo | null> {
  if (!TWITCH_ENABLED) return null;
  try {
    const r = await helix<{ data: { user_id: string; type: string; created_at: string; duration: string }[] }>(
      `/videos?id=${encodeURIComponent(id)}`,
    );
    const v = r.data[0];
    return v ? { userId: v.user_id, type: v.type, startedAt: Date.parse(v.created_at), durationS: parseDuration(v.duration) } : null;
  } catch (err) {
    console.error("Twitch video lookup failed:", err);
    return null;
  }
}

/** Saves the latest check so the dashboard and admin page can show it. */
export function persistCheck(streamerId: number, c: StreamCheck) {
  if (!c.checked) return;
  db.prepare("UPDATE overlay_state SET tw_live = ?, tw_vod = ?, tw_checked_at = ? WHERE streamer_id = ?").run(
    c.live ? 1 : 0,
    c.vod === null ? null : c.vod ? 1 : 0,
    c.at,
    streamerId,
  );
}
