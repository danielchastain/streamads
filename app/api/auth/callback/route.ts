import { NextResponse } from "next/server";
import { makeSessionValue, SESSION_COOKIE, sessionCookieOptions, STATE_COOKIE, upsertStreamer } from "@/lib/auth";
import { db } from "@/lib/db";
import { abs, TWITCH_ENABLED } from "@/lib/env";

const fail = (code: string) => NextResponse.redirect(abs(`/sign-up?error=${code}`), 303);

export async function GET(req: Request) {
  if (!TWITCH_ENABLED) return fail("twitch_not_configured");
  const url = new URL(req.url);
  // Twitch sends ?error=access_denied when the user cancels on the consent screen.
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error") === "access_denied" ? "access_denied" : "token_exchange");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.headers.get("cookie")?.match(new RegExp(`${STATE_COOKIE}=([^;]+)`))?.[1];
  if (!code || !state || state !== cookieState) return fail("bad_state");

  const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID!,
      client_secret: process.env.TWITCH_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: abs("/api/auth/callback"),
    }),
  });
  if (!tokenRes.ok) return fail("token_exchange");
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const userRes = await fetch("https://api.twitch.tv/helix/users", {
    headers: { Authorization: `Bearer ${access_token}`, "Client-Id": process.env.TWITCH_CLIENT_ID! },
  });
  if (!userRes.ok) return fail("user_lookup");
  const user = ((await userRes.json()) as { data: { id: string; login: string; display_name: string; profile_image_url: string }[] }).data[0];
  if (!user) return fail("user_lookup");

  const existed = !!db.prepare("SELECT 1 FROM streamers WHERE twitch_id = ?").get(user.id);
  const id = upsertStreamer({
    twitch_id: user.id,
    login: user.login.toLowerCase(),
    display_name: user.display_name,
    avatar_url: user.profile_image_url,
  });
  const res = NextResponse.redirect(abs(existed ? "/dashboard" : "/dashboard?welcome=1"), 303);
  res.cookies.set(SESSION_COOKIE, makeSessionValue(id), sessionCookieOptions);
  res.cookies.delete(STATE_COOKIE);
  return res;
}
