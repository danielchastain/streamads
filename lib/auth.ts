import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db, type Streamer } from "./db";
import { IS_PROD, sessionSecret } from "./env";

export const SESSION_COOKIE = "sa_session";
export const STATE_COOKIE = "sa_oauth_state";
const MAX_AGE = 60 * 60 * 24 * 30;

const sign = (value: string) => createHmac("sha256", sessionSecret()).update(value).digest("base64url");

export function makeSessionValue(streamerId: number): string {
  const payload = `${streamerId}.${Date.now() + MAX_AGE * 1000}`;
  return `${payload}.${sign(payload)}`;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: IS_PROD,
  path: "/",
  maxAge: MAX_AGE,
};

function parseSession(value: string | undefined): number | null {
  if (!value) return null;
  const [id, exp, sig] = value.split(".");
  if (!id || !exp || !sig) return null;
  const expected = sign(`${id}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return Number(id);
}

export async function getStreamer(): Promise<Streamer | null> {
  const jar = await cookies();
  const id = parseSession(jar.get(SESSION_COOKIE)?.value);
  if (id === null) return null;
  const streamer = db.prepare("SELECT * FROM streamers WHERE id = ?").get(id) as Streamer | undefined;
  if (!streamer || streamer.disabled) return null; // accounts disabled by an admin are treated as logged out
  return streamer;
}

export const newToken = (bytes = 24) => randomBytes(bytes).toString("base64url");

export function upsertStreamer(t: { twitch_id: string; login: string; display_name: string; avatar_url: string | null }): number {
  const existing = db.prepare("SELECT id FROM streamers WHERE twitch_id = ?").get(t.twitch_id) as { id: number } | undefined;
  if (existing) {
    db.prepare("UPDATE streamers SET login = ?, display_name = ?, avatar_url = ? WHERE id = ?").run(
      t.login,
      t.display_name,
      t.avatar_url,
      existing.id,
    );
    return existing.id;
  }
  const r = db
    .prepare(
      "INSERT INTO streamers (twitch_id, login, display_name, avatar_url, overlay_token, created_at) VALUES (?,?,?,?,?,?)",
    )
    .run(t.twitch_id, t.login, t.display_name, t.avatar_url, newToken(), Date.now());
  return Number(r.lastInsertRowid);
}
