"use client";

import { useEffect, useRef, useState } from "react";
import { overlayStyle, POSITIONS, type Position } from "@/lib/ad-geometry";

type Ad = { id: number; image: string; company: string; width: number; height: number; position: string } | null;

const POLL_MS = 10_000;

export default function Overlay({ token }: { token: string }) {
  const [ad, setAd] = useState<Ad>(null);
  const showing = useRef<number | null>(null);

  useEffect(() => {
    let stopped = false;
    async function beat() {
      try {
        const res = await fetch(`/api/overlay/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ showing: showing.current }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { ad: Ad };
        if (stopped) return;
        showing.current = data.ad?.id ?? null;
        setAd(data.ad);
      } catch {
        // Network hiccup: keep showing the current ad and try again next tick.
      }
    }
    beat();
    const t = setInterval(beat, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [token]);

  if (!ad) return null;
  const position: Position = (POSITIONS as readonly string[]).includes(ad.position) ? (ad.position as Position) : "bottom-left";
  return (
    <div style={overlayStyle(ad.width, ad.height, position)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ad.image}
        alt={ad.company}
        style={{ display: "block", width: "100%", height: "100%", objectFit: "contain", borderRadius: 6 }}
      />
      <div
        style={{
          position: "absolute",
          right: 4,
          bottom: 4,
          font: "10px system-ui, sans-serif",
          color: "#fff",
          background: "rgba(0,0,0,0.55)",
          padding: "1px 6px",
          borderRadius: 4,
        }}
      >
        Sponsored · {ad.company}
      </div>
    </div>
  );
}
