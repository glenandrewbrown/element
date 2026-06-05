// Flow-Debug chip behaviour (logic-routing-flow-debug plan, W3).
//
// chipText/chipActive are pure functions of (signalType, presence, quantised
// CV value) — the chip can never invent data (NOTHING-fake). The store test
// below proves the signed CV `v` field flows and that the epsilon-diff keeps
// references stable for steady values (60Hz discipline).

import { describe, it, expect, beforeEach } from "vitest";
import { chipActive, chipText } from "../Cable";
import { useCableMeterStore } from "../../../stores/useCableMeterStore";
import { useAppStore } from "../../../stores/useAppStore";

describe("chipText", () => {
  it("renders audio presence as a dB readout", () => {
    expect(chipText("audio", 1, undefined)).toBe("0.0 dB");
    expect(chipText("audio", 0.5, undefined)).toBe("-6.0 dB");
    expect(chipText("audio", 0.1, undefined)).toBe("-20.0 dB");
  });

  it("renders silent audio as the idle dash", () => {
    expect(chipText("audio", 0, undefined)).toBe("—");
    expect(chipText("audio", 0.0005, undefined)).toBe("—");
  });

  it("renders CV values signed at 2dp", () => {
    expect(chipText("value", 1, 0.5)).toBe("0.50");
    expect(chipText("value", 1, -0.8)).toBe("-0.80");
    expect(chipText("value", 0, 0)).toBe("0.00");
  });

  it("renders Control-sourced value cables (no numeric feed) as the dash — by design", () => {
    // Host folds Control+CV into "value" but only CV carries `v` (F8).
    expect(chipText("value", 0.75, undefined)).toBe("—");
  });

  it("renders MIDI activity as a dot and idle as dash", () => {
    expect(chipText("midi", 0.75, undefined)).toBe("● midi");
    expect(chipText("midi", 0, undefined)).toBe("—");
  });
});

describe("chipActive", () => {
  it("audio/midi light from presence", () => {
    expect(chipActive("audio", 0.5, undefined)).toBe(true);
    expect(chipActive("audio", 0, undefined)).toBe(false);
    expect(chipActive("midi", 0.75, undefined)).toBe(true);
  });

  it("value lights from the numeric value, not presence", () => {
    expect(chipActive("value", 0, 0.5)).toBe(true);
    expect(chipActive("value", 0, -0.5)).toBe(true);
    expect(chipActive("value", 0.9, undefined)).toBe(false); // Control: no feed
    expect(chipActive("value", 0, 0)).toBe(false);
  });
});

describe("useCableMeterStore values (signed CV feed)", () => {
  beforeEach(() => {
    useCableMeterStore.setState({ levels: {}, values: {} });
  });

  it("stores v per CV cable and omits it for others", () => {
    useCableMeterStore.getState().setCableLevels([
      { id: "cv-1", level: 0.5, v: -0.5 },
      { id: "audio-1", level: 0.8 },
    ]);
    const s = useCableMeterStore.getState();
    expect(s.values["cv-1"]).toBe(-0.5);
    expect(s.values["audio-1"]).toBeUndefined();
    expect(s.levels["audio-1"]).toBe(0.8);
  });

  it("keeps references identical for steady values (epsilon-diff covers v)", () => {
    const push = () =>
      useCableMeterStore.getState().setCableLevels([
        { id: "cv-1", level: 0.5, v: 0.5 },
      ]);
    push();
    const before = useCableMeterStore.getState();
    push();
    const after = useCableMeterStore.getState();
    expect(after.levels).toBe(before.levels);
    expect(after.values).toBe(before.values);
  });

  it("notifies when only the CV value changes (level steady)", () => {
    useCableMeterStore.getState().setCableLevels([{ id: "cv-1", level: 0.5, v: 0.1 }]);
    const before = useCableMeterStore.getState().values;
    useCableMeterStore.getState().setCableLevels([{ id: "cv-1", level: 0.5, v: 0.9 }]);
    const after = useCableMeterStore.getState().values;
    expect(after).not.toBe(before);
    expect(after["cv-1"]).toBe(0.9);
  });
});

describe("useAppStore flowDebug", () => {
  it("defaults off and toggles", () => {
    expect(useAppStore.getState().flowDebug).toBe(false);
    useAppStore.getState().toggleFlowDebug();
    expect(useAppStore.getState().flowDebug).toBe(true);
    useAppStore.getState().toggleFlowDebug();
    expect(useAppStore.getState().flowDebug).toBe(false);
  });
});
