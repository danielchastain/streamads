import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { abs } from "@/lib/env";

export async function POST() {
  const res = NextResponse.redirect(abs("/"), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
