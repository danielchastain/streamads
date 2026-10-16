import { NextResponse } from "next/server";
import { makeSessionValue, SESSION_COOKIE, sessionCookieOptions, upsertStreamer } from "@/lib/auth";
import { db } from "@/lib/db";
import { abs, IS_PROD, TWITCH_ENABLED } from "@/lib/env";

// Development-only login so the app can be tried without Twitch credentials.
export async function POST(req: Request) {
  if (IS_PROD || TWITCH_ENABLED) return new NextResponse("Not found", { status: 404 });
  const form = await req.formData();
  const login = String(form.get("login") ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 25);
  if (!login) return NextResponse.redirect(abs("/sign-up?error=bad_login"), 303);
  const existed = !!db.prepare("SELECT 1 FROM streamers WHERE twitch_id = ?").get(`dev-${login}`);
  const id = upsertStreamer({ twitch_id: `dev-${login}`, login, display_name: login, avatar_url: null });
  const res = NextResponse.redirect(abs(existed ? "/dashboard" : "/dashboard?welcome=1"), 303);
  res.cookies.set(SESSION_COOKIE, makeSessionValue(id), sessionCookieOptions);
  return res;
}
