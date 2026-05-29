/**
 * Task 3 — Selector repro audit (deep-app-audit.md lines 330-382).
 *
 * AUDIT-ONLY harness. Applies NO fix. Reproduces or refutes the Zustand v5
 * "getSnapshot should be cached" / "Maximum update depth exceeded" loop for
 * every flagged derived selector, against a POPULATED and an EMPTY store.
 *
 * Mechanism: Zustand v5 forwards a selector's raw result to React's
 * `useSyncExternalStore`, which compares snapshots with `Object.is`. A selector
 * that allocates a NEW object/array every call is never `Object.is`-equal to
 * the previous snapshot, so React re-renders forever and throws
 * "Maximum update depth exceeded" at mount. A selector returning a primitive,
 * a stable store ref, or an existing element ref (`.find`) is stable → no loop.
 *
 * Two POSITIVE CONTROLS (deliberately-bad selectors) prove the harness can
 * actually detect the loop — so a "no loop" result on the flagged selectors is
 * a genuine SAFE verdict, not a blind harness.
 *
 * Evidence written by the companion runner; this file is the deterministic core.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrictMode } from "react";
import { render, cleanup } from "@testing-library/react";

import {
  usePerformStore,
  selectActiveScene,
  selectAlerts,
  selectMappedParameters,
} from "../usePerformStore";
import {
  useGraphStore,
  selectSelectedNode,
  selectSelectedEdge,
} from "../useGraphStore";
import { useDashboardStore, selectWidgets } from "../useDashboardStore";
import { usePluginBrowserStore } from "../usePluginBrowserStore";
import { useHostExtrasStore } from "../useHostExtrasStore";

/* eslint-disable @typescript-eslint/no-explicit-any */

const LOOP_SIGNATURES = [
  "Maximum update depth exceeded",
  "getSnapshot should be cached",
];

/**
 * Mounts a tiny component subscribing `selector` via `useStore` inside
 * StrictMode (double-invoke, the harshest mount). Returns whether the loop
 * signature was observed (thrown or logged) plus the render count.
 */
function probe<TStore, TSel>(
  useStore: (sel: (s: TStore) => TSel) => TSel,
  selector: (s: TStore) => TSel,
): { looped: boolean; reason: string } {
  const counter = { n: 0 };
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  function Harness() {
    counter.n += 1;
    // Subscribe exactly as a real component would.
    const v = useStore(selector);
    return <span data-v={String(v as any)}>{counter.n}</span>;
  }

  let thrown = "";
  try {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
  } catch (e) {
    thrown = (e as Error)?.message ?? String(e);
  }

  const loggedLoop = errSpy.mock.calls
    .map((c) => c.map((x) => String(x)).join(" "))
    .some((line) => LOOP_SIGNATURES.some((sig) => line.includes(sig)));
  const thrownLoop = LOOP_SIGNATURES.some((sig) => thrown.includes(sig));

  errSpy.mockRestore();
  cleanup();

  const looped = loggedLoop || thrownLoop;
  const reason = looped
    ? `loop signature observed (${thrownLoop ? "thrown" : "logged"}); renders=${counter.n}`
    : `no loop; renders=${counter.n}`;
  return { looped, reason };
}

// ── Seed helpers (merge partials; keep store actions intact) ──────────────

function seedPerformPopulated() {
  usePerformStore.setState({
    scenes: [
      { id: "s1", name: "Intro", color: "#4A90D9", active: true } as any,
      { id: "s2", name: "Drop", color: "#E8A838", active: false } as any,
    ],
    liveHealth: {
      cpu: 42,
      bpm: 120,
      timecode: "00:00:01",
      outputPeak: -6,
      alerts: [
        { id: "a1", level: "warn", message: "xrun" } as any,
        { id: "a2", level: "info", message: "synced" } as any,
      ],
    } as any,
    mappedParameters: new Set<string>(["n1:0", "n2:1"]),
  } as any);
}
function seedPerformEmpty() {
  usePerformStore.setState({
    scenes: [],
    liveHealth: {
      cpu: 0,
      bpm: 0,
      timecode: "00:00:00",
      outputPeak: -100,
      alerts: [],
    } as any,
    mappedParameters: new Set<string>(),
  } as any);
}

