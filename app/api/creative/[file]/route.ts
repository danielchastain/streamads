import fs from "node:fs";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/db";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!/^[a-f0-9]{32}\.(png|jpg|gif|webp)$/.test(file)) return new Response("Not found", { status: 404 });
  const full = path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, file);
  if (!fs.existsSync(full)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(full), {
    headers: {
      "Content-Type": MIME[file.split(".")[1]],
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
