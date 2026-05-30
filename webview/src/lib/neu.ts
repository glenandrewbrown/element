/**
 * Neumorphic shadow generator — faithful reproduction of the neumorphism.io
 * algorithm (github.com/adamgiebl/neumorphism, BSD-3-Clause), adapted for
 * Element's LOCKED dark design system.
 *
 * Two ways to use it:
 *  - `neu({ base, distance, ... })` — dynamic, opaque-RGB shadows derived from a
 *    base colour (matches neumorphism.io output exactly). Use for variations,
 *    concave/convex, or generating from a semantic hue.
 *  - `ELEMENT_RAISED()` / `ELEMENT_PRESSED()` — the CANONICAL Element tokens
 *    (alpha-based rgba shadows). Prefer these for standard surfaces so the
 *    "same material" illusion holds across the chassis.
 *
 * Element surface tokens: Canvas #1E1E22 · Panel #222226 · Surface #252529 ·
 * Elevated #2A2A2E · Pressed #1A1A1E.
 */
import type { CSSProperties } from "react";

export type LightSource = 1 | 2 | 3 | 4; // 1=top-left 2=top-right 3=bottom-right 4=bottom-left
export type NeuShape = "flat" | "pressed" | "concave" | "convex";

export interface NeuOptions {
  /** Base hex colour, e.g. "#252529". */
  base: string;
  /** Shadow offset in px (default 20). */
  distance?: number;
  /** Colour delta 0.01–0.6 (default 0.15). Scales each RGB channel by ±intensity. */
  intensity?: number;
  /** Blur radius in px (default distance * 2 — the neumorphism.io invariant). */
  blur?: number;
  /** flat | pressed (inset) | concave | convex (default "flat"). */
  shape?: NeuShape;
  /** Light source quadrant (default 1 = top-left, matching Element's chassis). */
  lightSource?: LightSource;
}

export interface NeuResult {
  boxShadow: string;
  background: string;
}

/**
 * Scale each RGB channel by (1 + lum) and clamp to 0–255. `lum` is a signed
 * float. This is neumorphism.io's `colorLuminance` — pure RGB channel scaling,
 * relative to the channel value (so very dark bases get subtle shadows, which
 * is exactly why the algorithm works at #1E1E22).
 */
export function colorLuminance(hex: string, lum: number): string {
  let h = hex.replace(/[^0-9a-f]/gi, "");
  if (h.length < 6) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  let rgb = "#";
  for (let i = 0; i < 3; i++) {
    let c = parseInt(h.substr(i * 2, 2), 16);
    c = Math.round(Math.min(Math.max(0, c + c * lum), 255));
    rgb += ("00" + c.toString(16)).slice(-2);
  }
  return rgb;
}

const LIGHT_POSITIONS: Record<LightSource, [number, number, number]> = {
  1: [1, 1, 145],
  2: [-1, 1, 225],
  3: [-1, -1, 315],
  4: [1, -1, 45],
};

/** Generate neumorphic box-shadow (+ optional gradient background) from a base colour. */
export function neu({
  base,
  distance = 20,
  intensity = 0.15,
  blur = distance * 2,
  shape = "flat",
  lightSource = 1,
}: NeuOptions): NeuResult {
  const darkColor = colorLuminance(base, -intensity);
  const lightColor = colorLuminance(base, intensity);

  const [sx, sy, angle] = LIGHT_POSITIONS[lightSource];
  const px = sx * distance;
  const py = sy * distance;

  const isGradient = shape === "concave" || shape === "convex";
  const firstGrad = isGradient
    ? colorLuminance(base, shape === "convex" ? 0.07 : -0.1)
    : base;
  const secondGrad = isGradient
    ? colorLuminance(base, shape === "concave" ? 0.07 : -0.1)
    : base;
  const background = isGradient
    ? `linear-gradient(${angle}deg, ${firstGrad}, ${secondGrad})`
    : base;

  const inset = shape === "pressed" ? "inset " : "";
  const boxShadow =
    `${inset}${px}px ${py}px ${blur}px ${darkColor}, ` +
    `${inset}${-px}px ${-py}px ${blur}px ${lightColor}`;

  return { boxShadow, background };
}

// ── Canonical Element tokens (alpha-based — prefer for standard surfaces) ─────

/** Raised: light shadow top-left + dark shadow bottom-right. The default chassis extrusion. */
export function ELEMENT_RAISED(blur = 16, dist = 8): { boxShadow: string } {
  return {
    boxShadow:
      `-${dist}px -${dist}px ${blur}px rgba(255,255,255,0.05), ` +
      `${dist}px ${dist}px ${blur}px rgba(0,0,0,0.40)`,
  };
}

/** Pressed/inset: inverted inner shadows. Buttons press INTO the surface on click. */
export function ELEMENT_PRESSED(blur = 12, dist = 6): { boxShadow: string } {
  return {
    boxShadow:
      `inset ${dist}px ${dist}px ${blur}px rgba(0,0,0,0.40), ` +
      `inset -${dist}px -${dist}px ${blur}px rgba(255,255,255,0.05)`,
  };
}

/** 4px outer micro-glow of a semantic hue at 25% opacity, for active elements. */
export function ELEMENT_GLOW(hue: string): { boxShadow: string } {
  return { boxShadow: `0 0 4px ${hue}40` }; // 40 hex = 25% alpha
}

/** Convenience: a React style object for a neumorphic surface. */
export function neuStyle(opts: NeuOptions): CSSProperties {
  const { boxShadow, background } = neu(opts);
  return { boxShadow, background };
}
