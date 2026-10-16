"use client";

import { useEffect, useRef, useState } from "react";

type Ad = { id: number; image: string; company: string } | null;

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
  return (
    <div style={{ position: "fixed", left: 24, bottom: 24, maxWidth: 420 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ad.image} alt={ad.company} style={{ display: "block", maxWidth: "100%", maxHeight: 140, borderRadius: 6 }} />
      <div style={{ font: "11px system-ui, sans-serif", color: "#fff", textShadow: "0 0 3px #000", marginTop: 2 }}>
        Sponsored · {ad.company}
      </div>
    </div>
  );
}
