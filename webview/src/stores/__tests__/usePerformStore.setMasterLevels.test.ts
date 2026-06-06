/**
 * usePerformStore.setMasterLevels — gap coverage.
 *
 * Uncovered branches (lines 137-157, 328-329):
 *   1. Epsilon no-op — all three values within EPS → same `liveHealth` reference
 *   2. Non-finite value (NaN / Infinity) → falls back to prior value
 *   3. Out-of-range values (< 0, > 1) → clamped
 *   4. Partial payload (only outL provided) → other values unchanged
 *   5. selectIsParameterMapped selector
 *   6. selectOutputPeakL / selectOutputPeakR / selectInputPeak selectors
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bridge/juceBackend", () => ({
  invokeElementNative: vi.fn(async () => undefined),
}));
vi.mock("../../bridge/nativePerform", () => ({
  nativePerformSetActiveScene: vi.fn(async () => true),
}));

import {
  usePerformStore,
  selectIsParameterMapped,
  selectOutputPeakL,
  selectOutputPeakR,
  selectInputPeak,
} from "../usePerformStore";

const DEFAULT_HEALTH = {
  cpu: 0, buffer: 0, latency: 0, clock: "—", bpm: 120,
  timecode: "—", sampleRateLabel: "—", alerts: [],
  ioActivity: "nominal" as const,
  outputPeak: 0, outputPeakL: 0, outputPeakR: 0, inputPeak: 0,
};

function resetStore() {
  usePerformStore.setState({
    sessionName: "Project",
    macros: [], scenes: [],
    liveHealth: { ...DEFAULT_HEALTH },
    isPlaying: false,
    mapModeActive: false,
    mappedParameters: new Set(),
  });
}

// ── epsilon no-op ────────────────────────────────────────────────────────────

describe("setMasterLevels — epsilon no-op", () => {
  beforeEach(resetStore);

  it("returns same liveHealth reference when all values within EPS", () => {
    // Seed a known state first
    usePerformStore.getState().setMasterLevels({ outL: 0.5, outR: 0.5, input: 0.3 });
    const ref1 = usePerformStore.getState().liveHealth;

    // Push identical values — epsilon guard fires, same ref
    usePerformStore.getState().setMasterLevels({ outL: 0.5, outR: 0.5, input: 0.3 });
    const ref2 = usePerformStore.getState().liveHealth;

    expect(ref2).toBe(ref1);
  });

  it("returns new object when outL moves beyond EPS", () => {
    usePerformStore.getState().setMasterLevels({ outL: 0.5, outR: 0.5, input: 0.3 });
    const ref1 = usePerformStore.getState().liveHealth;

    usePerformStore.getState().setMasterLevels({ outL: 0.502, outR: 0.5, input: 0.3 });
    const ref2 = usePerformStore.getState().liveHealth;

    expect(ref2).not.toBe(ref1);
    expect(ref2.outputPeakL).toBeCloseTo(0.502);
  });

  it("within-EPS values still write nothing (reference identity)", () => {
    usePerformStore.getState().setMasterLevels({ outL: 0.5, outR: 0.5, input: 0.0 });
    const ref1 = usePerformStore.getState().liveHealth;

    // Sub-epsilon delta
    usePerformStore.getState().setMasterLevels({ outL: 0.5004, outR: 0.5003, input: 0.0002 });
    const ref2 = usePerformStore.getState().liveHealth;

    expect(ref2).toBe(ref1);
  });
});

// ── non-finite values ────────────────────────────────────────────────────────

describe("setMasterLevels — non-finite / undefined values", () => {
  beforeEach(resetStore);

  it("NaN for outL falls back to current outputPeakL (stays 0)", () => {
    usePerformStore.getState().setMasterLevels({ outL: NaN, outR: 0.5, input: 0.1 });
    expect(usePerformStore.getState().liveHealth.outputPeakL).toBe(0);
    expect(usePerformStore.getState().liveHealth.outputPeakR).toBeCloseTo(0.5);
  });

  it("Infinity for outR falls back to current outputPeakR (stays 0)", () => {
    usePerformStore.getState().setMasterLevels({ outL: 0.4, outR: Infinity, input: 0.2 });
    expect(usePerformStore.getState().liveHealth.outputPeakR).toBe(0);
  });

  it("-Infinity for input falls back to current inputPeak (stays 0)", () => {
    usePerformStore.getState().setMasterLevels({ outL: 0.3, outR: 0.3, input: -Infinity });
    expect(usePerformStore.getState().liveHealth.inputPeak).toBe(0);
  });

  it("undefined fields leave prior values untouched", () => {
    usePerformStore.getState().setMasterLevels({ outL: 0.6, outR: 0.7, input: 0.4 });
    const snapshot = usePerformStore.getState().liveHealth;

    // Only update outL
    usePerformStore.getState().setMasterLevels({ outL: 0.1 });
    const after = usePerformStore.getState().liveHealth;

    expect(after.outputPeakL).toBeCloseTo(0.1);
    expect(after.outputPeakR).toBe(snapshot.outputPeakR);
    expect(after.inputPeak).toBe(snapshot.inputPeak);
  });
});

// ── clamping ─────────────────────────────────────────────────────────────────

describe("setMasterLevels — clamping", () => {
  beforeEach(resetStore);

  it("values > 1.0 are clamped to 1", () => {
    usePerformStore.getState().setMasterLevels({ outL: 2.5, outR: 1.5, input: 99 });
    const h = usePerformStore.getState().liveHealth;
    expect(h.outputPeakL).toBe(1);
    expect(h.outputPeakR).toBe(1);
    expect(h.inputPeak).toBe(1);
  });

  it("values < 0 are clamped to 0", () => {
    // Seed with non-zero so the epsilon guard doesn't fire
    usePerformStore.getState().setMasterLevels({ outL: 0.5, outR: 0.5, input: 0.5 });
    usePerformStore.getState().setMasterLevels({ outL: -0.5, outR: -1, input: -99 });
    const h = usePerformStore.getState().liveHealth;
    expect(h.outputPeakL).toBe(0);
    expect(h.outputPeakR).toBe(0);
    expect(h.inputPeak).toBe(0);
  });
});

// ── selectors ────────────────────────────────────────────────────────────────

describe("selectOutputPeakL / selectOutputPeakR / selectInputPeak", () => {
  beforeEach(resetStore);

  it("selectors reflect setMasterLevels values", () => {
    usePerformStore.getState().setMasterLevels({ outL: 0.8, outR: 0.6, input: 0.4 });
    const s = usePerformStore.getState();
    expect(selectOutputPeakL(s)).toBeCloseTo(0.8);
    expect(selectOutputPeakR(s)).toBeCloseTo(0.6);
    expect(selectInputPeak(s)).toBeCloseTo(0.4);
  });
});

describe("selectIsParameterMapped", () => {
  beforeEach(resetStore);

  it("returns false when parameter not mapped", () => {
    const s = usePerformStore.getState();
    expect(selectIsParameterMapped("node1", 0)(s)).toBe(false);
  });

  it("returns true after parameter is added to mappedParameters", () => {
    usePerformStore.setState({ mappedParameters: new Set(["node1:0"]) });
    const s = usePerformStore.getState();
    expect(selectIsParameterMapped("node1", 0)(s)).toBe(true);
    expect(selectIsParameterMapped("node1", 1)(s)).toBe(false);
  });
});
