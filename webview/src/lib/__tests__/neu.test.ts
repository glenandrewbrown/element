import { describe, it, expect } from "vitest";
import { neu, colorLuminance, ELEMENT_RAISED, ELEMENT_PRESSED } from "../neu";

describe("neu generator (neumorphism.io algorithm)", () => {
  it("colorLuminance scales each RGB channel by ±intensity, clamped", () => {
    // #252529 = (37,37,41); ×0.85 → (31,31,35) = #1f1f23
    expect(colorLuminance("#252529", -0.15)).toBe("#1f1f23");
    // ×1.15 → (43,43,47) = #2b2b2f
    expect(colorLuminance("#252529", 0.15)).toBe("#2b2b2f");
    // clamps at 255 (white stays white)
    expect(colorLuminance("#ffffff", 0.5)).toBe("#ffffff");
    // clamps at 0 (black stays black on darken)
    expect(colorLuminance("#000000", -0.5)).toBe("#000000");
  });

  it("neu() emits two offset shadows + flat background", () => {
    const r = neu({ base: "#252529", distance: 8, intensity: 0.15, blur: 16 });
    expect(r.background).toBe("#252529");
    expect(r.boxShadow).toBe(
      "8px 8px 16px #1f1f23, -8px -8px 16px #2b2b2f",
    );
  });

  it("blur defaults to 2× distance (the neumorphism.io invariant)", () => {
    const r = neu({ base: "#252529", distance: 10 });
    expect(r.boxShadow).toContain("20px"); // blur = 10 * 2
  });

  it("pressed shape insets both shadows, no gradient", () => {
    const r = neu({ base: "#252529", distance: 6, shape: "pressed" });
    expect(r.boxShadow.startsWith("inset ")).toBe(true);
    expect(r.boxShadow).toContain(", inset -6px -6px");
    expect(r.background).toBe("#252529");
  });

  it("convex shape produces a linear-gradient background", () => {
    const r = neu({ base: "#252529", shape: "convex" });
    expect(r.background).toMatch(/^linear-gradient\(145deg, #/);
  });

  it("light source 3 (bottom-right) flips the offsets", () => {
    const r = neu({ base: "#252529", distance: 8, lightSource: 3 });
    expect(r.boxShadow.startsWith("-8px -8px")).toBe(true);
  });

  it("canonical Element tokens use alpha-based rgba shadows", () => {
    expect(ELEMENT_RAISED().boxShadow).toContain("rgba(255,255,255,0.05)");
    expect(ELEMENT_RAISED().boxShadow).toContain("rgba(0,0,0,0.40)");
    expect(ELEMENT_PRESSED().boxShadow).toContain("inset");
  });
});
