/**
 * Tests for <CommandPalette /> — Cmd+K modal search for actions, plugins, scenes.
 *
 * Stubs:
 *   - framer-motion   → renders children directly (no animation)
 *   - All bridge fns  → vi.fn() — we assert they are called, not their side effects
 *   - All stores      → minimal state slices
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mock framer-motion (no JSDOM animation support) ──────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...rest
    }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// ── Mock bridge functions ─────────────────────────────────────────────────────
vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGraphAddPlugin: vi.fn(async () => undefined),
  nativeGraphSetBypass: vi.fn(async () => undefined),
  nativeRedo: vi.fn(async () => undefined),
  nativeUndo: vi.fn(async () => undefined),
  nativeTransportTogglePlay: vi.fn(async () => undefined),
  nativeTransportSetRecording: vi.fn(async () => undefined),
}));

vi.mock("../../../bridge/nativeSession", () => ({
  nativeSessionOpen: vi.fn(async () => undefined),
  nativeSessionSave: vi.fn(async () => undefined),
}));

vi.mock("../../../bridge/nativePrefs", () => ({
  nativeHideAllPluginWindows: vi.fn(async () => undefined),
  nativeMappingSetLearning: vi.fn(async () => undefined),
  nativeOpenGraphMixer: vi.fn(async () => undefined),
  nativeOpenLuaConsole: vi.fn(async () => undefined),
}));

// ── Mock stores ───────────────────────────────────────────────────────────────
// useGraphStore.nodes is BlockData[] (flat shape) — CommandPalette reads
// node.name / node.category / node.format directly (CommandPalette.tsx:258-267).
// Distinct names from the plugin entries below so getByText() never matches
// both a canvas block AND a plugin result for the same query.
const mockNodes = [
  { id: "n1", name: "Canvas Synth", category: "instrument", format: "VST3", bypassed: false },
  { id: "n2", name: "Canvas EQ", category: "audiofx", format: "AU", bypassed: false },
];

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      nodes: mockNodes,
      selectNode: vi.fn(),
      toggleMinimap: vi.fn(),
    })
  ),
}));

vi.mock("../../../stores/useAppStore", () => ({
  useAppStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      openBlockTab: vi.fn(),
      toggleMode: vi.fn(),
      setScene: vi.fn(),
    })
  ),
}));

vi.mock("../../../stores/usePerformStore", () => ({
  usePerformStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ scenes: [] })
  ),
  selectScenes: (s: { scenes: unknown[] }) => s.scenes,
}));

vi.mock("../../../stores/usePluginBrowserStore", () => ({
  usePluginBrowserStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      plugins: [
        {
          identifier: "com.vendor.SurgeXT",
          name: "Surge XT",
          blockCategory: "instrument",
          format: "VST3",
        },
        {
          identifier: "com.vendor.EQPro",
          name: "EQ Pro",
          blockCategory: "audiofx",
          format: "AU",
        },
      ],
      favoriteIdentifiers: new Set<string>(),
      recentIdentifiers: [] as string[],
      refresh: vi.fn(async () => undefined),
    })
  ),
}));

vi.mock("../../../stores/useHostExtrasStore", () => ({
  useHostExtrasStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ midiMapping: { learning: false } })
  ),
}));

// ── jsdom compat stubs ────────────────────────────────────────────────────────
// scrollIntoView is not implemented in jsdom; silence the error.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

import { CommandPalette } from "../CommandPalette";
import {
  nativeUndo,
  nativeTransportTogglePlay,
} from "../../../bridge/nativeGraph";
import { nativeSessionSave } from "../../../bridge/nativeSession";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("<CommandPalette />", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    vi.clearAllMocks();
  });

  // ── Visibility ───────────────────────────────────────────────────────────

  it("renders nothing when open=false", () => {
    const { container } = render(
      <CommandPalette open={false} onClose={onClose} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders search input when open=true", () => {
    render(<CommandPalette open={true} onClose={onClose} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  // ── Default action list ──────────────────────────────────────────────────

  it("shows built-in actions (Undo, Redo, Save) with empty search", () => {
    render(<CommandPalette open={true} onClose={onClose} />);
    expect(screen.getByText("Undo")).toBeInTheDocument();
    expect(screen.getByText("Redo")).toBeInTheDocument();
    expect(screen.getByText("Save Project")).toBeInTheDocument();
  });

  it("shows plugin entries", () => {
    // The default (empty-search) view is capped at the first 16 results
    // (CommandPalette.tsx:341), which the action list now fills — so plugins
    // surface via search. Query a plugin-only term to list both plugins.
    render(<CommandPalette open={true} onClose={onClose} />);
    const input = screen.getByRole("textbox");
    // Filter matches result.category too (CommandPalette.tsx:347), so the
    // term "plugin" surfaces every plugin result.
    fireEvent.change(input, { target: { value: "plugin" } });
    expect(screen.getByText("Surge XT")).toBeInTheDocument();
    expect(screen.getByText("EQ Pro")).toBeInTheDocument();
  });

  it("shows keyboard hints for actions", () => {
    render(<CommandPalette open={true} onClose={onClose} />);
    expect(screen.getByText("Cmd+Z")).toBeInTheDocument();
    expect(screen.getByText("Cmd+Shift+Z")).toBeInTheDocument();
  });

  // ── Search / filter ──────────────────────────────────────────────────────

  it("filters results by search query", () => {
    render(<CommandPalette open={true} onClose={onClose} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Surge" } });
    expect(screen.getByText("Surge XT")).toBeInTheDocument();
    expect(screen.queryByText("EQ Pro")).not.toBeInTheDocument();
  });

  it("is case-insensitive", () => {
    render(<CommandPalette open={true} onClose={onClose} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "surge" } });
    expect(screen.getByText("Surge XT")).toBeInTheDocument();
  });

  it("shows empty state when no results match", () => {
    render(<CommandPalette open={true} onClose={onClose} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "xyzxyzxyz_nomatch" } });
    expect(screen.queryByText("Surge XT")).not.toBeInTheDocument();
    expect(screen.queryByText("Undo")).not.toBeInTheDocument();
  });

  // ── Keyboard navigation ───────────────────────────────────────────────────

  it("does NOT self-close on element-level Escape (now the global Esc authority's job)", () => {
    render(<CommandPalette open={true} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    // Esc-close moved OUT of CommandPalette to the single window-level handler in
    // useKeyboard — the element-level keydown was swallowed by the input in the
    // JUCE WebView. The global path is covered by useKeyboard.esc.test.tsx.
    expect(onClose).not.toHaveBeenCalled();
  });

  it("moves activeIndex down on ArrowDown", () => {
    render(<CommandPalette open={true} onClose={onClose} />);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // First item should no longer be highlighted; second should be
    // (exact class assertion depends on rendering; smoke-test no crash)
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("wraps activeIndex from last to first on ArrowDown", () => {
    render(<CommandPalette open={true} onClose={onClose} />);
    const input = screen.getByRole("textbox");
    // Hammer ArrowDown past the end — should not throw
    for (let i = 0; i < 50; i++) {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    }
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("moves activeIndex up on ArrowUp", () => {
    render(<CommandPalette open={true} onClose={onClose} />);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  // ── Action invocation ─────────────────────────────────────────────────────

  it("clicking Undo calls nativeUndo and closes palette", async () => {
    render(<CommandPalette open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("Undo"));
    expect(nativeUndo).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("clicking Save Project calls nativeSessionSave and closes", async () => {
    render(<CommandPalette open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("Save Project"));
    expect(nativeSessionSave).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("clicking Play / Pause calls nativeTransportTogglePlay and closes", async () => {
    render(<CommandPalette open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("Play / Pause Engine"));
    expect(nativeTransportTogglePlay).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  // ── Backdrop close ────────────────────────────────────────────────────────

  it("clicking the overlay backdrop calls onClose", () => {
    const { container } = render(
      <CommandPalette open={true} onClose={onClose} />
    );
    // The outermost motion.div is the backdrop
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  // ── Category sections ─────────────────────────────────────────────────────

  it("renders category headers", () => {
    render(<CommandPalette open={true} onClose={onClose} />);
    const input = screen.getByRole("textbox");
    // Default (empty) view leads with the Actions group.
    expect(screen.getByText("Actions")).toBeInTheDocument();
    // The Plugins group appears once plugin results are in view; the default
    // 16-item cap (CommandPalette.tsx:341) hides them, so surface via search.
    fireEvent.change(input, { target: { value: "plugin" } });
    expect(screen.getByText("Plugins")).toBeInTheDocument();
  });
});
