import type { ProbeHint, ProbeMode } from "../rope/ropeTypes";

export const hintColor = (hint: ProbeHint | undefined): string => {
  switch (hint) {
    case "r1":
      return "#ffd166";
    case "r2":
      return "#69d2a6";
    case "r3":
      return "#8fb3ff";
    case "flip":
      return "#ff5c8a";
    default:
      return "#8ebcca";
  }
};

export const modeClassName = (mode: ProbeMode): string => `probe-mode-${mode}`;

export const clampOverlayPosition = (
  x: number,
  y: number,
  width: number,
  height: number,
  margin = 12
): { x: number; y: number } => ({
  x: Math.max(margin, Math.min(window.innerWidth - width - margin, x)),
  y: Math.max(margin, Math.min(window.innerHeight - height - margin, y))
});