function seedGraphPopulated() {
  useGraphStore.setState({
    nodes: [
      { id: "n1", name: "Osc", category: "generator", ports: [] } as any,
      { id: "n2", name: "Reverb", category: "effect", ports: [] } as any,
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" } as any],
    selectedNodeId: "n1",
    selectedEdgeId: "e1",
  } as any);
}
function seedGraphEmpty() {
  useGraphStore.setState({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
  } as any);
}

function seedDashPopulated() {
  useDashboardStore.setState({
    widgets: [
      { id: "w1", kind: "meter", x: 0, y: 0, w: 2, h: 2 } as any,
      { id: "w2", kind: "knob", x: 2, y: 0, w: 1, h: 1 } as any,
    ],
  } as any);
}
function seedDashEmpty() {
  useDashboardStore.setState({ widgets: [] } as any);
}

function seedPluginPopulated() {
  usePluginBrowserStore.setState({
    plugins: [
      { identifier: "p1", name: "Synth", format: "VST3" } as any,
      { identifier: "p2", name: "Delay", format: "AU" } as any,
    ],
    favoriteIdentifiers: new Set<string>(["p1"]),
    recentIdentifiers: ["p2", "p1"],
  } as any);
}
function seedPluginEmpty() {
  usePluginBrowserStore.setState({
    plugins: [],
    favoriteIdentifiers: new Set<string>(),
    recentIdentifiers: [],
  } as any);
}

function seedHostPopulated() {
  useHostExtrasStore.setState({
    molecules: [{ id: "m1", name: "Chain A" } as any],
    logLines: ["line a", "line b", "line c"],
  } as any);
}
function seedHostEmpty() {
  useHostExtrasStore.setState({ molecules: [], logLines: [] } as any);
}

// Per-selector results, exported via the test reporter for the verdict doc.
const RESULTS: Record<string, { populated: string; empty: string }> = {};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Task 3 — POSITIVE CONTROLS (harness must detect the loop)", () => {
  it("ctrl-scenes-map: a fresh `.map` array each call SHOULD loop (populated)", () => {
    seedPerformPopulated();
    const r = probe(usePerformStore as any, (s: any) => s.scenes.map((x: any) => x));
    RESULTS["CTRL selectScenesMap (.map fresh array)"] = {
      populated: r.reason,
      empty: "",
    };
    expect(r.looped).toBe(true);
  });

  it("ctrl-scenes-map: fresh `.map` array SHOULD loop even when EMPTY", () => {
    seedPerformEmpty();
    const r = probe(usePerformStore as any, (s: any) => s.scenes.map((x: any) => x));
    RESULTS["CTRL selectScenesMap (.map fresh array)"].empty = r.reason;
    expect(r.looped).toBe(true);
  });

  it("ctrl-obj-literal: a fresh object-literal each call SHOULD loop", () => {
    seedPerformPopulated();
    const r = probe(usePerformStore as any, (s: any) => ({ cpu: s.liveHealth.cpu }));
    RESULTS["CTRL objLiteral ({ ... } fresh)"] = { populated: r.reason, empty: "" };
    expect(r.looped).toBe(true);
  });
});

describe("Task 3 — FLAGGED selectors (reproduce or refute)", () => {
  type Case = {
    key: string;
    store: any;
    sel: (s: any) => any;
    pop: () => void;
    emp: () => void;
  };

  const cases: Case[] = [
    {
      key: "usePerformStore.selectActiveScene:246 (.find)",
      store: usePerformStore,
      sel: selectActiveScene as any,
      pop: seedPerformPopulated,
      emp: seedPerformEmpty,
    },
    {
      key: "usePerformStore.selectAlerts:252 (s.liveHealth.alerts ref)",
      store: usePerformStore,
      sel: selectAlerts as any,
      pop: seedPerformPopulated,
      emp: seedPerformEmpty,
    },
    {
      key: "usePerformStore.selectMappedParameters:244 (s.mappedParameters Set ref)",
      store: usePerformStore,
      sel: selectMappedParameters as any,
      pop: seedPerformPopulated,
      emp: seedPerformEmpty,
    },
    {
      key: "useGraphStore.selectSelectedNode:432 (.find|undefined)",
      store: useGraphStore,
      sel: selectSelectedNode as any,
      pop: seedGraphPopulated,
      emp: seedGraphEmpty,
    },
    {
      key: "useGraphStore.selectSelectedEdge:435 (.find|undefined)",
      store: useGraphStore,
      sel: selectSelectedEdge as any,
      pop: seedGraphPopulated,
      emp: seedGraphEmpty,
    },
    {
      key: "useDashboardStore.selectWidgets:154 (s.widgets ref)",
      store: useDashboardStore,
      sel: selectWidgets as any,
      pop: seedDashPopulated,
      emp: seedDashEmpty,
    },
    {
      key: "usePluginBrowserStore (s.plugins array ref)",
      store: usePluginBrowserStore,
      sel: (s: any) => s.plugins,
      pop: seedPluginPopulated,
      emp: seedPluginEmpty,
    },
    {
      key: "usePluginBrowserStore (s.favoriteIdentifiers Set ref)",
      store: usePluginBrowserStore,
      sel: (s: any) => s.favoriteIdentifiers,
      pop: seedPluginPopulated,
      emp: seedPluginEmpty,
    },
    {
      key: "usePluginBrowserStore (s.recentIdentifiers array ref)",
      store: usePluginBrowserStore,
      sel: (s: any) => s.recentIdentifiers,
      pop: seedPluginPopulated,
      emp: seedPluginEmpty,
    },
    {
      key: "useHostExtrasStore (s.molecules array ref)",
      store: useHostExtrasStore,
      sel: (s: any) => s.molecules,
      pop: seedHostPopulated,
      emp: seedHostEmpty,
    },
    {
      key: "useHostExtrasStore (s.logLines array ref)",
      store: useHostExtrasStore,
      sel: (s: any) => s.logLines,
      pop: seedHostPopulated,
      emp: seedHostEmpty,
    },
  ];

  for (const c of cases) {
    it(`${c.key} — POPULATED store: no loop`, () => {
      c.pop();
      const r = probe(c.store, c.sel);
      RESULTS[c.key] = RESULTS[c.key] ?? { populated: "", empty: "" };
      RESULTS[c.key].populated = r.reason;
      expect(r.looped).toBe(false);
    });

    it(`${c.key} — EMPTY store: no loop`, () => {
      c.emp();
      const r = probe(c.store, c.sel);
      RESULTS[c.key] = RESULTS[c.key] ?? { populated: "", empty: "" };
      RESULTS[c.key].empty = r.reason;
      expect(r.looped).toBe(false);
    });
  }

  it("ZZZ — emit machine-readable results table for the verdict doc", () => {
    // Printed to stdout; the runner greps "TASK3_RESULT" lines into evidence.
    for (const [k, v] of Object.entries(RESULTS)) {
      // eslint-disable-next-line no-console
      console.log(
        `TASK3_RESULT\t${k}\tpopulated=[${v.populated}]\tempty=[${v.empty}]`,
      );
    }
    expect(Object.keys(RESULTS).length).toBeGreaterThan(0);
  });
});
