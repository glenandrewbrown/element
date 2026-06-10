import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { InspectorHub } from "./InspectorHub";
import { useGraphStore } from "../../stores/useGraphStore";
import { usePerformStore } from "../../stores/usePerformStore";
import { useEngineSnapshotStore } from "../../stores/useEngineSnapshotStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { useBusStore } from "../../stores/useBusStore";
import { useCableMeterStore } from "../../stores/useCableMeterStore";
import { useFacePinStore } from "../../stores/useFacePinStore";
import type { BlockData } from "../../data/types";

// ── Store seeding ──
// InspectorHub reads from useGraphStore (selectedNode, nodes, edges),
// usePerformStore (sessionName, liveHealth), useEngineSnapshotStore (cpu,
// sampleRate, bufferSize, deviceName, deviceLatencyMs, hasHostData),
// useHostExtrasStore (logLines), useCableMeterStore (levels), and
// useBusStore (cableBus).
//
// The docked tabbed shell is Block / Bus / Cable / Health (verdict #6).
// Block-selected path mounts BlockParameterList → nativeGetNodeParameters
// (returns { parameters: [] } when bridgeless — safe) and PresetStrip →
// nativePresetList (returns { ok: false, presets: [] } — safe). The Health
// tab mounts LiveHealth + MetersPanel + LogPanel, all read-only store reads.
// Neither calls console.error; logBridgeError uses console.warn only.

const defaultHealth = {
  cpu: 8.5,
  buffer: 256,
  latency: 5.2,
  clock: "Built-in Output",
  bpm: 120,
  timecode: "1.1.0",
  sampleRateLabel: "44.1 kHz",
  alerts: [],
  ioActivity: "nominal" as const,
  outputPeak: 0.2,
};

/** A complete BlockData for a typical audiofx plugin. */
const selectedModifier = {
  id: "sel-1",
  name: "Pro-Q 3",
  category: "audiofx" as const,
  format: "VST3" as const,
  position: { x: 200, y: 120 },
  ports: [
    { id: "in-l", type: "audio" as const, direction: "input" as const, label: "In L", connected: true },
    { id: "in-r", type: "audio" as const, direction: "input" as const, label: "In R", connected: true },
    { id: "out-l", type: "audio" as const, direction: "output" as const, label: "Out L", connected: true },
    { id: "out-r", type: "audio" as const, direction: "output" as const, label: "Out R", connected: true },
  ],
  cpuLoad: 2.3,
  latencyMs: 0,
  bypassed: false,
  muted: false,
  muteInput: false,
  error: false,
  isMacroTagged: false,
  note: "High-pass at 80 Hz, surgical peak around 3 kHz",
};

/** A complete BlockData for an instrument. */
const selectedGenerator = {
  id: "sel-2",
  name: "Mini V3",
  category: "instrument" as const,
  format: "AU" as const,
  position: { x: 100, y: 80 },
  ports: [
    { id: "out-l", type: "audio" as const, direction: "output" as const, label: "Out L", connected: true },
    { id: "out-r", type: "audio" as const, direction: "output" as const, label: "Out R", connected: true },
    { id: "midi-in", type: "midi" as const, direction: "input" as const, label: "MIDI In", connected: true },
  ],
  cpuLoad: 4.1,
  latencyMs: 0,
  bypassed: false,
  muted: false,
  muteInput: false,
  error: false,
  isMacroTagged: false,
  note: "",
};

/** A Script Block — exercises the Block tab's inline Script editor fold-in. */
const selectedScript = {
  id: "sel-script",
  name: "Script",
  category: "modulator" as const,
  format: "INT" as const,
  position: { x: 300, y: 200 },
  ports: [
    { id: "midi-in", type: "midi" as const, direction: "input" as const, label: "MIDI In", connected: true },
    { id: "midi-out", type: "midi" as const, direction: "output" as const, label: "MIDI Out", connected: false },
  ],
  cpuLoad: 0.4,
  latencyMs: 0,
  bypassed: false,
  muted: false,
  muteInput: false,
  error: false,
  isMacroTagged: false,
  note: "Arpeggiator — quantise to scale",
};

