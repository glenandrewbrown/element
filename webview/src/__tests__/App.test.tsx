/**
 * App.tsx — unit coverage for PerformBottomPanel, AppInner, and App.
 *
 * Covers:
 *   1. PerformBottomPanel initial tab: "macros" when no widgets, "dashboard" when widgets exist
 *   2. PerformBottomPanel tab switch (Macros ↔ Dashboard)
 *   3. AppInner: PanicButton renders only in perform mode
 *   4. AppInner: CommandPalette closed by default, opened by keyboard
 *   5. AppInner: VirtualKeyboard visible when virtualKeyboardOpen=true
 *   6. AppInner: VirtualKeyboard hidden when virtualKeyboardOpen=false
 *   7. App: renders without crashing (ReactFlowProvider integration smoke)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { useAppStore } from "../stores/useAppStore";
import { useDashboardStore } from "../stores/useDashboardStore";
import { installJuceBridgeMock, type JuceBridgeMock } from "../test/mockJuceBridge";

// ── Mock heavy child components so we can test App logic in isolation ─────────

vi.mock("../components/layout/AppShell", () => ({
  AppShell: ({ children, toolbar, editLeftPanel, editRightPanel, editBottomPanel,
               performLeftPanel, performRightPanel, performBottomPanel, statusBar }:
    Record<string, unknown>) => (
    <div data-testid="app-shell">
      <div data-testid="toolbar">{toolbar as any}</div>
      <div data-testid="edit-left">{editLeftPanel as any}</div>
      <div data-testid="edit-right">{editRightPanel as any}</div>
      <div data-testid="edit-bottom">{editBottomPanel as any}</div>
      <div data-testid="perform-left">{performLeftPanel as any}</div>
      <div data-testid="perform-right">{performRightPanel as any}</div>
      <div data-testid="perform-bottom">{performBottomPanel as any}</div>
      <div data-testid="status-bar">{statusBar as any}</div>
      <div data-testid="canvas">{children as any}</div>
    </div>
  ),
}));

vi.mock("../components/layout/Toolbar", () => ({ Toolbar: () => <div>Toolbar</div> }));
vi.mock("../components/layout/ToolPalette", () => ({ ToolPalette: () => <div>ToolPalette</div> }));
vi.mock("../components/layout/InspectorHub", () => ({ InspectorHub: () => <div>InspectorHub</div> }));
vi.mock("../components/layout/SnippetShelf", () => ({ SnippetShelf: () => <div>SnippetShelf</div> }));
vi.mock("../components/layout/QuickAccess", () => ({ QuickAccess: () => <div>QuickAccess</div> }));
vi.mock("../components/layout/SessionTree", () => ({ SessionTree: () => <div>SessionTree</div> }));
vi.mock("../components/layout/LiveHealth", () => ({ LiveHealth: () => <div>LiveHealth</div> }));
vi.mock("../components/layout/StatusBar", () => ({ StatusBar: () => <div>StatusBar</div> }));
vi.mock("../components/layout/VirtualKeyboard", () => ({
  VirtualKeyboard: () => <div data-testid="virtual-keyboard">VirtualKeyboard</div>,
}));
vi.mock("../components/layout/MacroDashboard", () => ({
  MacroDashboard: () => <div data-testid="macro-dashboard">MacroDashboard</div>,
  PanicButton: () => <button data-testid="panic-button">PANIC</button>,
}));
vi.mock("../components/layout/DashboardBuilder", () => ({
  DashboardBuilder: () => <div data-testid="dashboard-builder">DashboardBuilder</div>,
}));
vi.mock("../components/canvas/GraphCanvas", () => ({
  GraphCanvas: () => <div data-testid="graph-canvas">GraphCanvas</div>,
}));
vi.mock("../components/canvas/CommandPalette", () => ({
  CommandPalette: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    open ? <div data-testid="command-palette" onClick={onClose}>CommandPalette</div> : null
  ),
}));
vi.mock("../hooks/useKeyboard", () => ({
  useKeyboard: ({ onToggleCommandPalette }: { onToggleCommandPalette: () => void }) => {
    // Expose toggle via a global so tests can trigger it
    (globalThis as any).__testTogglePalette = onToggleCommandPalette;
  },
}));
vi.mock("../hooks/useJuceBridge", () => ({ useJuceBridge: () => {} }));
vi.mock("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── import App AFTER mocks ────────────────────────────────────────────────────
import App from "../App";

// ── store reset helpers ───────────────────────────────────────────────────────

function resetStores() {
  useAppStore.setState({
    mode: "edit",
    virtualKeyboardOpen: false,
    leftPanelOpen: true,
    rightPanelOpen: true,
    bottomPanelOpen: true,
    openBlockTabs: [],
    spatialBookmarks: {},
    cableRouting: "manhattan",
    activeScene: 0,
    hostReady: false,
    refreshNonce: 0,
  });
  useDashboardStore.setState({ widgets: [] });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("App — smoke", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
  });

  afterEach(() => {
    bridge.uninstall();
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<App />);
    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
  });
});

describe("PerformBottomPanel — initial tab", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
  });

  afterEach(() => {
    bridge.uninstall();
    vi.clearAllMocks();
  });

  // QUARANTINE: Dashboard/Macro feature shelved D3 2026-05-30
  it.skip('defaults to "macros" tab when no dashboard widgets', () => {
    useDashboardStore.setState({ widgets: [] });
    render(<App />);
    expect(screen.getByTestId("macro-dashboard")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-builder")).not.toBeInTheDocument();
  });

  // QUARANTINE: Dashboard/Macro feature shelved D3 2026-05-30
  it.skip('defaults to "dashboard" tab when widgets exist', () => {
    useDashboardStore.setState({
      widgets: [{ id: "w1", kind: "meter", x: 0, y: 0, w: 2, h: 2, label: "Out", nodeId: "b1", paramIndex: 0 }],
    });
    render(<App />);
    expect(screen.getByTestId("dashboard-builder")).toBeInTheDocument();
    expect(screen.queryByTestId("macro-dashboard")).not.toBeInTheDocument();
  });

  // QUARANTINE: Dashboard/Macro feature shelved D3 2026-05-30
  it.skip("switches from macros to dashboard on tab click", () => {
    useDashboardStore.setState({ widgets: [] });
    render(<App />);
    expect(screen.getByTestId("macro-dashboard")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Dashboard"));
    expect(screen.getByTestId("dashboard-builder")).toBeInTheDocument();
    expect(screen.queryByTestId("macro-dashboard")).not.toBeInTheDocument();
  });

  // QUARANTINE: Dashboard/Macro feature shelved D3 2026-05-30
  it.skip("switches from dashboard back to macros on tab click", () => {
    useDashboardStore.setState({
      widgets: [{ id: "w1", kind: "meter", x: 0, y: 0, w: 2, h: 2, label: "Out", nodeId: "b1", paramIndex: 0 }],
    });
    render(<App />);
    expect(screen.getByTestId("dashboard-builder")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Macros"));
    expect(screen.getByTestId("macro-dashboard")).toBeInTheDocument();
  });
});

describe("AppInner — PanicButton mode gating", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
  });

  afterEach(() => {
    bridge.uninstall();
    vi.clearAllMocks();
  });

  it("does not render PanicButton in edit mode", () => {
    useAppStore.setState({ mode: "edit" });
    render(<App />);
    expect(screen.queryByTestId("panic-button")).not.toBeInTheDocument();
  });

  // QUARANTINE: Perform mode UI shelved (decision D3, 2026-05-30).
  // PanicButton is not rendered in the current locked-edit build.
  // Restore when Perform mode is revived.
  it.skip("renders PanicButton in perform mode", () => {
    useAppStore.setState({ mode: "perform" });
    render(<App />);
    expect(screen.getByTestId("panic-button")).toBeInTheDocument();
  });
});

describe("AppInner — CommandPalette toggle", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
  });

  afterEach(() => {
    bridge.uninstall();
    vi.clearAllMocks();
    delete (globalThis as any).__testTogglePalette;
  });

  it("CommandPalette is not visible initially", () => {
    render(<App />);
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  it("CommandPalette opens after toggle", () => {
    render(<App />);
    act(() => {
      (globalThis as any).__testTogglePalette?.();
    });
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();
  });

  it("CommandPalette closes via onClose", () => {
    render(<App />);
    act(() => {
      (globalThis as any).__testTogglePalette?.();
    });
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("command-palette"));
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });
});

describe("AppInner — VirtualKeyboard visibility", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
  });

  afterEach(() => {
    bridge.uninstall();
    vi.clearAllMocks();
  });

  it("VirtualKeyboard not rendered when virtualKeyboardOpen=false", () => {
    useAppStore.setState({ virtualKeyboardOpen: false });
    render(<App />);
    expect(screen.queryByTestId("virtual-keyboard")).not.toBeInTheDocument();
  });

  it("VirtualKeyboard rendered when virtualKeyboardOpen=true", () => {
    useAppStore.setState({ virtualKeyboardOpen: true });
    render(<App />);
    expect(screen.getByTestId("virtual-keyboard")).toBeInTheDocument();
  });
});
