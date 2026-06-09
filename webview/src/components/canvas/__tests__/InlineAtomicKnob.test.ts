import { describe, it, expect } from "vitest";
import { knobRawFromNorm } from "../inline/InlineAtomicKnob";
import type { InlineParamRow } from "../../../data/types";

const row = (over: Partial<InlineParamRow>): InlineParamRow => ({
  key: "k", label: "K", value: 0, min: -48, max: 48, step: 1, ...over,
});

describe("knobRawFromNorm", () => {
  it("maps normalised 0..1 onto [min,max] and snaps to step", () => {
    expect(knobRawFromNorm(0, row({}))).toBe(-48);
    expect(knobRawFromNorm(1, row({}))).toBe(48);
    expect(knobRawFromNorm(0.5, row({}))).toBe(0);
  });
  it("snaps to a coarse step and clamps", () => {
    const r = row({ min: 0, max: 127, step: 1 });
    expect(knobRawFromNorm(0.5, r)).toBe(64); // 63.5 → round → 64
    expect(knobRawFromNorm(2, r)).toBe(127); // clamp
    expect(knobRawFromNorm(-1, r)).toBe(0); // clamp
  });
  it("supports continuous (step 0)", () => {
    const r = row({ min: 0, max: 1, step: 0 });
    expect(knobRawFromNorm(0.33, r)).toBeCloseTo(0.33, 5);
  });
});