// A richer cable set so the Cable monitor + overview have real variety:
// a stereo audio main, a sidechain audio feed, and a MIDI cable (exercises the
// honest "MIDI activity, not dB" labelling).
const demoEdges = [
  {
    id: "e1",
    source: "sel-2",
    sourcePort: "out-l",
    target: "sel-1",
    targetPort: "in-l",
    signalType: "audio" as const,
    channelCount: 2 as const,
    isSidechain: false,
  },
  {
    id: "e-sc",
    source: "sel-2",
    sourcePort: "out-r",
    target: "sel-1",
    targetPort: "in-r",
    signalType: "audio" as const,
    channelCount: 1 as const,
    isSidechain: true,
  },
  {
    id: "e-midi",
    source: "sel-2",
    sourcePort: "midi-in",
    target: "sel-script",
    targetPort: "midi-in",
    signalType: "midi" as const,
    channelCount: 1 as const,
    isSidechain: false,
  },
];

function seedProjectOverview() {
  useGraphStore.setState((s) => ({
    ...s,
    nodes: [selectedModifier, selectedGenerator, selectedScript],
    edges: demoEdges,
    selectedNodeId: null,
    selectedEdgeId: null,
  }));
  usePerformStore.setState((s) => ({
    sessionName: "Demo Session",
    liveHealth: { ...s.liveHealth, ...defaultHealth },
  }));
  useEngineSnapshotStore.setState({
    cpu: 8.5,
    sampleRate: 44100,
    bufferSize: 256,
    deviceName: "Built-in Output",
    deviceLatencyInputMs: 5.2,
    deviceLatencyOutputMs: 5.2,
    hasHostData: true,
    engineRunning: true,
    transportPlaying: false,
    transportRecording: false,
    tempoBpm: 120,
    timeSig: [4, 4] as [number, number],
    transportFrame: 0,
    transportTimecode: "1.1.0",
    lastUpdated: Date.now(),
  });
  useHostExtrasStore.setState((s) => ({ ...s, logLines: [] }));
  useBusStore.setState({ cableBus: {} });
  useCableMeterStore.setState((s) => ({ ...s, levels: {} }));
}

function seedNodeSelected(node: BlockData) {
  seedProjectOverview();
  // selectSelectedNode resolves the node by id from the `nodes` array, so the
  // selected node must actually be IN it. Push it (de-duped) before selecting.
  useGraphStore.setState((s) => {
    const nodes = s.nodes.some((n) => n.id === node.id)
      ? s.nodes
      : [...s.nodes, node];
    return { ...s, nodes, selectedNodeId: node.id };
  });
}

/**
 * Select a cable and push REAL live levels into the meter store so the Cable
 * monitor / overview show the faithful VU ladder lit at the given amplitudes —
 * the same store the engine writes to at 60Hz. Levels are deterministic for
 * reliable screenshots/tests.
 */
function seedCableSelected(
  edgeId: string,
  levels: Record<string, number> = { e1: 0.62, "e-sc": 0.31, "e-midi": 0.5 },
) {
  seedProjectOverview();
  useGraphStore.setState((s) => ({ ...s, selectedNodeId: null, selectedEdgeId: edgeId }));
  useCableMeterStore.setState((s) => ({ ...s, levels }));
}

const PANEL = { width: 300, height: 680 } as const;

