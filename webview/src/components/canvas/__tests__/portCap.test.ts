/**
 * portCap / blockWidth — unit tests for the pure port-cap + adaptive-width
 * helpers (Glen 2026-06-10 Kontakt-screenshot fixes).
 *
 * Port cap (Bug 1): a huge fixed-I/O plugin (Kontakt = 64 audio outs) must not
 * dump a giant column. We cap visible essential rows per side; over-cap rows
 * collapse but stay mounted; CONNECTED ports are always visible (their cable
 * would otherwise orphan). Block width (Bug 2): the chassis grows to fit a long
 * title up to a sane max instead of truncating.
 */

import { describe, it, expect } from "vitest";
import type { Port, SignalType } from "../../../data/types";
import {
  capPorts,
  visiblePortRowCount,
  hasCappedPorts,
  hiddenPortCount,
  PORT_VISIBLE_CAP,
} from "../portCap";
import {
  blockWidthForTitle,
  BLOCK_MIN_WIDTH,
  BLOCK_MAX_WIDTH,
} from "../blockWidth";

function port(
  id: string,
  direction: "input" | "output",
  connected = false,
  type: SignalType = "audio",
): Port {
  return { id, type, direction, label: id, connected };
}

function ports(n: number, connectedIdx: number[] = []): Port[] {
  const set = new Set(connectedIdx);
  return Array.from({ length: n }, (_, i) =>
    port(`p${i}`, "output", set.has(i)),
  );
}

describe("capPorts", () => {
  it("shows everything when at or under the cap", () => {
    const p = ports(PORT_VISIBLE_CAP);
    const { shown, hidden } = capPorts(p, false);
    expect(shown).toHaveLength(PORT_VISIBLE_CAP);
    expect(hidden).toHaveLength(0);
  });

  it("caps the visible rows and collapses the rest", () => {
    const p = ports(64); // Kontakt
    const { shown, hidden } = capPorts(p, false);
    expect(shown).toHaveLength(PORT_VISIBLE_CAP);
    expect(hidden).toHaveLength(64 - PORT_VISIBLE_CAP);
  });

  it("preserves original order in the shown rows", () => {
    const p = ports(20);
    const { shown } = capPorts(p, false);
    expect(shown.map((x) => x.id)).toEqual(
      Array.from({ length: PORT_VISIBLE_CAP }, (_, i) => `p${i}`),
    );
  });

  it("ALWAYS shows a connected port even beyond the cap (rule 1)", () => {
    // 20 ports, the 15th (index 14, beyond the 8-cap) is wired.
    const p = ports(20, [14]);
    const { shown, hidden } = capPorts(p, false);
    expect(shown.some((x) => x.id === "p14")).toBe(true);
    expect(hidden.some((x) => x.id === "p14")).toBe(false);
    // 8 within cap + the 1 connected = 9 shown.
    expect(shown).toHaveLength(PORT_VISIBLE_CAP + 1);
  });

  it("expanded reveals every port (no hidden rows)", () => {
    const p = ports(64);
    const { shown, hidden } = capPorts(p, true);
    expect(shown).toHaveLength(64);
    expect(hidden).toHaveLength(0);
  });
});

describe("visiblePortRowCount", () => {
  it("matches capPorts().shown.length without allocating", () => {
    const p = ports(64, [10, 20]);
    expect(visiblePortRowCount(p, false)).toBe(capPorts(p, false).shown.length);
    expect(visiblePortRowCount(p, true)).toBe(64);
  });
});

describe("hasCappedPorts / hiddenPortCount", () => {
  it("is false when neither side exceeds the cap", () => {
    expect(hasCappedPorts(ports(3), ports(8), false)).toBe(false);
    expect(hiddenPortCount(ports(3), ports(8), false)).toBe(0);
  });

  it("is true when a side exceeds the cap, counting hidden across both", () => {
    const ins = ports(12); // 4 over cap
    const outs = ports(10); // 2 over cap
    expect(hasCappedPorts(ins, outs, false)).toBe(true);
    expect(hiddenPortCount(ins, outs, false)).toBe(4 + 2);
  });

  it("connected over-cap ports do NOT count as hidden", () => {
    const ins = ports(12, [11]); // index 11 wired → 3 hidden, not 4
    expect(hiddenPortCount(ins, [], false)).toBe(3);
  });

  it("expanded ⇒ nothing capped/hidden", () => {
    expect(hasCappedPorts(ports(64), ports(64), true)).toBe(false);
    expect(hiddenPortCount(ports(64), ports(64), true)).toBe(0);
  });
});

describe("blockWidthForTitle", () => {
  it("returns the min width for short/empty titles", () => {
    expect(blockWidthForTitle("")).toBe(BLOCK_MIN_WIDTH);
    expect(blockWidthForTitle("EQ")).toBe(BLOCK_MIN_WIDTH);
  });

  it("widens for a long title", () => {
    const w = blockWidthForTitle("RX 10 De-reverb Advanced");
    expect(w).toBeGreaterThan(BLOCK_MIN_WIDTH);
    expect(w).toBeLessThanOrEqual(BLOCK_MAX_WIDTH);
  });

  it("clamps at the max for a pathological title", () => {
    expect(blockWidthForTitle("x".repeat(200))).toBe(BLOCK_MAX_WIDTH);
  });

  it("is monotonic non-decreasing in title length", () => {
    let prev = 0;
    for (const len of [0, 5, 10, 15, 20, 30, 50]) {
      const w = blockWidthForTitle("x".repeat(len));
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });
});
