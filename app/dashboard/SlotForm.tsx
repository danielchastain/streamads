"use client";

import { useState } from "react";
import {
  MAX_AD_HEIGHT,
  MAX_AD_WIDTH,
  POSITIONS,
  POSITION_LABEL,
  SIZE_PRESETS,
  type Position,
} from "@/lib/ad-geometry";
import AdPreview from "../ad-preview";

export default function SlotForm() {
  const [width, setWidth] = useState(480);
  const [height, setHeight] = useState(160);
  const [position, setPosition] = useState<Position>("bottom-left");

  const w = Math.min(Math.max(width || 0, 100), MAX_AD_WIDTH);
  const h = Math.min(Math.max(height || 0, 50), MAX_AD_HEIGHT);

  return (
    <form className="slot-builder" method="post" action="/api/dashboard/slot">
      <div className="sb-fields">
        <div className="sb-group">
          <p className="legend"><span className="num">1</span> What are you selling?</p>
          <label>
            Name
            <input name="name" placeholder="Corner banner" required maxLength={80} />
          </label>
          <div className="two">
            <label>
              Your price (USD)
              <input name="price" type="number" min="1" step="0.01" placeholder="25" required />
            </label>
            <label>
              Minutes on stream
              <input name="minutes" type="number" min="1" step="1" placeholder="30" required />
            </label>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            You decide the price. It can be $5 or $500. Brands pay exactly this amount.
          </p>
        </div>

        <div className="sb-group">
          <p className="legend"><span className="num">2</span> How big is the ad?</p>
          <div className="chips">
            {SIZE_PRESETS.map((p) => (
              <button
                type="button"
                key={p.label}
                className={`chip ${width === p.width && height === p.height ? "on" : ""}`}
                onClick={() => {
                  setWidth(p.width);
                  setHeight(p.height);
                }}
              >
                {p.label} <small>{p.width}×{p.height}</small>
              </button>
            ))}
          </div>
          <div className="two">
            <label>
              Width (px)
              <input
                name="width"
                type="number"
                min={100}
                max={MAX_AD_WIDTH}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                required
              />
            </label>
            <label>
              Height (px)
              <input
                name="height"
                type="number"
                min={50}
                max={MAX_AD_HEIGHT}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                required
              />
            </label>
          </div>
        </div>

        <div className="sb-group">
          <p className="legend"><span className="num">3</span> Where does it appear?</p>
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
          <input type="hidden" name="position" value={position} />
        </div>
      </div>

      <div className="sb-side">
        <p className="muted small" style={{ margin: "0 0 8px" }}>Live preview on your stream</p>
        <AdPreview width={w} height={h} position={position} />
        <p className="muted small" style={{ margin: "8px 0 14px" }}>
          Brands are told to upload a {w}×{h} px image for this slot.
        </p>
        <button type="submit" className="big-pay">Add this slot</button>
      </div>
    </form>
  );
}
