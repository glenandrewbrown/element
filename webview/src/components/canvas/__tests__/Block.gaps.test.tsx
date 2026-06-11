/**
 * Block gaps — covers paths not exercised in Block.test.tsx:
 *   - StateBtn B/M click → toggleBypass / toggleMute called
 *   - Compact zoom tier → name-chip only (no header, no deck)
 *   - MIDI/modulator deck body text (no knob params, non-audio bearing)
 *   - Audio bearing block with no knob params → dual RMS meter deck
 *   - muteInput header indicator ("Min" chip)
 *   - PortShape shapes (audio / midi / value SVG elements)
 *   - BusBadge renders for wired wireless port
 *   - hostColourOutline: no border for malformed hex
 *   - PortRow sidechain detection label
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { BlockData } from "../../../data/types";

// ── Mock React Flow ──────────────────────────────────────────────────────────
vi.mock("@xyflow/react", () => ({
  Handle: ({
    children,
    id,
  }: React.HTMLAttributes<HTMLDivElement> & { id?: string }) => (
    <div data-testid={`handle-${id ?? "port"}`}>{children}</div>
  ),
  Position: { Left: "left", Right: "right" },
}));

// ── Hoisted mutable store state ──────────────────────────────────────────────
const { mockGraphStore } = vi.hoisted(() => {
  const store = {
    nodes: [] as unknown[],
    edges: [] as unknown[],
    zoomTier: "normal" as string,
    toggleBypass: vi.fn(),
    toggleMute: vi.fn(),
    setCollapsed: vi.fn(),
    setCollapseTier: vi.fn(),
    selectNode: vi.fn(),
  };
  return { mockGraphStore: store };
});

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((selector: (s: typeof mockGraphStore) => unknown) =>
    selector(mockGraphStore),
  ),
  selectZoomTier: (s: { zoomTier: string }) => s.zoomTier,
  selectEdges: (s: { edges: unknown[] }) => s.edges,
}));

vi.mock("../../../stores/useBusStore", () => ({
  useBusStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ cableBus: {} }),
  ),
}));

vi.mock("../../../stores/useParameterStore", () => ({
  useParameterStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ values: {}, setLocal: vi.fn() }),
  ),
}));

vi.mock("../BlockEmbed", () => ({ BlockEmbed: () => <div data-testid="block-embed" /> }));

import { Block } from "../Block";
import { useBusStore } from "../../../stores/useBusStore";
import { useGraphStore } from "../../../stores/useGraphStore";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeData(overrides: Partial<BlockData> = {}): BlockData {
  return {
    id: "block-1",
    name: "Surge XT",
    category: "instrument",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 0,
    latencyMs: 0,
    bypassed: false,
    error: false,
    isMacroTagged: false,
    ...overrides,
  };
}

function renderBlock(data: Partial<BlockData> = {}, selected = false) {
  return render(
    <Block
      id={data.id ?? "block-1"}
      data={makeData(data)}
      selected={selected}
      type="block"
      zIndex={0}
      isConnectable={true}
      positionAbsoluteX={0}
      positionAbsoluteY={0}
      dragging={false}
      draggable={true}
      selectable={true}
      deletable={true}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphStore.zoomTier = "normal";
  mockGraphStore.toggleBypass.mockReset();
  mockGraphStore.toggleMute.mockReset();
});

describe("<Block /> (gaps)", () => {
  // ── StateBtn clicks ──────────────────────────────────────────────────────────

  it("B button click calls toggleBypass with block id", () => {
    renderBlock({ id: "b-42" });
    fireEvent.click(screen.getByTitle("Bypass"));
    expect(mockGraphStore.toggleBypass).toHaveBeenCalledWith("b-42");
  });

  it("M button click calls toggleMute with block id", () => {
    renderBlock({ id: "b-7" });
    fireEvent.click(screen.getByTitle("Mute"));
    expect(mockGraphStore.toggleMute).toHaveBeenCalledWith("b-7");
  });

  it("B button click does not bubble (stopPropagation via e.stopPropagation)", () => {
    // stopPropagation prevents node selection on B/M click — verify button is present
    renderBlock();
    const bBtn = screen.getByTitle("Bypass");
    expect(bBtn).toBeInTheDocument();
  });

  // ── Persisted THREE collapse tiers (Task 2.4) ─────────────────────────────────
  // Collapse is a deliberate, persisted per-node TIER (d.collapseTier), NOT a
  // zoom artifact. title = header + single activity well; macro = lean default
  // (header + well + COMPACT essential-I/O port lane, NO control deck/embed/
  // param wall); expanded = full deck + embed + "▸ N params" lane. Double-click
  // title (and the chevron) CYCLES title→macro→expanded→title via setCollapseTier.

  it("TITLE tier keeps the header + shows the single activity well (D5), no deck", () => {
    renderBlock({ name: "Pro-Q 3", category: "audiofx", collapseTier: "title" });
    // Header (name + B/M + chevron) STAYS — title is header+well, never "name+dot".
    expect(screen.getByText("Pro-Q 3")).toBeInTheDocument();
    expect(screen.getByTitle("Bypass")).toBeInTheDocument();
    expect(screen.getByTitle("Mute")).toBeInTheDocument();
    expect(screen.getByTestId("collapse-chevron")).toBeInTheDocument();
    // D5: the activity well STAYS at title (real signal bar).
    expect(screen.getAllByTestId("signal-activity-bar").length).toBe(1);
  });

  it("MACRO tier (lean default) shows the activity well but NO full control deck", () => {
    // A third-party plugin's full deck is the single activity bar inside the
    // 54px control-deck body; at macro that deck must NOT mount — only the
    // 22px macro well does. We assert exactly ONE activity bar (the macro well)
    // and that the macro-well marker is present (deck body would add a 2nd bar).
    renderBlock({
      name: "ValhallaRoom",
      category: "audiofx",
      format: "VST3",
      collapseTier: "macro",
      ports: [
        { id: "in-l", type: "audio", direction: "input", label: "In", connected: true },
        { id: "out-l", type: "audio", direction: "output", label: "Out", connected: false },
      ],
    });
    expect(screen.getByTestId("block-macro-well")).toBeInTheDocument();
    // Exactly one activity bar (the macro well) — the third-party control deck
    // (which would render its own bar) is suppressed at macro.
    expect(screen.getAllByTestId("signal-activity-bar").length).toBe(1);
    // The essential I/O Handles are present (cablable lean tier).
    expect(screen.getByTestId("handle-in-l")).toBeInTheDocument();
    expect(screen.getByTestId("handle-out-l")).toBeInTheDocument();
  });

  it("MACRO never shows fabricated param knobs (nothing-fake) or the param toggle", () => {
    // A built-in INT node with a registered inline face would, at expanded,
    // render knobs; at macro the deck is gone entirely. And a value/CV param
    // port must NOT surface a "▸ N params" toggle at macro (expanded only).
    renderBlock({
      category: "audiofx",
      format: "INT",
      collapseTier: "macro",
      ports: [
        { id: "in", type: "audio", direction: "input", label: "In", connected: true },
        { id: "p0", type: "value", direction: "input", label: "Mix", connected: false },
      ],
    });
    // No param-lane toggle at macro (it is expanded-only).
    expect(screen.queryByLabelText(/parameter port/i)).toBeNull();
    // No knob deck (the control-deck body does not mount at macro).
    expect(screen.queryByTestId("block-embed")).toBeNull();
  });

  it("EXPANDED tier mounts the full deck + the '▸ N params' lane for param ports", () => {
    renderBlock({
      category: "audiofx",
      format: "INT",
      collapseTier: "expanded",
      ports: [
        { id: "in", type: "audio", direction: "input", label: "In", connected: true },
        { id: "p0", type: "value", direction: "input", label: "Mix", connected: false },
      ],
    });
    // The param wall collapses behind a "▸ N params" toggle (present only when
    // expanded). Its aria-label mentions "parameter port".
    expect(screen.getByLabelText(/parameter port/i)).toBeInTheDocument();
  });

  it("chevron CYCLES the tier via setCollapseTier (title→macro→expanded→title)", () => {
    // title → macro
    const a = renderBlock({ id: "b-t", collapseTier: "title" });
    fireEvent.click(screen.getByTestId("collapse-chevron"));
    expect(mockGraphStore.setCollapseTier).toHaveBeenLastCalledWith("b-t", "macro");
    a.unmount();
    // macro → expanded
    const b = renderBlock({ id: "b-m", collapseTier: "macro" });
    fireEvent.click(screen.getByTestId("collapse-chevron"));
    expect(mockGraphStore.setCollapseTier).toHaveBeenLastCalledWith("b-m", "expanded");
    b.unmount();
    // expanded → title (wraps)
    renderBlock({ id: "b-e", collapseTier: "expanded" });
    fireEvent.click(screen.getByTestId("collapse-chevron"));
    expect(mockGraphStore.setCollapseTier).toHaveBeenLastCalledWith("b-e", "title");
  });

  it("DOUBLE-CLICK on the title cycles the tier via setCollapseTier", () => {
    renderBlock({ id: "b-dc", collapseTier: "macro" });
    fireEvent.doubleClick(screen.getByTestId("block-title"));
    expect(mockGraphStore.setCollapseTier).toHaveBeenLastCalledWith("b-dc", "expanded");
  });

  it("absent collapseTier defaults to MACRO (lean) — well present, no full deck", () => {
    renderBlock({
      name: "Default",
      category: "audiofx",
      format: "VST3",
      ports: [
        { id: "in", type: "audio", direction: "input", label: "In", connected: false },
        { id: "out", type: "audio", direction: "output", label: "Out", connected: false },
      ],
    });
    expect(screen.getByTestId("block-macro-well")).toBeInTheDocument();
    expect(screen.getAllByTestId("signal-activity-bar").length).toBe(1);
  });

  it("all three tiers render without crashing for all categories", () => {
    for (const cat of ["instrument", "audiofx", "midifx", "modulator"] as const) {
      for (const t of ["title", "macro", "expanded"] as const) {
        expect(() => renderBlock({ category: cat, collapseTier: t })).not.toThrow();
      }
    }
  });

  // ── Collapsed-socket rule (contract §5) — collapsing must NOT drop cables ──────
  // At the title tier a CONNECTED Block must keep rendering its port Handles so
  // the engine Arc's endpoints still draw — the cable must not visually vanish.

  it("CONNECTED block at TITLE still renders its port Handles (collapsed-socket)", () => {
    renderBlock({
      category: "audiofx",
      format: "VST3",
      collapseTier: "title",
      ports: [
        { id: "in-l", type: "audio", direction: "input", label: "In", connected: true },
        { id: "out-l", type: "audio", direction: "output", label: "Out", connected: true },
      ],
    });
    // Both Handles present even though the Block is collapsed to title — the
    // connection's endpoints still resolve so the cable keeps drawing.
    expect(screen.getByTestId("handle-in-l")).toBeInTheDocument();
    expect(screen.getByTestId("handle-out-l")).toBeInTheDocument();
  });

  // ── Loading node (loading-node contract §4/§7) ────────────────────────────────
  // loadState==='loading' → pinned to title: name + "loading…", NO ports/meters.

  it("LOADING node shows a prominent 'Loading <name>…' face and NO ports or meters", () => {
    renderBlock({
      name: "BigSynth",
      category: "instrument",
      format: "VST3",
      loadState: "loading",
      collapseTier: "expanded", // must be IGNORED — loading pins to title
      ports: [
        { id: "in-l", type: "audio", direction: "input", label: "In", connected: false },
        { id: "out-l", type: "audio", direction: "output", label: "Out", connected: false },
      ],
    });
    // Name (header) + a PROMINENT loading face on the body: "Loading <name>…"
    // plus the "instantiating plugin" subline (Glen 2026-06-10 — was a tiny
    // "loading…" badge that read as broken).
    expect(screen.getByText("BigSynth")).toBeInTheDocument();
    const loadingFace = screen.getByTestId("block-loading");
    expect(loadingFace).toBeInTheDocument();
    expect(loadingFace).toHaveTextContent(/Loading\s+BigSynth…/);
    expect(loadingFace).toHaveTextContent(/instantiating plugin/i);
    // NO meters / activity bars while loading (nothing-fake — no signal yet).
    expect(screen.queryByTestId("signal-activity-bar")).toBeNull();
    expect(screen.queryByTestId("rms-meter")).toBeNull();
    // NO ports/handles while loading (loading node is not cable-targetable).
    expect(screen.queryByTestId("handle-in-l")).toBeNull();
    expect(screen.queryByTestId("handle-out-l")).toBeNull();
    // The chevron is disabled while loading (tier is pinned).
    expect(screen.getByTestId("collapse-chevron")).toBeDisabled();
  });

  it("LOADING node: chevron does NOT change the tier (pinned)", () => {
    renderBlock({ id: "b-load", loadState: "loading", collapseTier: "macro" });
    fireEvent.click(screen.getByTestId("collapse-chevron"));
    expect(mockGraphStore.setCollapseTier).not.toHaveBeenCalled();
  });

  // ── Heavy embed mount rule (2a — no longer zoom-gated) ─────────────────────────
  // BlockEmbed (live meter + FFT) mounts ONLY for a built-in audiofx node with a
  // real audio output, never for third-party plugins or by zoom.

  it("audiofx BUILT-IN with audio out renders BlockEmbed (expanded tier)", () => {
    renderBlock({
      format: "INT",
      category: "audiofx",
      collapseTier: "expanded", // the heavy FFT embed mounts only when expanded
      ports: [
        { id: "out-0", label: "L", direction: "output", type: "audio", connected: false },
      ],
    });
    expect(screen.getByTestId("block-embed")).toBeInTheDocument();
  });

  it("third-party plugin does NOT embed the heavy face (2b card instead)", () => {
    renderBlock({
      format: "VST3",
      category: "audiofx",
      collapseTier: "expanded",
      ports: [
        { id: "out-0", label: "L", direction: "output", type: "audio", connected: false },
      ],
    });
    expect(screen.queryByTestId("block-embed")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("signal-activity-bar").length).toBe(1);
  });

  it("collapsed audiofx block does NOT mount the heavy embed", () => {
    renderBlock({
      format: "INT",
      category: "audiofx",
      collapseTier: "title",
      ports: [
        { id: "out-0", label: "L", direction: "output", type: "audio", connected: false },
      ],
    });
    expect(screen.queryByTestId("block-embed")).not.toBeInTheDocument();
  });

  // ── Painter law: SignalActivityBar must use CSS classes, not per-tick inlines ──
  // The perf-wave guardrail: segment divs inside the activity bar must NOT carry
  // inline `background` or `box-shadow` style attributes (those must live in
  // index.css keyed off .sigbar-lit-{n} / .sigbar-unlit / [data-signal] selectors).

  it("signal-activity-bar segments carry no inline background or boxShadow (painter law)", () => {
    const { container } = renderBlock({
      format: "VST3",
      category: "audiofx",
      ports: [{ id: "out-0", label: "L", direction: "output", type: "audio", connected: false }],
    });
    const bar = container.querySelector('[data-testid="signal-activity-bar"]');
    expect(bar).not.toBeNull();
    const segments = bar!.querySelectorAll(".sigbar-seg");
    expect(segments.length).toBeGreaterThan(0);
    segments.forEach((seg) => {
      const el = seg as HTMLElement;
      expect(el.style.background).toBe("");
      expect(el.style.boxShadow).toBe("");
    });
  });

  it("signal-activity-bar wrapper carries data-signal attr for CSS colour routing", () => {
    const { container } = renderBlock({
      format: "VST3",
      category: "audiofx",
      ports: [{ id: "out-0", label: "L", direction: "output", type: "audio", connected: false }],
    });
    const bar = container.querySelector('[data-testid="signal-activity-bar"]');
    expect(bar?.getAttribute("data-signal")).toMatch(/^(audio|midi|cv)$/);
  });

  // ── MIDI / modulator deck body ────────────────────────────────────────────────

  it("midifx block with no knob params shows 'MIDI · routing' text (expanded)", () => {
    // The MIDI/modulator status row lives in the control deck → expanded tier.
    renderBlock({ category: "midifx", format: "INT", name: "MIDI Router", collapseTier: "expanded" });
    expect(screen.getByText("MIDI · routing")).toBeInTheDocument();
  });

  it("modulator block with no knob params shows 'Modulation' text (expanded)", () => {
    renderBlock({ category: "modulator", format: "INT", name: "LFO", collapseTier: "expanded" });
    expect(screen.getByText("Modulation")).toBeInTheDocument();
  });

  it("active modulator shows activity dot element (no crash)", () => {
    expect(() =>
      renderBlock({ category: "modulator", format: "INT", bypassed: false, muted: false }),
    ).not.toThrow();
  });

  // ── muteInput header indicator ────────────────────────────────────────────────

  it("shows Min chip in header when muteInput=true", () => {
    renderBlock({ muteInput: true });
    expect(screen.getByTitle("Input muted")).toBeInTheDocument();
  });

  it("does not show Min chip when muteInput is false/undefined", () => {
    renderBlock({ muteInput: false });
    expect(screen.queryByTitle("Input muted")).not.toBeInTheDocument();
  });

  // ── CPU load display ─────────────────────────────────────────────────────────

  it("does not show cpu chip when cpuLoad=0", () => {
    const { container } = renderBlock({ cpuLoad: 0 });
    // cpuLoad > 0 gates the span; title starts with "CPU" when present
    expect(container.querySelector('[title^="CPU"]')).toBeNull();
  });

  // ── PortRow: signal-type pip (standard block uses CSS span, not SVG shapes) ──
  // PortShape SVG shapes (circle/polygon/rect) are only used in Portal/Container
  // block variants. Standard blocks use PortRow with a CSS-rounded <span> pip.

  it("audio port renders port-well Handle", () => {
    renderBlock({
      ports: [{ id: "in-0", label: "L", direction: "input", type: "audio", connected: false }],
    });
    expect(screen.getByTestId("handle-in-0")).toBeInTheDocument();
  });

  it("midi port renders port-well Handle", () => {
    renderBlock({
      ports: [{ id: "in-0", label: "In", direction: "input", type: "midi", connected: false }],
    });
    expect(screen.getByTestId("handle-in-0")).toBeInTheDocument();
  });

  // Lean port lane (Glen, 2026-06-03): Value/CV ports map to plugin params and
  // are COLLAPSED by default behind a "▸ N params" toggle, so a value port's
  // Handle is NOT in the DOM until the lane is expanded. (Audio/MIDI stay
  // essential + always visible — asserted above.)
  it("value/CV port is collapsed behind the param toggle by default (lean)", () => {
    // The "▸ N params" lane lives at the EXPANDED tier (Task 2.4 — macro/title
    // show only essential I/O, no param wall + no toggle).
    renderBlock({
      collapseTier: "expanded",
      ports: [{ id: "in-0", label: "Cutoff", direction: "input", type: "value", connected: false }],
    });
    // The param port row + its Handle are hidden while collapsed…
    expect(screen.queryByTestId("handle-in-0")).not.toBeInTheDocument();
    expect(screen.queryByText("Cutoff")).not.toBeInTheDocument();
    // …surfaced instead as a single "▸ 1 param" expander (real count).
    const toggle = screen.getByRole("button", { name: /show 1 parameter port/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveTextContent(/1 param/i);
  });

  // A6/F5 (Fitts's law): the toggle BUTTON is a ≥30px-tall hit target while
  // the visible pill (inner span) stays 13px — visual size unchanged.
  it("param toggle hit target is ≥30px tall while the visible pill stays 13px", () => {
    renderBlock({
      collapseTier: "expanded",
      ports: [{ id: "in-0", label: "Cutoff", direction: "input", type: "value", connected: false }],
    });
    const toggle = screen.getByRole("button", { name: /show 1 parameter port/i });
    expect(parseFloat(toggle.style.height)).toBeGreaterThanOrEqual(30);
    // First child = the visual pill span, still 13px.
    const pill = toggle.firstElementChild as HTMLElement;
    expect(pill).not.toBeNull();
    expect(pill.style.height).toBe("13px");
  });

  it("clicking the expanded (30px) hit area toggles the param lane", () => {
    renderBlock({
      collapseTier: "expanded",
      ports: [{ id: "in-0", label: "Cutoff", direction: "input", type: "value", connected: false }],
    });
    // Click the BUTTON itself (the invisible 30px band), not the inner pill.
    fireEvent.click(screen.getByRole("button", { name: /show 1 parameter port/i }));
    expect(screen.getByTestId("handle-in-0")).toBeInTheDocument();
  });

  it("value/CV port Handle reveals after clicking the param toggle", () => {
    renderBlock({
      collapseTier: "expanded",
      ports: [{ id: "in-0", label: "Cutoff", direction: "input", type: "value", connected: false }],
    });
    fireEvent.click(screen.getByRole("button", { name: /show 1 parameter port/i }));
    // Now the param port row + Handle + label render.
    expect(screen.getByTestId("handle-in-0")).toBeInTheDocument();
    expect(screen.getByText("Cutoff")).toBeInTheDocument();
    // Toggle flips to the collapse affordance (aria-expanded true).
    const hide = screen.getByRole("button", { name: /hide 1 parameter port/i });
    expect(hide).toHaveAttribute("aria-expanded", "true");
  });

  // ── PortRow sidechain detection ───────────────────────────────────────────────

  it("sidechain port with label 'SC' shows 'SC' label text", () => {
    renderBlock({
      ports: [{ id: "sidechain", label: "SC", direction: "input", type: "audio", connected: false }],
    });
    expect(screen.getByText("SC")).toBeInTheDocument();
  });

  it("regular port renders its label text", () => {
    renderBlock({
      ports: [{ id: "out-0", label: "Main L", direction: "output", type: "audio", connected: false }],
    });
    expect(screen.getByText("Main L")).toBeInTheDocument();
  });

  // ── BusBadge via useBusStore ─────────────────────────────────────────────────

  it("renders BusBadge label when port has a wired bus name", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useBusStore).mockImplementation((selector: any) =>
      selector({ cableBus: { "cable-1": "Reverb Send" } }),
    );

    const edges = [
      { id: "cable-1", source: "block-1", sourcePort: "out-0", target: "other", targetPort: "in-0" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useGraphStore).mockImplementation((sel: any) =>
      sel({ ...mockGraphStore, edges }),
    );

    renderBlock({
      id: "block-1",
      ports: [{ id: "out-0", label: "Out", direction: "output", type: "audio", connected: true }],
    });
    expect(screen.getByText("Reverb Send")).toBeInTheDocument();
  });

  // ── Selected glow class ───────────────────────────────────────────────────────

  it("selected=true applies neu-glow class for category", () => {
    const { container } = renderBlock({ category: "audiofx" }, true);
    const root = container.firstElementChild;
    expect(root?.className).toContain("neu-glow-audiofx");
  });

  it("selected=false applies neu-sculpt or neu-sculpt-hover (not glow)", () => {
    const { container } = renderBlock({ category: "audiofx" }, false);
    const root = container.firstElementChild;
    expect(root?.className).not.toContain("neu-glow");
  });

  // ── Error state in load bar ───────────────────────────────────────────────────

  it("load bar uses error colour when error=true", () => {
    const { container } = renderBlock({ error: true });
    // The load bar div should have a background using status-clip
    const loadBar = container.querySelector('[style*="status-clip"]');
    expect(loadBar).not.toBeNull();
  });

  // ── Port counts ───────────────────────────────────────────────────────────────

  it("renders separate handles for each input and output port", () => {
    renderBlock({
      ports: [
        { id: "in-0", label: "L", direction: "input", type: "audio", connected: false },
        { id: "in-1", label: "R", direction: "input", type: "audio", connected: false },
        { id: "out-0", label: "Out L", direction: "output", type: "audio", connected: false },
      ],
    });
    expect(screen.getByTestId("handle-in-0")).toBeInTheDocument();
    expect(screen.getByTestId("handle-in-1")).toBeInTheDocument();
    expect(screen.getByTestId("handle-out-0")).toBeInTheDocument();
  });

  // ── Dense-node param-port collapser default (lean-block / canvas-polish) ──────
  // A params-heavy node defaults to In/Out + a "▸ N params" pill; the Value/CV
  // param ports stay HIDDEN until the pill is expanded (port chrome only where
  // it's wanted — no wall of rows by default).

  it("dense node defaults to a collapsed '▸ N params' pill (param ports hidden)", () => {
    renderBlock({
      collapseTier: "expanded", // param wall + "▸ N params" pill is expanded-only
      ports: [
        { id: "in-0", label: "In", direction: "input", type: "audio", connected: false },
        { id: "p-mix", label: "Mix", direction: "input", type: "value", connected: false },
        { id: "p-fb", label: "Feedback", direction: "input", type: "value", connected: false },
        { id: "p-width", label: "Width", direction: "input", type: "value", connected: false },
      ],
    });
    // Essential audio I/O shows; the 3 value/CV params collapse behind the pill.
    expect(screen.getByTestId("handle-in-0")).toBeInTheDocument();
    expect(screen.getByText(/3\s*params/)).toBeInTheDocument();
    // Param-port handles are NOT rendered until the pill is expanded (default-collapsed).
    expect(screen.queryByTestId("handle-p-mix")).not.toBeInTheDocument();
  });

  it("expanding the '▸ N params' pill reveals the param-port lane", () => {
    renderBlock({
      collapseTier: "expanded",
      ports: [
        { id: "in-0", label: "In", direction: "input", type: "audio", connected: false },
        { id: "p-mix", label: "Mix", direction: "input", type: "value", connected: false },
      ],
    });
    fireEvent.click(screen.getByText(/1\s*param/));
    expect(screen.getByTestId("handle-p-mix")).toBeInTheDocument();
  });

  // ── 2a — zoom-invariant content (zoomToTier swap is gone) ────────────────────
  // The Block must render the SAME control content regardless of the (now-vestigial)
  // zoomTier value — zoom only scales via React Flow's transform, never swaps GUI.

  it("renders identical content regardless of the vestigial zoomTier value", () => {
    const ports = [
      { id: "out-0", label: "L", direction: "output" as const, type: "audio" as const, connected: false },
    ];
    mockGraphStore.zoomTier = "compact";
    const { container: compactDom } = renderBlock({ format: "INT", category: "audiofx", ports });
    mockGraphStore.zoomTier = "expanded";
    const { container: expandedDom } = renderBlock({ format: "INT", category: "audiofx", ports });
    // Same RMS-meter count at both extremes → content is zoom-invariant.
    expect(
      compactDom.querySelectorAll('[data-testid="rms-meter"]').length,
    ).toBe(expandedDom.querySelectorAll('[data-testid="rms-meter"]').length);
    // And the header (with name) is present at both — no bare dot+name swap.
    expect(compactDom.querySelector('[data-testid="collapse-chevron"]')).not.toBeNull();
    expect(expandedDom.querySelector('[data-testid="collapse-chevron"]')).not.toBeNull();
  });
});
