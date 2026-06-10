/**
 * responsivePanelLayout.test.ts — BUG-2 (Glen 2026-06-10): panels must scale
 * with the window so the canvas is never crushed to a sliver.
 *
 * Covers the pure clamp math `resolveResponsivePanelLayout`:
 *   - at a wide window the persisted widths pass through unchanged;
 *   - the canvas always keeps at least CANVAS_MIN_FRACTION of the window;
 *   - each open panel is capped at PANEL_MAX_FRACTION of the window;
 *   - below INSPECTOR_AUTOCOLLAPSE_W the right Inspector is flagged to collapse;
 *   - the persisted widths are NEVER mutated (this fn is pure / read-only).
 */

import { describe, expect, it } from "vitest";
import {
  resolveResponsivePanelLayout,
  CANVAS_MIN_FRACTION,
  PANEL_MAX_FRACTION,
  INSPECTOR_AUTOCOLLAPSE_W,
  PANEL_RAIL_RESERVED_W,
} from "../useAppStore";

const base = {
  leftOpen: true,
  rightOpen: true,
  leftWidth: 260,
  rightWidth: 280,
};

describe("resolveResponsivePanelLayout", () => {
  it("passes persisted widths through at a wide window", () => {
    const r = resolveResponsivePanelLayout({ ...base, windowWidth: 1920 });
    expect(r.leftWidth).toBe(260);
    expect(r.rightWidth).toBe(280);
    expect(r.shouldCollapseRight).toBe(false);
  });

  it("guarantees the canvas keeps at least CANVAS_MIN_FRACTION of the window", () => {
    // A wide-ish window where both panels are open but persisted big.
    const W = 1100;
    const r = resolveResponsivePanelLayout({
      ...base,
      leftWidth: 520,
      rightWidth: 520,
      windowWidth: W,
    });
    const canvas = W - r.leftWidth - r.rightWidth;
    expect(canvas).toBeGreaterThanOrEqual(Math.floor(W * CANVAS_MIN_FRACTION));
  });

  it("caps each open panel at PANEL_MAX_FRACTION of the window", () => {
    const W = 1200;
    const r = resolveResponsivePanelLayout({
      ...base,
      leftWidth: 560,
      rightWidth: 560,
      windowWidth: W,
    });
    const fractionCap = Math.floor(W * PANEL_MAX_FRACTION);
    expect(r.leftWidth).toBeLessThanOrEqual(fractionCap);
    expect(r.rightWidth).toBeLessThanOrEqual(fractionCap);
  });

  it("flags the right Inspector for auto-collapse below the threshold", () => {
    const r = resolveResponsivePanelLayout({
      ...base,
      windowWidth: INSPECTOR_AUTOCOLLAPSE_W - 1,
    });
    expect(r.shouldCollapseRight).toBe(true);
    expect(r.rightWidth).toBe(0); // collapsed → reserves only the rail
  });

  it("does NOT collapse the right Inspector at or above the threshold", () => {
    const r = resolveResponsivePanelLayout({
      ...base,
      windowWidth: INSPECTOR_AUTOCOLLAPSE_W,
    });
    expect(r.shouldCollapseRight).toBe(false);
  });

  it("with the inspector collapsed, the canvas budget honours the rail reservation", () => {
    const W = INSPECTOR_AUTOCOLLAPSE_W - 1;
    const r = resolveResponsivePanelLayout({ ...base, windowWidth: W });
    const canvas = W - r.leftWidth - PANEL_RAIL_RESERVED_W;
    expect(canvas).toBeGreaterThanOrEqual(Math.floor(W * CANVAS_MIN_FRACTION));
  });

  it("does not mutate its input (pure)", () => {
    const input = { ...base, windowWidth: 1000 };
    const snapshot = JSON.stringify(input);
    resolveResponsivePanelLayout(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
