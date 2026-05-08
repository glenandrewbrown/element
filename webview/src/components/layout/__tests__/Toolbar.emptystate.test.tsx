/**
 * H-cov-5 (3/3): Toolbar — §3.6 honest empty state for LIVE/IDLE indicator.
 *
 * DEVIATION NOTE: Toolbar.tsx does NOT use selectHasHostData directly for the
 * LIVE/IDLE badge. It uses selectEngineRunning from useEngineSnapshotStore
 * (Toolbar.tsx line 76). When engineRunning=false the badge shows "IDLE"
 * (Toolbar.tsx line 272: `{engineRunning ? "LIVE" : "IDLE"}`).
 * The §3.6 "no host data → disabled contract" maps to engineRunning=false →
 * "IDLE" text, which is the honest empty state for the transport indicator.
 *
 * The LIVE/IDLE span is in perform mode only; we switch useAppStore to
 * "perform" to expose that section of the render tree.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../../test/mockJuceBridge";
import { useEngineSnapshotStore } from "../../../stores/useEngineSnapshotStore";
import { useAppStore } from "../../../stores/useAppStore";
import { usePerformStore } from "../../../stores/usePerformStore";
import { useGraphStore } from "../../../stores/useGraphStore";
import { useSessionStore } from "../../../stores/useSessionStore";
import { Toolbar } from "../Toolbar";

function resetStores(): void {
  useEngineSnapshotStore.getState().stopPolling();
  useEngineSnapshotStore.setState({
    cpu: 0,
    engineRunning: false,
    sampleRate: 0,
    bufferSize: 0,
    deviceName: "",
    deviceLatencyInputMs: 0,
    deviceLatencyOutputMs: 0,
    transportPlaying: false,
    transportRecording: false,
    tempoBpm: 120,
    timeSig: [4, 4] as [number, number],
    transportFrame: 0,
    transportTimecode: "1.1.0",
    lastUpdated: 0,
    hasHostData: false,
  });

  useAppStore.setState({ mode: "perform" });

  useGraphStore.setState({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
  });

  usePerformStore.setState((s) => ({
    scenes: [],
    liveHealth: {
      ...s.liveHealth,
      cpu: 0,
      outputPeak: 0,
    },
  }));

  useSessionStore.setState({ filePath: "", dirty: false, graphs: [] });
}

describe("Toolbar — §3.6 honest empty state (LIVE/IDLE badge)", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
  });

  afterEach(() => {
    bridge.uninstall();
    useEngineSnapshotStore.getState().stopPolling();
    useAppStore.setState({ mode: "edit" });
  });

  it("(H-cov-5c) shows IDLE badge in perform mode when engineRunning is false", () => {
    act(() => {
      useEngineSnapshotStore.setState({ engineRunning: false });
      useAppStore.setState({ mode: "perform" });
    });

    render(<Toolbar />);

    expect(screen.getByText("IDLE")).toBeInTheDocument();
    expect(screen.queryByText("LIVE")).not.toBeInTheDocument();
  });
});
