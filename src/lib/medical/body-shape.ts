/** Silhouette simplifiée (repère 100 × 220), partagée par l'écran et le PDF. */
export const BODY_VIEWBOX = { width: 100, height: 220 };
export const BODY_HEAD = { cx: 50, cy: 16, r: 11 };
export const BODY_PATHS = [
  "M45 26 h10 v7 h-10 z",
  "M30 34 h40 l4 4 v52 l-6 18 h-36 l-6 -18 v-52 z",
  "M30 36 l-12 8 l-8 52 l6 2 l10 -46 l6 -6 z",
  "M70 36 l12 8 l8 52 l-6 2 l-10 -46 l-6 -6 z",
  "M33 108 h16 l-2 58 l-2 44 h-10 l0 -44 z",
  "M51 108 h16 l-2 58 l0 44 h-10 l-2 -44 z",
];
export const BODY_MARK_COLORS: Record<string, string> = {
  douleur: "#d97706",
  plaie: "#dc2626",
  hematome: "#7c3aed",
  fracture: "#0b2a5b",
  brulure: "#ea580c",
  autre: "#475569",
};
