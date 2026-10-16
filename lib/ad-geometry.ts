// Pure helpers shared by server and client code (no Node imports here).

export const POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABEL: Record<Position, string> = {
  "top-left": "top left",
  "top-center": "top center",
  "top-right": "top right",
  "bottom-left": "bottom left",
  "bottom-center": "bottom center",
  "bottom-right": "bottom right",
};

export const MAX_AD_WIDTH = 1920;
export const MAX_AD_HEIGHT = 1080;
export const SCENE_W = 1920;
export const SCENE_H = 1080;
export const EDGE = 24; // px gap from the scene edge

export const SIZE_PRESETS = [
  { label: "Small", width: 300, height: 100 },
  { label: "Medium", width: 480, height: 160 },
  { label: "Large", width: 720, height: 240 },
  { label: "Square", width: 300, height: 300 },
] as const;

/** Percent-based CSS box for an ad inside a 1920x1080 scene, for previews. */
export function previewStyle(width: number, height: number, position: Position): React.CSSProperties {
  const [v, h] = position.split("-") as ["top" | "bottom", "left" | "center" | "right"];
  const style: React.CSSProperties = {
    position: "absolute",
    width: `${(Math.min(width, SCENE_W) / SCENE_W) * 100}%`,
    height: `${(Math.min(height, SCENE_H) / SCENE_H) * 100}%`,
    [v]: `${(EDGE / SCENE_H) * 100}%`,
  };
  const gap = `${(EDGE / SCENE_W) * 100}%`;
  if (h === "left") style.left = gap;
  else if (h === "right") style.right = gap;
  else {
    style.left = "50%";
    style.transform = "translateX(-50%)";
  }
  return style;
}

/** Pixel CSS box for the real overlay (fixed to the viewport, which OBS sets to 1920x1080). */
export function overlayStyle(width: number, height: number, position: Position): React.CSSProperties {
  const [v, h] = position.split("-") as ["top" | "bottom", "left" | "center" | "right"];
  const style: React.CSSProperties = { position: "fixed", width, height, [v]: EDGE };
  if (h === "left") style.left = EDGE;
  else if (h === "right") style.right = EDGE;
  else {
    style.left = "50%";
    style.transform = "translateX(-50%)";
  }
  return style;
}
