import { NextResponse } from "next/server";
import { getStreamer } from "@/lib/auth";
import { db, MAX_AD_HEIGHT, MAX_AD_WIDTH, POSITIONS, type Position } from "@/lib/db";
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
    const width = Math.round(Number(form.get("width")));
    const height = Math.round(Number(form.get("height")));
    const posRaw = String(form.get("position") ?? "");
    const position: Position = (POSITIONS as readonly string[]).includes(posRaw) ? (posRaw as Position) : "bottom-left";
    if (
      name &&
      price >= 100 && price <= 10_000_000 &&
      minutes >= 1 && minutes <= 10_000 &&
      width >= 100 && width <= MAX_AD_WIDTH &&
      height >= 50 && height <= MAX_AD_HEIGHT
    ) {
      db.prepare("INSERT INTO slots (streamer_id, name, price_cents, minutes, width, height, position) VALUES (?,?,?,?,?,?,?)").run(
        streamer.id,
        name,
        price,
        minutes,
        width,
        height,
        position,
      );
    }
  }
  return NextResponse.redirect(abs("/dashboard"), 303);
}
