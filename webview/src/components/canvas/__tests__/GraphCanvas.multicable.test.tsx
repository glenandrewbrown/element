/**
 * GraphCanvas — multi-cable fan-out from a single OUTPUT port (Wave-3 Task 2.2).
 *
 * Owner bug: "cannot draw multiple cables out of a single output port."
 *
 * The LIVE Playwright repro (Storybook, real @xyflow/react v12) pinned the root
 * cause to **Block.tsx**, NOT GraphCanvas: the Block root wrapper
 * `.nodeblock-v3` is `overflow-hidden`, which CLIPS the React-Flow `<Handle>`
 * hit-area that protrudes past the node box (port wells sit at left/right: -7),
 * leaving most of each output socket unclickable. With `overflow: visible` on
 * `.nodeblock-v3` the same drag fans out 3 cables / 3 engine connects. That fix
 * is the Block.tsx owner's lane (coordination note in the wave report).
 *
 * What GraphCanvas (THIS lane) owns is the connect *path* + the React-Flow
 * interaction prop set. Both were proven CORRECT for fan-out:
 *   - an isolation harness with the EXACT D1 props (`selectionOnDrag` +
 *     `panOnDrag={[1,2]}` + `panActivationKeyCode="Space"` + Partial) on real RF
 *     with default handles fanned out 3/3, disproving the "panOnDrag/selectionOnDrag
 *     swallows the 2nd connect" (xyflow #5563) hypothesis;
 *   - `onConnect` has no replace/dedup — N connections from one source yield N
 *     `nativeGraphConnect` calls.
 *
 * These tests LOCK that contract so the connect path / interaction props can
 * never silently regress to drop a fan-out connect (the failure class the owner
 * reported). The real-RF hit-area is covered by the Storybook/Playwright repro
 * (RF's own pointer logic can't run under the mocked-RF unit harness).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

const { capturedProps, mockStore, mockAppStore, mockHostExtras, mockReactFlow } =
  vi.hoisted(() => {
    const store = {
      nodes: [] as Array<{ id: string; name: string; [key: string]: unknown }>,
      edges: [] as unknown[],
      commentBoxes: [] as unknown[],
      selectedNodeId: null as string | null,
      selectedEdgeId: null as string | null,
      minimapVisible: false,
      selectNode: vi.fn(),
      selectEdge: vi.fn(),
      clearSelection: vi.fn(),
      pushBreadcrumb: vi.fn(),
      popBreadcrumb: vi.fn(),
      updateNodePositions: vi.fn(),
      updateCommentBoxLayout: vi.fn(),
      setZoomTier: vi.fn(),
    };
    return {
      capturedProps: {} as Record<string, unknown>,
      mockStore: store,
      mockAppStore: { mode: "edit" as "edit" | "perform", openBlockTab: vi.fn(), embeddedEditorNodeId: null as string | null },
      mockHostExtras: {
        canvas: { snapToGrid: false, gridSize: 8, graphBounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 } },
      },
      mockReactFlow: {
        fitView: vi.fn(),
        screenToFlowPosition: vi.fn(() => ({ x: 0, y: 0 })),
        flowToScreenPosition: vi.fn((p: { x: number; y: number }) => p),
      },
    };
  });

vi.mock("@xyflow/react", () => ({
  ReactFlow: (props: Record<string, unknown>) => {
    Object.assign(capturedProps, props);
    return <div data-testid="react-flow">{props.children as React.ReactNode}</div>;
  },
  Background: () => <div data-testid="rf-background" />,
  MiniMap: () => <div data-testid="rf-minimap" />,
  useNodesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
  useEdgesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
  useReactFlow: vi.fn(() => mockReactFlow),
  useStoreApi: vi.fn(() => ({
    getState: () => ({ nodeLookup: new Map(), transform: [0, 0, 1] }),
  })),
  BackgroundVariant: { Dots: "dots" },
  SelectionMode: { Partial: "partial" },
}));

vi.mock("@xyflow/react/dist/style.css", () => ({}));

vi.mock("../../../stores/useGraphStore", () => {
  const fn = vi.fn((sel: (s: typeof mockStore) => unknown) => sel(mockStore));
  (fn as unknown as { getState: () => typeof mockStore }).getState = () => mockStore;
  return {
    useGraphStore: fn,
    zoomToTier: vi.fn(() => "normal"),
    selectBreadcrumbs: (s: { breadcrumbStack?: string[] }) => s.breadcrumbStack ?? [],
  };
});

vi.mock("../../../stores/useAppStore", () => {
  const fn = vi.fn((sel: (s: typeof mockAppStore) => unknown) => sel(mockAppStore));
  (fn as unknown as { getState: () => typeof mockAppStore }).getState = () => mockAppStore;
  return { useAppStore: fn };
});

vi.mock("../../../stores/useHostExtrasStore", () => ({
  useHostExtrasStore: vi.fn((sel: (s: typeof mockHostExtras) => unknown) => sel(mockHostExtras)),
}));

const mockNativeGraph = vi.hoisted(() => ({
  nativeEnterContainer: vi.fn(async () => true),
  nativeExitContainer: vi.fn(async () => true),
  nativeGraphCommentAdd: vi.fn(),
  nativeGraphCommentUpsert: vi.fn(),
  nativeGraphConnect: vi.fn(),
  nativeGraphDisconnect: vi.fn(),
  nativeGraphMoveNodes: vi.fn(),
  nativeGraphRenameNode: vi.fn(),
  nativeGraphSetViewport: vi.fn(),
}));
vi.mock("../../../bridge/nativeGraph", () => mockNativeGraph);
vi.mock("../../../bridge/nativePluginEditor", () => ({
  nativePluginEditorOpen: vi.fn(),
  nativePluginEditorClose: vi.fn(),
}));

vi.mock("../Block", () => ({ Block: () => <div data-testid="block" /> }));
vi.mock("../Cable", () => ({ Cable: () => null }));
vi.mock("../CommentFrame", () => ({ CommentFrame: () => null }));
vi.mock("../QuickAddPopup", () => ({ QuickAddPopup: () => null }));
vi.mock("../NodeContextMenu", () => ({ NodeContextMenu: () => null }));
vi.mock("../EdgeContextMenu", () => ({ EdgeContextMenu: () => null }));

import { GraphCanvas } from "../GraphCanvas";

type Connection = {
  source: string | null;
  sourceHandle: string | null;
  target: string | null;
  targetHandle: string | null;
};

describe("GraphCanvas — multi-cable fan-out (Task 2.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppStore.mode = "edit";
    Object.keys(capturedProps).forEach((k) => delete capturedProps[k]);
  });

  it("fans out: 3 cables from ONE output port → 3 nativeGraphConnect calls (no dedup/replace)", () => {
    render(<GraphCanvas />);
    const onConnect = capturedProps.onConnect as (c: Connection) => void;
    expect(typeof onConnect).toBe("function");

    // Same source port (s:out-0) → three different target inputs, exactly what
    // React Flow fires when a user drags a 2nd and 3rd cable off one output.
    onConnect({ source: "s", sourceHandle: "out-0", target: "t1", targetHandle: "in-0" });
    onConnect({ source: "s", sourceHandle: "out-0", target: "t2", targetHandle: "in-0" });
    onConnect({ source: "s", sourceHandle: "out-0", target: "t3", targetHandle: "in-0" });

    expect(mockNativeGraph.nativeGraphConnect).toHaveBeenCalledTimes(3);
    expect(mockNativeGraph.nativeGraphConnect.mock.calls).toEqual([
      ["s", "out-0", "t1", "in-0"],
      ["s", "out-0", "t2", "in-0"],
      ["s", "out-0", "t3", "in-0"],
    ]);
  });

  it("onConnect forwards each connection verbatim — never replaces an existing cable from the same source", () => {
    render(<GraphCanvas />);
    const onConnect = capturedProps.onConnect as (c: Connection) => void;

    // First cable already exists (s:out-0 → t1). A second from the same handle
    // must ADD, not swap — assert both reached the engine, in order.
    onConnect({ source: "s", sourceHandle: "out-0", target: "t1", targetHandle: "in-0" });
    onConnect({ source: "s", sourceHandle: "out-0", target: "t2", targetHandle: "in-0" });

    expect(mockNativeGraph.nativeGraphConnect).toHaveBeenCalledTimes(2);
    // Both distinct targets present — neither call was dropped/deduped.
    const targets = mockNativeGraph.nativeGraphConnect.mock.calls.map((c) => c[2]);
    expect(targets).toEqual(["t1", "t2"]);
  });

  it("locks the D1 interaction prop set that keeps left-button connect-start working (xyflow #5563 guard)", () => {
    render(<GraphCanvas />);
    // SELECT-primary: left-drag marquees (selectionOnDrag), pan is middle/right
    // (panOnDrag=[1,2]) or Space — left button (0) stays free to START a port
    // connection. The live isolation harness proved this combo fans out 3/3.
    expect(capturedProps.selectionOnDrag).toBe(true);
    expect(capturedProps.panOnDrag).toEqual([1, 2]);
    expect(capturedProps.panActivationKeyCode).toBe("Space");
    // panOnDrag MUST NOT include the left button (0): that would make a port
    // drag pan instead of connect — the regression this guard prevents.
    expect(capturedProps.panOnDrag).not.toContain(0);
    expect(capturedProps.nodesConnectable).toBe(true);

    // connectionMode is intentionally left at React Flow's default (Strict),
    // which does NOT cap fan-out (source→many targets is always allowed). If a
    // future change sets it, it must not be a value that blocks fan-out — assert
    // it is either unset (default Strict) or an explicit string we recognise.
    if (capturedProps.connectionMode !== undefined) {
      expect(["strict", "loose"]).toContain(String(capturedProps.connectionMode));
    }
  });
});
