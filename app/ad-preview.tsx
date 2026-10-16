import { previewStyle, type Position } from "@/lib/ad-geometry";

/** A to-scale picture of the stream with the ad placed where it will appear. */
export default function AdPreview({
  width,
  height,
  position,
  label = "Your ad",
}: {
  width: number;
  height: number;
  position: Position;
  label?: string;
}) {
  return (
    <div className="adprev" aria-hidden="true">
      <div className="adprev-ad" style={previewStyle(width, height, position)}>
        <span>{label}</span>
        <small>{width}×{height}</small>
      </div>
    </div>
  );
}
