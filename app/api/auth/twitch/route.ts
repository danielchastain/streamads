import { NextResponse } from "next/server";
import { newToken, STATE_COOKIE } from "@/lib/auth";
import { abs, IS_PROD, TWITCH_ENABLED } from "@/lib/env";

export async function GET() {
  if (!TWITCH_ENABLED) return NextResponse.redirect(abs("/sign-up?error=twitch_not_configured"), 303);
  const state = newToken(16);
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.searchParams.set("client_id", process.env.TWITCH_CLIENT_ID!);
  url.searchParams.set("redirect_uri", abs("/api/auth/callback"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "");
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url, 303);
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: IS_PROD, path: "/", maxAge: 600 });
  return res;
}
