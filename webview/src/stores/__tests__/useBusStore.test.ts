/**
 * Tests for useBusStore — wireless cable bus mapping (Phase 5B).
 *
 * Pure client-side store: no JUCE bridge calls. Reset state between tests
 * via `clearAll`.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { CableData } from "../../data/types";
import {
  useBusStore,
  selectCableBusMap,
  selectIsCableWireless,
  selectBusName,
  deriveBuses,
  suggestBusName,
} from "../useBusStore";

beforeEach(() => {
  useBusStore.getState().clearAll();
});

describe("useBusStore — actions", () => {
  it("setBusForCable assigns a name to a cable", () => {
    useBusStore.getState().setBusForCable("c1", "Reverb A");
    expect(useBusStore.getState().getBusForCable("c1")).toBe("Reverb A");
  });

  it("setBusForCable trims whitespace before storing", () => {
    useBusStore.getState().setBusForCable("c1", "  Send 1  ");
    expect(useBusStore.getState().getBusForCable("c1")).toBe("Send 1");
  });

  it("setBusForCable with undefined removes the cable", () => {
    useBusStore.getState().setBusForCable("c1", "X");
    useBusStore.getState().setBusForCable("c1", undefined);
    expect(useBusStore.getState().getBusForCable("c1")).toBeUndefined();
  });

  it("setBusForCable with empty-string removes the cable", () => {
    useBusStore.getState().setBusForCable("c1", "X");
    useBusStore.getState().setBusForCable("c1", "   ");
    expect(useBusStore.getState().getBusForCable("c1")).toBeUndefined();
  });

  it("renameBus updates all cables on the old name", () => {
    const s = useBusStore.getState();
    s.setBusForCable("c1", "A");
    s.setBusForCable("c2", "A");
    s.setBusForCable("c3", "B");
    s.renameBus("A", "Alpha");
    expect(useBusStore.getState().getBusForCable("c1")).toBe("Alpha");
    expect(useBusStore.getState().getBusForCable("c2")).toBe("Alpha");
    expect(useBusStore.getState().getBusForCable("c3")).toBe("B");
  });

  it("renameBus is a no-op when from/to are equal", () => {
    useBusStore.getState().setBusForCable("c1", "A");
    const before = useBusStore.getState().cableBus;
    useBusStore.getState().renameBus("A", "A");
    expect(useBusStore.getState().cableBus).toBe(before);
  });

  it("renameBus is a no-op on empty strings", () => {
    useBusStore.getState().setBusForCable("c1", "A");
    const before = useBusStore.getState().cableBus;
    useBusStore.getState().renameBus("", "X");
    expect(useBusStore.getState().cableBus).toBe(before);
    useBusStore.getState().renameBus("A", "");
    expect(useBusStore.getState().cableBus).toBe(before);
  });

  it("clearAll wipes every entry", () => {
    const s = useBusStore.getState();
    s.setBusForCable("c1", "A");
    s.setBusForCable("c2", "B");
    s.clearAll();
    expect(useBusStore.getState().cableBus).toEqual({});
  });
});

describe("useBusStore — selectors", () => {
  it("selectCableBusMap returns the raw record", () => {
    useBusStore.getState().setBusForCable("c1", "A");
    const map = selectCableBusMap(useBusStore.getState());
    expect(map).toEqual({ c1: "A" });
  });

  it("selectIsCableWireless is true iff a bus is set", () => {
    useBusStore.getState().setBusForCable("c1", "A");
    const state = useBusStore.getState();
    expect(selectIsCableWireless("c1")(state)).toBe(true);
    expect(selectIsCableWireless("c2")(state)).toBe(false);
  });

  it("selectBusName returns the bus name for an assigned cable", () => {
    useBusStore.getState().setBusForCable("c1", "A");
    expect(selectBusName("c1")(useBusStore.getState())).toBe("A");
    expect(selectBusName("c2")(useBusStore.getState())).toBeUndefined();
  });
});

const cable = (
  id: string,
  signalType: CableData["signalType"] = "audio",
): CableData => ({
  id,
  source: `src-${id}`,
  sourcePort: "out",
  target: `dst-${id}`,
  targetPort: "in",
  signalType,
  channelCount: 2,
  isSidechain: false,
});

describe("deriveBuses", () => {
  it("groups cables sharing a bus name", () => {
    const cables = [cable("c1"), cable("c2"), cable("c3")];
    const map = { c1: "A", c2: "A", c3: "B" };
    const buses = deriveBuses(cables, map);
    const a = buses.find((b) => b.name === "A");
    const b = buses.find((b) => b.name === "B");
    expect(a?.cableIds).toEqual(["c1", "c2"]);
    expect(b?.cableIds).toEqual(["c3"]);
  });

  it("prunes buses whose cable was deleted", () => {
    const cables = [cable("c1")];
    const map = { c1: "Live", c2: "Ghost" };
    const buses = deriveBuses(cables, map);
    expect(buses.map((b) => b.name)).toEqual(["Live"]);
  });

  it("returns buses sorted alphabetically", () => {
    const cables = [cable("c1"), cable("c2"), cable("c3")];
    const map = { c1: "Zeta", c2: "Alpha", c3: "Mid" };
    const buses = deriveBuses(cables, map);
    expect(buses.map((b) => b.name)).toEqual(["Alpha", "Mid", "Zeta"]);
  });

  it("carries the signalType of the first cable on the bus (badge colour)", () => {
    const cables = [cable("c1", "midi"), cable("c2", "audio")];
    const map = { c1: "Mix", c2: "Mix" };
    const [bus] = deriveBuses(cables, map);
    expect(bus.signalType).toBe("midi");
  });

  it("records both source and target endpoints per cable", () => {
    const cables = [cable("c1")];
    const map = { c1: "A" };
    const [bus] = deriveBuses(cables, map);
    expect(bus.endpoints).toHaveLength(2);
    expect(bus.endpoints[0]).toMatchObject({ direction: "source" });
    expect(bus.endpoints[1]).toMatchObject({ direction: "target" });
  });

  it("returns [] when no cables are wireless", () => {
    expect(deriveBuses([cable("c1")], {})).toEqual([]);
  });
});

describe("suggestBusName", () => {
  it("returns Bus 1 when nothing is in use", () => {
    expect(suggestBusName([])).toBe("Bus 1");
  });

  it("skips names already in use", () => {
    expect(suggestBusName(["Bus 1", "Bus 2"])).toBe("Bus 3");
  });

  it("matches case-insensitively when checking existing names", () => {
    expect(suggestBusName(["bus 1", "BUS 2"])).toBe("Bus 3");
  });

  it("picks the lowest free index even when names are out of order", () => {
    expect(suggestBusName(["Bus 3", "Bus 1"])).toBe("Bus 2");
  });
});
