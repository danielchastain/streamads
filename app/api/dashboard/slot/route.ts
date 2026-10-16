import { NextResponse } from "next/server";
import { getStreamer } from "@/lib/auth";
import { db } from "@/lib/db";
import { abs } from "@/lib/env";

export async function POST(req: Request) {
  const streamer = await getStreamer();
  if (!streamer) return NextResponse.redirect(abs("/"), 303);
  const form = await req.formData();
  const intent = String(form.get("intent") ?? "create");

  if (intent === "delete") {
    db.prepare("UPDATE slots SET active = 0 WHERE id = ? AND streamer_id = ?").run(Number(form.get("id")), streamer.id);
  } else {
    const name = String(form.get("name") ?? "").trim().slice(0, 80);
    const price = Math.round(Number(form.get("price")) * 100);
    const minutes = Math.round(Number(form.get("minutes")));
    if (name && price >= 100 && price <= 1_000_000 && minutes >= 1 && minutes <= 10_000) {
      db.prepare("INSERT INTO slots (streamer_id, name, price_cents, minutes) VALUES (?,?,?,?)").run(
        streamer.id,
        name,
        price,
        minutes,
      );
    }
  }
  return NextResponse.redirect(abs("/dashboard"), 303);
}
