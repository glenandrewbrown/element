/**
 * neu.ts gap coverage — ELEMENT_GLOW, neuStyle, 3-char hex expansion,
 * light sources 2 & 4, concave shape.
 */

import { describe, it, expect } from "vitest";
import {
  colorLuminance,
  neu,
  ELEMENT_GLOW,
  ELEMENT_PRESSED,
  neuStyle,
} from "../neu";

// ── ELEMENT_GLOW ──────────────────────────────────────────────────────────────

describe("ELEMENT_GLOW", () => {
  it("returns a boxShadow with 0 0 4px spread", () => {
    const { boxShadow } = ELEMENT_GLOW("#4A90D9");
    expect(boxShadow).toContain("0 0 4px");
  });

  it("appends 40 (25% alpha) hex suffix to the hue", () => {
    const { boxShadow } = ELEMENT_GLOW("#4A90D9");
    expect(boxShadow).toContain("#4A90D940");
  });

  it("works with any valid hex hue (teal accent)", () => {
    const { boxShadow } = ELEMENT_GLOW("#2BC4C4");
    expect(boxShadow).toContain("#2BC4C440");
  });
});

// ── ELEMENT_PRESSED custom args ───────────────────────────────────────────────

describe("ELEMENT_PRESSED with custom blur and dist", () => {
  it("uses provided blur and dist values", () => {
    const { boxShadow } = ELEMENT_PRESSED(8, 4);
    expect(boxShadow).toContain("inset 4px 4px 8px");
    expect(boxShadow).toContain("inset -4px -4px 8px");
  });
});

// ── neuStyle ──────────────────────────────────────────────────────────────────

describe("neuStyle", () => {
  it("returns an object with boxShadow and background CSSProperties", () => {
    const style = neuStyle({ base: "#252529" });
    expect(style).toHaveProperty("boxShadow");
    expect(style).toHaveProperty("background");
  });

  it("boxShadow matches neu() output", () => {
    const opts = { base: "#252529", distance: 8, intensity: 0.15 };
    const { boxShadow: fromNeu } = neu(opts);
    const { boxShadow: fromStyle } = neuStyle(opts);
    expect(fromStyle).toBe(fromNeu);
  });

  it("background matches neu() output", () => {
    const opts = { base: "#252529", shape: "convex" as const };
    const { background: fromNeu } = neu(opts);
    const { background: fromStyle } = neuStyle(opts);
    expect(fromStyle).toBe(fromNeu);
  });
});

// ── colorLuminance — 3-char hex expansion ─────────────────────────────────────

describe("colorLuminance 3-char hex", () => {
  it("expands #fff to #ffffff before scaling", () => {
    // #fff = rgb(255,255,255); scaling by 0 → channels unchanged
    expect(colorLuminance("#fff", 0)).toBe("#ffffff");
  });

  it("expands #000 to #000000 before scaling", () => {
    expect(colorLuminance("#000", 0)).toBe("#000000");
  });

  it("expands #abc to #aabbcc and scales correctly", () => {
    // #abc expands to #aabbcc = (170,187,204)
    // lum = 0  → channels unchanged
    expect(colorLuminance("#abc", 0)).toBe("#aabbcc");
  });

  it("hash prefix is stripped automatically", () => {
    // Should work with or without the leading #
    const withHash = colorLuminance("#252529", 0);
    const withoutHash = colorLuminance("252529", 0);
    expect(withHash).toBe(withoutHash);
  });
});

// ── light source 2 (top-right) ────────────────────────────────────────────────

describe("neu light source 2 (top-right)", () => {
  it("x offset is negative (shadow comes from right)", () => {
    const { boxShadow } = neu({ base: "#252529", distance: 10, lightSource: 2 });
    // Source 2: sx=-1 → px = -10; dark shadow at -10px
    expect(boxShadow.startsWith("-10px 10px")).toBe(true);
  });

  it("gradient angle is 225deg for convex shape", () => {
    const { background } = neu({ base: "#252529", shape: "convex", lightSource: 2 });
    expect(background).toContain("225deg");
  });
});

// ── light source 4 (bottom-left) ─────────────────────────────────────────────

describe("neu light source 4 (bottom-left)", () => {
  it("y offset is negative (shadow comes from below)", () => {
    const { boxShadow } = neu({ base: "#252529", distance: 10, lightSource: 4 });
    // Source 4: sx=1, sy=-1 → px=10, py=-10
    expect(boxShadow.startsWith("10px -10px")).toBe(true);
  });

  it("gradient angle is 45deg for convex shape", () => {
    const { background } = neu({ base: "#252529", shape: "convex", lightSource: 4 });
    expect(background).toContain("45deg");
  });
});

// ── concave shape ─────────────────────────────────────────────────────────────

describe("neu concave shape", () => {
  it("produces a linear-gradient background", () => {
    const { background } = neu({ base: "#252529", shape: "concave" });
    expect(background).toMatch(/^linear-gradient/);
  });

  it("does NOT inset shadows (only pressed does)", () => {
    const { boxShadow } = neu({ base: "#252529", shape: "concave" });
    expect(boxShadow).not.toContain("inset");
  });

  it("gradient is in opposite direction to convex at same light source", () => {
    const convex = neu({ base: "#252529", shape: "convex", lightSource: 1 });
    const concave = neu({ base: "#252529", shape: "concave", lightSource: 1 });
    // Both use 145deg (light source 1), but gradient colours are swapped
    expect(convex.background).toContain("145deg");
    expect(concave.background).toContain("145deg");
    // The lighter colour is first in convex, darker first in concave
    expect(convex.background).not.toBe(concave.background);
  });
});

// ── custom blur override ──────────────────────────────────────────────────────

describe("neu custom blur", () => {
  it("uses supplied blur instead of distance*2", () => {
    const { boxShadow } = neu({ base: "#252529", distance: 10, blur: 5 });
    expect(boxShadow).toContain(" 5px ");
    expect(boxShadow).not.toContain(" 20px ");
  });
});
