/**
 * Tests for webview/src/motion/index.ts — motion token exports and CSS var helpers.
 * Covers cssMotionVar, cssShadowVar (all switch branches), and constant values.
 */

import { describe, expect, it } from "vitest";
import {
  EASE_STANDARD,
  EASE_MODAL,
  EASE_OUT_EXPO,
  DURATION_PRESS,
  DURATION_HOVER,
  DURATION_MODAL,
  DURATION_PAGE,
  transitions,
  motionTransitions,
  shadows,
  cssMotionVar,
  cssShadowVar,
} from "../index";

describe("motion constants", () => {
  it("EASE_STANDARD is valid cubic-bezier", () => {
    expect(EASE_STANDARD).toMatch(/^cubic-bezier/);
  });

  it("EASE_MODAL is valid cubic-bezier", () => {
    expect(EASE_MODAL).toMatch(/^cubic-bezier/);
  });

  it("EASE_OUT_EXPO is valid cubic-bezier", () => {
    expect(EASE_OUT_EXPO).toMatch(/^cubic-bezier/);
  });

  it("duration constants are positive integers", () => {
    expect(DURATION_PRESS).toBeGreaterThan(0);
    expect(DURATION_HOVER).toBeGreaterThan(0);
    expect(DURATION_MODAL).toBeGreaterThan(0);
    expect(DURATION_PAGE).toBeGreaterThan(0);
  });
});

describe("transitions", () => {
  it("press transition contains DURATION_PRESS ms", () => {
    expect(transitions.press).toContain(`${DURATION_PRESS}ms`);
  });

  it("hover transition contains DURATION_HOVER ms", () => {
    expect(transitions.hover).toContain(`${DURATION_HOVER}ms`);
  });

  it("modal transition contains DURATION_MODAL ms", () => {
    expect(transitions.modal).toContain(`${DURATION_MODAL}ms`);
  });

  it("page transition contains DURATION_PAGE ms", () => {
    expect(transitions.page).toContain(`${DURATION_PAGE}ms`);
  });
});

describe("motionTransitions", () => {
  it("press duration is DURATION_PRESS/1000 seconds", () => {
    expect(motionTransitions.press.duration).toBeCloseTo(DURATION_PRESS / 1000);
  });

  it("hover duration is DURATION_HOVER/1000 seconds", () => {
    expect(motionTransitions.hover.duration).toBeCloseTo(DURATION_HOVER / 1000);
  });

  it("modal duration is DURATION_MODAL/1000 seconds", () => {
    expect(motionTransitions.modal.duration).toBeCloseTo(DURATION_MODAL / 1000);
  });

  it("page duration is DURATION_PAGE/1000 seconds", () => {
    expect(motionTransitions.page.duration).toBeCloseTo(DURATION_PAGE / 1000);
  });

  it("all ease arrays have 4 elements", () => {
    for (const key of Object.keys(motionTransitions) as Array<keyof typeof motionTransitions>) {
      expect(motionTransitions[key].ease).toHaveLength(4);
    }
  });
});

describe("shadows", () => {
  it("raised shadow has two layers", () => {
    expect(shadows.raised).toContain("rgba");
    expect(shadows.raised.split(",").length).toBeGreaterThanOrEqual(2);
  });

  it("pressed shadow is inset", () => {
    expect(shadows.pressed).toContain("inset");
  });

  it("glow shadows reference expected colours", () => {
    expect(shadows.glowAudio).toContain("74,144,217");
    expect(shadows.glowMidi).toContain("43,196,196");
    expect(shadows.glowCv).toContain("232,168,56");
  });
});

describe("cssMotionVar", () => {
  it.each(["press", "hover", "modal", "page"] as const)(
    "returns var(--motion-%s) for token %s",
    (token) => {
      expect(cssMotionVar(token)).toBe(`var(--motion-${token})`);
    },
  );
});

describe("cssShadowVar", () => {
  it("raised -> var(--shadow-raised)", () => {
    expect(cssShadowVar("raised")).toBe("var(--shadow-raised)");
  });

  it("pressed -> var(--shadow-pressed)", () => {
    expect(cssShadowVar("pressed")).toBe("var(--shadow-pressed)");
  });

  it("glowAudio -> var(--shadow-glow-audio)", () => {
    expect(cssShadowVar("glowAudio")).toBe("var(--shadow-glow-audio)");
  });

  it("glowMidi -> var(--shadow-glow-midi)", () => {
    expect(cssShadowVar("glowMidi")).toBe("var(--shadow-glow-midi)");
  });

  it("glowCv -> var(--shadow-glow-cv)", () => {
    expect(cssShadowVar("glowCv")).toBe("var(--shadow-glow-cv)");
  });
});