const meta = {
  title: "Layout/InspectorHub",
  component: InspectorHub,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "SELECTION-ROUTED inspector (Wave-3 Task 3.E) — the panel follows the selection instead of a " +
          "top-level tab bar. A Block selected → the per-Block view (gradient header, the within-block " +
          "Params/I/O/Notes sub-nav, A/B presets, the 📌 pin-to-face controls, parameter sliders, " +
          "plugin-window embed, bypass/mute, metrics, and the inline Script editor for Script Blocks). A " +
          "Cable selected → the live signal monitor (faithful digital-VU ladder, peak-hold, dBFS, signal " +
          "type, channels, sidechain from the real 60Hz useCableMeterStore feed; NOT a routing editor). " +
          "Nothing selected → a resting view with a sub-nav (Overview · Cables · Buses · Health): the " +
          "Project Overview, the board-wide live Cable monitor, the IO Bus auditor (buses are send/receive " +
          "blocks, not wireless cables), and engine vitals + meters + log. The shell can collapse the " +
          "no-selection panel to an icon rail for max canvas. Wiring, stores, and bridge calls are Element's.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof InspectorHub>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── BLOCK tab — nothing selected (Project Overview resting state) ──
export const NothingSelected: Story = {
  decorators: [
    (Story) => {
      seedProjectOverview();
      return (
        <div style={PANEL} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "No Block selected — the BLOCK tab falls back to the Project Overview (Blocks/Cables count, " +
          "engine CPU, sample rate, device). The default resting state.",
      },
    },
  },
};

// ── BLOCK tab — AudioFx plugin selected (the primary single-Block view) ──
export const BlockTab_AudioFx: Story = {
  decorators: [
    (Story) => {
      seedNodeSelected(selectedModifier);
      return (
        <div style={PANEL} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "BLOCK tab with an Audio-Effect Block (EQ) selected — the full per-Block detail: the gradient " +
          "header with the function-inferred icon, preset A/B strip, parameter list, plugin-window embed, " +
          "bypass/mute controls and notes.",
      },
    },
  },
  play: async ({ canvas }) => {
    // Task 3.E — selecting a Block routes to the block view (no tab click). The
    // within-block sub-nav (Params|I/O|Notes) is present and the header reflects
    // the selected block + its live ACTIVE state.
    await expect(
      canvas.getByRole("tablist", { name: /block sections/i }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Pro-Q 3")).toBeInTheDocument();
    await expect(canvas.getByText(/ACTIVE/)).toBeInTheDocument();
  },
};

// ── BLOCK tab — instrument selected ──
export const BlockTab_Instrument: Story = {
  decorators: [
    (Story) => {
      seedNodeSelected(selectedGenerator);
      return (
        <div style={PANEL} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "BLOCK tab with an instrument Block selected — confirms the instrument category gradient and " +
          "a MIDI-in port summary in the header.",
      },
    },
  },
};

// ── BLOCK tab — bypassed block ──
export const BlockTab_Bypassed: Story = {
  decorators: [
    (Story) => {
      seedProjectOverview();
      useGraphStore.setState((s) => ({
        ...s,
        nodes: [{ ...selectedModifier, id: "sel-byp", bypassed: true }],
        selectedNodeId: "sel-byp",
      }));
      return (
        <div style={PANEL} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "BLOCK tab, selected Block bypassed — the header state reads BYPASS and the BYPASS control reads " +
          "its active 'BYPASSED' state, confirming the toggle reflects engine truth.",
      },
    },
  },
  play: async ({ canvas }) => {
    // The BYPASS control button reflects its active "BYPASSED" state (the
    // header also shows a "BYPASS" badge, so target the button specifically).
    await expect(
      canvas.getByRole("button", { name: "BYPASSED" }),
    ).toBeInTheDocument();
  },
};

// ── BLOCK tab — Script Block (inline Script editor folds in) ──
export const BlockTab_Script: Story = {
  decorators: [
    (Story) => {
      seedNodeSelected(selectedScript);
      return (
        <div style={PANEL} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "BLOCK tab with a Script Block selected — the inline Lua Script editor folds into the bottom of " +
          "the Block tab (the standalone Script tab is retired; per-block editing lives with the block).",
      },
    },
  },
  play: async ({ canvas }) => {
    // The inline Script editor folds into the Notes sub-view (verdict #6) — open
    // it via the within-block sub-nav, then assert on its unique "Save & Compile"
    // action (the block is itself named "Script", so that text alone is ambiguous).
    await userEvent.click(canvas.getByRole("tab", { name: "Notes" }));
    await expect(canvas.getByText("Save & Compile")).toBeInTheDocument();
  },
};

// ── BUS tab — live bus activity + auditor ──
export const BusTab: Story = {
  decorators: [
    (Story) => {
      seedProjectOverview();
      // Two named buses: a stereo reverb send (lit) + a sidechain send (so the
      // SC badge + sidechain detection show). Push real levels so the activity
      // meters light from the same store the engine feeds.
      useBusStore.setState({
        cableBus: { e1: "Reverb Send A", "e-sc": "Sidechain Bus" },
      });
      useCableMeterStore.setState((s) => ({
        ...s,
        levels: { e1: 0.55, "e-sc": 0.42 },
      }));
      return (
        <div style={PANEL} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "BUS tab — live per-bus activity (Wizard R1 P2 depth) above the kept bus auditor. Each bus shows " +
          "a live VU meter + dBFS read-out (real max RMS across its cables), a sidechain badge where any " +
          "feed is a sidechain, and an 'Open editor' affordance that dives the bus's destination block so " +
          "its effects (e.g. a reverb) open in the Block tab. Buses are IO send/receive blocks, not " +
          "wireless cables (decision #4).",
      },
    },
  },
  play: async ({ canvas }) => {
    // Task 3.E — with nothing selected, the IO Bus auditor lives in the resting
    // "Buses" sub-tab (buses are not a graph selection). Open it via the sub-nav.
    await userEvent.click(canvas.getByRole("tab", { name: "Buses" }));
    await expect(canvas.getByRole("tab", { name: "Buses" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The reworked IO send/receive auditor: separate Send + Receive meters per
    // bus (two seeded) and the open-editor affordance. (Both the sub-nav tab and
    // the auditor heading read "Buses", so assert the unambiguous content.)
    await expect(canvas.getAllByText(/SEND →/).length).toBeGreaterThan(0);
    await expect(canvas.getAllByText(/← RECEIVE/).length).toBeGreaterThan(0);
    await expect(
      canvas.getAllByRole("button", { name: "Open editor" }).length,
    ).toBeGreaterThan(0);
  },
};

// ── CABLE tab — live signal monitor, audio cable selected ──
export const CableTab: Story = {
  decorators: [
    (Story) => {
      // Select the stereo audio main cable + push a real live level so the
      // faithful VU ladder lights and the dBFS/peak read-outs populate.
      seedCableSelected("e1");
      return (
        <div style={PANEL} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "CABLE tab with a stereo Audio cable selected — the live signal monitor (Wizard R1 P1 rework). " +
          "A faithful digital-VU ladder + peak-hold column, the dBFS read-out, signal type, channels and " +
          "sidechain — all from the real 60Hz useCableMeterStore feed. Spectrum/phase show honest 'not " +
          "wired' tiles (no engine bridge yet). This is a monitor, NOT a routing editor.",
      },
    },
  },
  play: async ({ canvas }) => {
    // Task 3.E — selecting a Cable routes straight to the live monitor (no tab).
    // The monitor header identifies the signal type, and the honest gap tile
    // for spectrum is present (proves the no-fake-data rule is surfaced).
    await expect(canvas.getByText("Audio Cable")).toBeInTheDocument();
    await expect(canvas.getByText(/Spectrum/)).toBeInTheDocument();
    await expect(canvas.getByText("Signal present")).toBeInTheDocument();
  },
};

// ── CABLE tab — MIDI cable (honest non-audio labelling) ──
export const CableTab_Midi: Story = {
  decorators: [
    (Story) => {
      seedCableSelected("e-midi");
      return (
        <div style={PANEL} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "CABLE tab with a MIDI cable selected — the monitor honestly labels the reading as MIDI " +
          "ACTIVITY (%) rather than a calibrated dB meter, since the engine packs note activity into the " +
          "same per-edge field. Spectrum is correctly marked audio-only.",
      },
    },
  },
  play: async ({ canvas }) => {
    // Selecting the MIDI cable routes straight to its monitor (Task 3.E).
    await expect(canvas.getByText("MIDI Cable")).toBeInTheDocument();
    await expect(canvas.getByText("MIDI ACTIVITY")).toBeInTheDocument();
    // R2 enrichment — the MIDI flow metadata panel auto-shows for non-audio cables.
    await expect(canvas.getByText("MIDI flow")).toBeInTheDocument();
  },
};

// ── CABLE tab — no selection (board-wide live overview) ──
export const CableTab_Overview: Story = {
  decorators: [
    (Story) => {
      seedProjectOverview();
      useCableMeterStore.setState((s) => ({
        ...s,
        levels: { e1: 0.62, "e-sc": 0.28, "e-midi": 0.4 },
      }));
      return (
        <div style={PANEL} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "CABLE tab with nothing selected — the board-wide live overview: every cable as a row with its " +
          "signal glyph, route and a live mini VU meter. Click a row to open the full monitor.",
      },
    },
  },
  play: async ({ canvas }) => {
    // Task 3.E — with nothing selected, the board-wide cable overview is the
    // resting "Cables" sub-tab. Open it via the sub-nav.
    await userEvent.click(canvas.getByRole("tab", { name: "Cables" }));
    await expect(canvas.getByText("Cable Monitor")).toBeInTheDocument();
    // Three demo cables → three rows.
    await expect(canvas.getByText(/3 cables/)).toBeInTheDocument();
  },
};

// ── CABLE tab — Value/CV cable carrying a Gate (conditional routing) ──
// Exercises the R2 flow-metadata enrichment: a CV wire whose ports are named
// "Gate"/"Trigger" infers the Gate + Trigger tags and flags the wire as
// Conditional routing — the logic-gate / utility / command case Glen called out.
export const CableTab_ValueGate: Story = {
  decorators: [
    (Story) => {
      const lfo: BlockData = {
        id: "lfo-1",
        name: "Step LFO",
        category: "modulator",
        format: "INT",
        position: { x: 80, y: 60 },
        ports: [
          { id: "gate-out", type: "value", direction: "output", label: "Gate Out", connected: true },
        ],
        cpuLoad: 0.2,
        latencyMs: 0,
        bypassed: false,
        muted: false,
        muteInput: false,
        error: false,
        isMacroTagged: false,
      };
      const filt: BlockData = {
        id: "filt-1",
        name: "Ladder Filter",
        category: "audiofx",
        format: "VST3",
        position: { x: 320, y: 60 },
        ports: [
          { id: "trig-in", type: "value", direction: "input", label: "Trigger In", connected: true },
        ],
        cpuLoad: 1.1,
        latencyMs: 0,
        bypassed: false,
        muted: false,
        muteInput: false,
        error: false,
        isMacroTagged: false,
      };
      const cvCable = {
        id: "e-cv",
        source: "lfo-1",
        sourcePort: "gate-out",
        target: "filt-1",
        targetPort: "trig-in",
        signalType: "value" as const,
        channelCount: 1 as const,
        isSidechain: false,
      };
      useGraphStore.setState((s) => ({
        ...s,
        nodes: [lfo, filt],
        edges: [cvCable],
        selectedNodeId: null,
        selectedEdgeId: "e-cv",
      }));
      usePerformStore.setState((s) => ({ liveHealth: { ...s.liveHealth, ...defaultHealth } }));
      useCableMeterStore.setState((s) => ({ ...s, levels: { "e-cv": 0.7 } }));
      return (
        <div style={PANEL} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "CABLE tab with a Value/CV cable selected whose ports are a Gate → Trigger — the live monitor " +
          "auto-shows the Control-flow panel, infers the Gate + Trigger tags from the REAL port wiring, and " +
          "flags the wire as Conditional routing (the logic-gate / utility / command case). Per-step value " +
          "counters show an honest 'not bridged' note — no faked numbers.",
      },
    },
  },
  play: async ({ canvas }) => {
    // Selecting the Value/CV cable routes straight to its monitor (Task 3.E).
    await expect(canvas.getByText("Value / CV Cable")).toBeInTheDocument();
    await expect(canvas.getByText("Control flow")).toBeInTheDocument();
    // Inferred routing tags + the conditional flag.
    await expect(canvas.getByText("Gate")).toBeInTheDocument();
    await expect(canvas.getByText("Trigger")).toBeInTheDocument();
    await expect(canvas.getByText("Conditional")).toBeInTheDocument();
  },
};

// ── BLOCK tab — internal node with no params (smart layout hides the section) ──
export const BlockTab_InternalNoParams: Story = {
  decorators: [
    (Story) => {
      seedNodeSelected(selectedScript);
      return (
        <div style={PANEL} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "BLOCK tab, internal Script node selected — Storybook has no JUCE bridge so the parameter list is " +
          "empty. The SMART layout (Wizard R2) HIDES the Parameters section entirely instead of burying the " +
          "page under a 'no parameters' placeholder, while the I/O Ports + State + Notes sections (and the " +
          "Script editor) still appear — no wasted empty middle space.",
      },
    },
  },
  play: async ({ canvas }) => {
    // Params sub-view (default): the Parameters section is omitted once the
    // (empty) bridge fetch resolves — smart layout hides it rather than showing a
    // "no parameters" placeholder. Wait for the brief loading window to settle.
    await waitFor(() =>
      expect(canvas.queryByText("Parameters")).not.toBeInTheDocument(),
    );
    // I/O sub-view → the signal-coloured port list.
    await userEvent.click(canvas.getByRole("tab", { name: "I/O" }));
    await expect(canvas.getByText("I/O Ports")).toBeInTheDocument();
    // Notes sub-view → the inline Script editor folds in for the Script block.
    await userEvent.click(canvas.getByRole("tab", { name: "Notes" }));
    await expect(canvas.getByText("Save & Compile")).toBeInTheDocument();
  },
};

// ── HEALTH tab — engine vitals + meters + log ──
export const HealthTab: Story = {
  decorators: [
    (Story) => {
      seedProjectOverview();
      useHostExtrasStore.setState((s) => ({
        ...s,
        logLines: [
          "[engine] audio device opened: Built-in Output @ 44.1 kHz",
          "[graph] rebuilt: 2 blocks, 1 cable",
        ],
      }));
      return (
        <div style={PANEL} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "HEALTH tab — consolidates the engine vitals (LiveHealth: CPU, I/O ladders, buffer, latency, " +
          "alerts), the host meters, and the engine log into one scrollable column of collapsible " +
          "sections. The Log + Meters tabs from the old shell live here.",
      },
    },
  },
  play: async ({ canvas }) => {
    // Task 3.E — engine Health lives in the resting "Health" sub-tab (it is not a
    // graph selection; §7 decision keeps vitals reachable from the empty inspector).
    await userEvent.click(canvas.getByRole("tab", { name: "Health" }));
    await expect(canvas.getByRole("tab", { name: "Health" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The Engine vitals section header is present.
    await expect(canvas.getByText(/Engine vitals/i)).toBeInTheDocument();
  },
};

// ── Empty graph (no nodes) — resting view + sub-nav still works ──
export const EmptyGraph: Story = {
  decorators: [
    (Story) => {
      seedProjectOverview();
      useGraphStore.setState((s) => ({ ...s, nodes: [], edges: [], selectedNodeId: null }));
      return (
        <div style={PANEL} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Empty Project (no Blocks), nothing selected: the resting view shows zero Blocks/Cables in the " +
          "Project Overview and every resting sub-tab (Overview/Cables/Buses/Health) mounts cleanly — the " +
          "selection-routed inspector on a brand-new Board.",
      },
    },
  },
  play: async ({ canvas, canvasElement }) => {
    // Walk every resting sub-tab to prove each mounts without throwing on an
    // empty graph (the top-level tab bar is retired — this is the resting sub-nav).
    for (const name of ["Cables", "Buses", "Health", "Overview"]) {
      await userEvent.click(canvas.getByRole("tab", { name }));
      await expect(canvas.getByRole("tab", { name })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    }
    const tablist = within(canvasElement).getByRole("tablist", {
      name: /inspector overview sections/i,
    });
    await expect(tablist).toBeInTheDocument();
  },
};

// ── BLOCK tab — BIG plugin: F1 naming + G3 NeuSlider + G5 filter/groups ──
//
// Storybook has no JUCE bridge, so this story installs a MINIMAL fake
// `window.__JUCE__.backend` that answers `elementGetNodeParameters` with a
// realistic big-plugin parameter set (and resolves every other invoke as
// `undefined`, exactly the bridgeless contract). This is test plumbing, not
// fabricated UI data — it exercises the REAL fetch → render path.
const BIG_PLUGIN_PARAMS = [
  // F1 regression shape: real `name`, EMPTY JUCE label — the name must win.
  { index: 0, name: "Mix", label: "", value: 0.35, defaultValue: 0.5 },
  // Unit-suffix shape: JUCE label is a UNIT ("dB"), shown muted by the value.
  { index: 1, name: "Threshold", label: "dB", value: 0.6, defaultValue: 0.5, min: -60, max: 0 },
  // Prefix families (G5 grouping: Delay* / Mod*).
  { index: 2, name: "Delay Time L", label: "ms", value: 0.25, defaultValue: 0.25, min: 0, max: 2000 },
  { index: 3, name: "Delay Time R", label: "ms", value: 0.3, defaultValue: 0.25, min: 0, max: 2000 },
  { index: 4, name: "Delay Feedback", label: "%", value: 0.4, defaultValue: 0.4 },
  { index: 5, name: "Delay Ducking", label: "", value: 0.0, defaultValue: 0 },
  { index: 6, name: "Mod Rate", label: "Hz", value: 0.2, defaultValue: 0.2, min: 0, max: 20 },
  { index: 7, name: "Mod Depth", label: "%", value: 0.55, defaultValue: 0.5 },
  { index: 8, name: "Mod Shape", label: "", value: 0.5, defaultValue: 0.5, min: 0, max: 4, stepped: true },
  { index: 9, name: "Width", label: "%", value: 0.8, defaultValue: 1 },
  { index: 10, name: "LowCut", label: "Hz", value: 0.1, defaultValue: 0, min: 10, max: 1000 },
  { index: 11, name: "HighCut", label: "Hz", value: 0.9, defaultValue: 1, min: 1000, max: 20000 },
  { index: 12, name: "Sync", label: "", value: 1, defaultValue: 0, boolean: true },
];

function installFakeParamsBridge() {
  // SINGLETON listener array on globalThis: juceBackend wires its
  // `__juce__complete` listener exactly ONCE per module load, so a re-install
  // must keep delivering completions through the same array or every later
  // invoke would dangle to its 15s timeout.
  const g = globalThis as unknown as {
    __fakeBridgeListeners?: Array<(p: unknown) => void>;
  };
  const listeners = (g.__fakeBridgeListeners ??= []);
  (window as unknown as { __JUCE__: unknown }).__JUCE__ = {
    backend: {
      addEventListener: (_n: string, cb: (p: unknown) => void) => {
        listeners.push(cb);
        return 0;
      },
      emitEvent: (_n: string, payload: unknown) => {
        const { name, resultId } = (payload ?? {}) as {
          name?: string;
          resultId?: number;
        };
        const result =
          name === "elementGetNodeParameters"
            ? { parameters: BIG_PLUGIN_PARAMS }
            : undefined;
        // Complete asynchronously, like the real host round-trip.
        setTimeout(() => {
          for (const cb of listeners)
            cb({ promiseId: resultId, result });
        }, 0);
      },
    },
  };
}

/** Scopes the fake bridge to this story — removes it on unmount so sibling
 *  stories rendered in the SAME page (vitest browser runs) stay bridgeless. */
function FakeBridgeScope({ children }: { children: React.ReactNode }) {
  // Install synchronously during render: the param fetch fires on child mount.
  installFakeParamsBridge();
  useEffect(
    () => () => {
      delete (window as unknown as { __JUCE__?: unknown }).__JUCE__;
    },
    [],
  );
  return <>{children}</>;
}

export const BlockTab_BigPluginParams: Story = {
  decorators: [
    (Story) => {
      seedNodeSelected(selectedModifier);
      return (
        <FakeBridgeScope>
          <div style={PANEL} className="bg-panel">
            <Story />
          </div>
        </FakeBridgeScope>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "BLOCK tab with a 13-param plugin (fake bridge answers the REAL fetch path). Demonstrates the F1 " +
          "naming fix (a param with an empty JUCE label renders its real NAME; 'dB'/'Hz' labels render as " +
          "muted UNIT suffixes next to values), the G3 NeuSlider rows (inset groove + raised thumb — no " +
          "flat native range styling), and the G5 big-plugin layout: sticky filter (>8 params) and " +
          "collapsible Delay*/Mod* prefix groups (>12 params).",
      },
    },
  },
  play: async ({ canvas }) => {
    // F1: empty-label param renders its real name.
    await waitFor(() => expect(canvas.getByText("Mix")).toBeInTheDocument());
    // F1: unit suffix from the JUCE label sits next to the value.
    await expect(canvas.getByText("dB")).toBeInTheDocument();
    // G5: sticky filter present above 8 params.
    await expect(
      canvas.getByPlaceholderText(/filter 13 parameters/i),
    ).toBeInTheDocument();
    // G5: prefix groups exist and collapse.
    const delayHeader = canvas.getByText("Delay").closest("button")!;
    await expect(delayHeader).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(delayHeader);
    await expect(delayHeader).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(delayHeader);
    // G3: rows are accessible NeuSliders, not native range inputs.
    await expect(
      canvas.getByRole("slider", { name: "Mod Rate" }),
    ).toBeInTheDocument();
  },
};

// ── BLOCK — 📌 pin-to-face (Task 3.E; BUG-1 default-zero, 2026-06-10) ─────────
//
// A plugin that exposes Value/CV param PORTS (the params-as-ports model). The
// Block view's Params sub-view shows the "Block face" section with a 📌 pin-to-face
// toggle per REAL param port. BUG-1: pins now live in useFacePinStore (positive
// opt-in, default EMPTY — zero params on face). The decorator seeds Mix as pinned
// (1 of 3) so the story shows a realistic "one param on the face" state.
// NOTHING-fake: only real param ports appear; no fabricated values.
const paramReverb: BlockData = {
  id: "rev-1",
  name: "Cloud Reverb",
  category: "audiofx",
  format: "VST3",
  position: { x: 240, y: 140 },
  ports: [
    { id: "in-l", type: "audio", direction: "input", label: "In L", connected: true },
    { id: "in-r", type: "audio", direction: "input", label: "In R", connected: true },
    { id: "out-l", type: "audio", direction: "output", label: "Out L", connected: true },
    { id: "out-r", type: "audio", direction: "output", label: "Out R", connected: true },
    // Value/CV PARAM ports — the pinnable set.
    { id: "p-mix", type: "value", direction: "input", label: "Mix", connected: false },
    { id: "p-decay", type: "value", direction: "input", label: "Decay", connected: false },
    { id: "p-width", type: "value", direction: "input", label: "Width", connected: false },
  ],
  cpuLoad: 3.2,
  latencyMs: 0,
  bypassed: false,
  muted: false,
  muteInput: false,
  error: false,
  isMacroTagged: false,
  collapseTier: "macro",
};

export const BlockTab_FaceParamsPin: Story = {
  decorators: [
    (Story) => {
      seedNodeSelected(paramReverb);
      // Seed Mix as the one pinned param (1 of 3). Cleaned up on unmount so
      // other stories start from the default-zero state.
      useEffect(() => {
        useFacePinStore.getState().setPinnedSet("rev-1", ["p-mix"]);
        return () => useFacePinStore.getState().setPinnedSet("rev-1", []);
      }, []);
      return (
        <div style={PANEL} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "BLOCK view, Params sub-view, for a plugin exposing Value/CV param PORTS (Mix/Decay/Width). The " +
          "'Block face' section lists each REAL param with a 📌 pin-to-face toggle (a thin NeuToggle " +
          "wrapper). BUG-1 fix: pins live in useFacePinStore (positive opt-in, default empty). The " +
          "decorator seeds Mix as pinned (1 of 3). Toggling a pin updates the store — NOTHING fabricated: " +
          "only real param ports appear, never a fake knob/value.",
      },
    },
  },
  play: async ({ canvas }) => {
    // The Block face section + its pin count (1 of 3 pinned: Mix seeded via store).
    await expect(canvas.getByText(/Block face/i)).toBeInTheDocument();
    await expect(
      canvas.getByLabelText(/1 of 3 parameters pinned/i),
    ).toBeInTheDocument();
    // Mix is pinned → its labelled group offers "Unpin Mix from Block face" and
    // the real NeuToggle (role="switch") reads checked.
    const mixPin = canvas.getByRole("group", { name: /unpin mix from block face/i });
    await expect(within(mixPin).getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // Decay + Width are unpinned → "Pin … to Block face" + unchecked switch.
    const decayPin = canvas.getByRole("group", { name: /pin decay to block face/i });
    const decaySwitch = within(decayPin).getByRole("switch");
    await expect(decaySwitch).toHaveAttribute("aria-checked", "false");
    await expect(
      within(
        canvas.getByRole("group", { name: /pin width to block face/i }),
      ).getByRole("switch"),
    ).toHaveAttribute("aria-checked", "false");
    // The pin toggle is interactive — clicking updates useFacePinStore directly
    // (no JUCE bridge needed; the persistence is covered by the unit tests).
    await userEvent.click(decaySwitch);
  },
};
