import { getStreamer } from "./auth";
import type { Streamer } from "./db";
import { ADMIN_LOGINS, IS_PROD } from "./env";

export const isAdminLogin = (login: string) => ADMIN_LOGINS.includes(login.toLowerCase());

/**
 * The signed-in admin, or null. Fails closed: nobody is an admin unless ADMIN_LOGINS lists their Twitch login
 * AND they hold a valid signed session. In production that session can only come from a real Twitch sign-in;
 * accounts from the dev-only username login (twitch_id "dev-...") are refused there as a second layer.
 * Every admin page and action must call this itself; never rely on the UI hiding a button.
 */
export async function getAdmin(): Promise<Streamer | null> {
  if (ADMIN_LOGINS.length === 0) return null;
  const streamer = await getStreamer();
  if (!streamer || !isAdminLogin(streamer.login)) return null;
  if (IS_PROD && streamer.twitch_id.startsWith("dev-")) return null;
  return streamer;
}
