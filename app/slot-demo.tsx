"use client";

import { useRef, useState } from "react";
import {
  EDGE,
  MAX_AD_HEIGHT,
  MAX_AD_WIDTH,
  POSITIONS,
  POSITION_LABEL,
  SCENE_H,
  SCENE_W,
  SIZE_PRESETS,
  type Position,
} from "@/lib/ad-geometry";

const PRESETS = SIZE_PRESETS.slice(0, 3); // Small, Medium, Large
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const usd = (n: number) => `$${n.toFixed(2)}`;

/** Top-left corner (in 1920x1080 scene pixels) of an ad of size w x h sitting at a named position. */
function anchor(position: Position, w: number, h: number) {
  const [v, hz] = position.split("-") as ["top" | "bottom", "left" | "center" | "right"];
  const x = hz === "left" ? EDGE : hz === "right" ? SCENE_W - EDGE - w : (SCENE_W - w) / 2;
  const y = v === "top" ? EDGE : SCENE_H - EDGE - h;
  return { x, y };
}

/** The named position whose spot is closest to a point (the ad's centre while dragging). */
function nearest(cx: number, cy: number, w: number, h: number): Position {
  let best: Position = POSITIONS[0];
  let bestD = Infinity;
  for (const p of POSITIONS) {
    const a = anchor(p, w, h);
    const d = (a.x + w / 2 - cx) ** 2 + (a.y + h / 2 - cy) ** 2;
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/**
 * Interactive "create your listing" demo for the home page. Nothing is saved: it shows streamers how a
 * listing (ad slot) is built: name and price, size, and where on screen it goes.
 */
export default function SlotDemo({ feePercent, ctaHref, ctaLabel }: { feePercent: number; ctaHref: string; ctaLabel: string }) {
  const [name, setName] = useState("Corner banner");
  const [price, setPrice] = useState("25");
  const [minutes, setMinutes] = useState("30");
  const [custom, setCustom] = useState(false);
  const [width, setWidth] = useState(480);
  const [height, setHeight] = useState(160);
  const [position, setPosition] = useState<Position>("bottom-left");
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  const stage = useRef<HTMLDivElement>(null);
  const grab = useRef({ dx: 0, dy: 0 });
  const dragging = useRef(false); // a ref, not state, so fast drags can't outrun a re-render

  const w = clamp(width || 0, 100, MAX_AD_WIDTH);
  const h = clamp(height || 0, 50, MAX_AD_HEIGHT);

  const toScene = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    const s = SCENE_W / r.width;
    return { x: (e.clientX - r.left) * s, y: (e.clientY - r.top) * s };
  };

  const moveTo = (e: React.PointerEvent) => {
    const p = toScene(e);
    const x = clamp(p.x - grab.current.dx, 0, SCENE_W - w);
    const y = clamp(p.y - grab.current.dy, 0, SCENE_H - h);
    setDrag({ x, y });
    setPosition(nearest(x + w / 2, y + h / 2, w, h));
  };

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    const p = toScene(e);
    const cur = anchor(position, w, h);
    const onAd = p.x >= cur.x && p.x <= cur.x + w && p.y >= cur.y && p.y <= cur.y + h;
    // Grab the box where you touched it; tapping empty screen centres the box on your finger.
    grab.current = onAd ? { dx: p.x - cur.x, dy: p.y - cur.y } : { dx: w / 2, dy: h / 2 };
    moveTo(e);
  };

  const endDrag = () => {
    dragging.current = false;
    setDrag(null);
  };

  const spot = anchor(position, w, h);
  const at = drag ?? spot;
  const box = (x: number, y: number): React.CSSProperties => ({
    position: "absolute",
    left: `${(x / SCENE_W) * 100}%`,
    top: `${(y / SCENE_H) * 100}%`,
    width: `${(w / SCENE_W) * 100}%`,
    height: `${(h / SCENE_H) * 100}%`,
  });

  const priceNum = Number(price);
  const minutesNum = Number(minutes);
  const validPrice = priceNum > 0;
  const shownName = name.trim() || "Your ad slot";

  return (
    <div className="slot-mock">
      <div className="slot-mock-head">
        <strong>Create your listing</strong>
        <span className="pill">try it, nothing is saved</span>
      </div>
      <p className="muted small" style={{ margin: "0 0 14px" }}>
        A listing is one ad slot that brands can buy. This is exactly how you&apos;ll build yours.
      </p>

      <div className="sb-group" style={{ marginBottom: 16 }}>
        <p className="legend"><span className="num">1</span> Name it and set your price</p>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Corner banner" />
        </label>
        <div className="two">
          <label>
            Your price (USD)
            <input type="number" min="1" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label>
            Minutes on stream
            <input type="number" min="1" step="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="sb-group" style={{ marginBottom: 16 }}>
        <p className="legend"><span className="num">2</span> Pick the ad size</p>
        <div className="chips">
          {PRESETS.map((p) => (
            <button
              type="button"
              key={p.label}
              className={`chip ${!custom && width === p.width && height === p.height ? "on" : ""}`}
              onClick={() => {
                setCustom(false);
                setWidth(p.width);
                setHeight(p.height);
              }}
            >
              {p.label} <small>{p.width}×{p.height}</small>
            </button>
          ))}
          <button type="button" className={`chip ${custom ? "on" : ""}`} onClick={() => setCustom(true)}>
            Custom
          </button>
        </div>
        {custom && (
          <div className="two">
            <label>
              Width (px)
              <input type="number" min={100} max={MAX_AD_WIDTH} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
            </label>
            <label>
              Height (px)
              <input type="number" min={50} max={MAX_AD_HEIGHT} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
            </label>
          </div>
        )}
      </div>

      <div className="sb-group">
        <p className="legend"><span className="num">3</span> Drag it where it should appear</p>
        <div
          ref={stage}
          className="adprev"
          role="img"
          aria-label={`Preview of your stream with the ad at ${POSITION_LABEL[position]}`}
          style={{ touchAction: "none", cursor: "pointer", userSelect: "none" }}
          onPointerDown={onDown}
          onPointerMove={(e) => dragging.current && moveTo(e)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {drag && (
            <div
              style={{ ...box(spot.x, spot.y), border: "1.5px dashed rgba(255,255,255,0.35)", borderRadius: 4, pointerEvents: "none" }}
            />
          )}
          <div
            className="adprev-ad"
            style={{
              ...box(at.x, at.y),
              cursor: drag ? "grabbing" : "grab",
              transition: drag ? "none" : "left .25s ease, top .25s ease, width .25s ease, height .25s ease",
              boxShadow: drag ? "0 8px 24px rgba(0,0,0,0.5)" : undefined,
            }}
          >
            <span>Sponsor</span>
            <small>{w}×{h}</small>
          </div>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Drag the box, or click anywhere on the screen. It snaps to a spot. Or choose one:
        </p>
        <div className="pos-grid" role="radiogroup" aria-label="Ad position">
          {POSITIONS.map((p) => (
            <button
              type="button"
              key={p}
              role="radio"
              aria-checked={position === p}
              className={`chip ${position === p ? "on" : ""}`}
              onClick={() => setPosition(p)}
            >
              {POSITION_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="summary" style={{ marginTop: 16 }}>
        <div>
          <span>{shownName}</span>
          <span>
            {minutesNum > 0 ? `${minutesNum} min` : "—"} · {w}×{h} · {POSITION_LABEL[position]}
          </span>
        </div>
        <div className="total">
          <span>Brands pay{validPrice && minutesNum > 0 ? ` (${usd(priceNum / minutesNum)}/min)` : ""}</span>
          <span>{validPrice ? usd(priceNum) : "—"}</span>
        </div>
        <div>
          <span>You receive after our {feePercent}% fee</span>
          <span style={{ color: "var(--ok)" }}>{validPrice ? usd(priceNum * (1 - feePercent / 100)) : "—"}</span>
        </div>
      </div>

      <a className="btn" href={ctaHref} style={{ marginTop: 14, width: "100%", justifyContent: "center" }}>
        {ctaLabel}
      </a>
    </div>
  );
}
