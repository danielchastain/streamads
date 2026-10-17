"use client";

import { useEffect, useRef, useState } from "react";
import { overlayStyle, POSITIONS, type Position } from "@/lib/ad-geometry";

type Ad = { id: number; image: string; company: string; width: number; height: number; position: string } | null;

const POLL_MS = 10_000;

export default function Overlay({ token }: { token: string }) {
  const [ad, setAd] = useState<Ad>(null);
  const showing = useRef<number | null>(null);
  // Facts about whether the ad is really on screen right now. The server only counts airtime when we report an ad.
  const imageLoaded = useRef(false);
  const obsVisible = useRef(true); // OBS tells us if the source is hidden; assume visible until it says otherwise
  const obsActive = useRef(true);

  useEffect(() => {
    const onVisible = (e: Event) => {
      obsVisible.current = !!(e as CustomEvent<{ visible?: boolean }>).detail?.visible;
    };
    const onActive = (e: Event) => {
      obsActive.current = !!(e as CustomEvent<{ active?: boolean }>).detail?.active;
    };
    window.addEventListener("obsSourceVisibleChanged", onVisible);
    window.addEventListener("obsSourceActiveChanged", onActive);

    let stopped = false;
    async function beat() {
      const reallyShowing =
        showing.current !== null &&
        imageLoaded.current &&
        obsVisible.current &&
        obsActive.current &&
        document.visibilityState !== "hidden";
      try {
        const res = await fetch(`/api/overlay/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ showing: reallyShowing ? showing.current : null }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { ad: Ad };
        if (stopped) return;
        const nextId = data.ad?.id ?? null;
        if (nextId !== showing.current) imageLoaded.current = false; // a different banner has to load first
        showing.current = nextId;
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
      window.removeEventListener("obsSourceVisibleChanged", onVisible);
      window.removeEventListener("obsSourceActiveChanged", onActive);
    };
  }, [token]);

  if (!ad) return null;
  const position: Position = (POSITIONS as readonly string[]).includes(ad.position) ? (ad.position as Position) : "bottom-left";
  return (
    <div style={overlayStyle(ad.width, ad.height, position)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={ad.image}
        ref={(el) => {
          if (el?.complete && el.naturalWidth > 0) imageLoaded.current = true;
        }}
        src={ad.image}
        alt={ad.company}
        onLoad={() => {
          imageLoaded.current = true;
        }}
        onError={() => {
          imageLoaded.current = false;
        }}
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
