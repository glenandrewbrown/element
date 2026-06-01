import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { InspectorHub } from "./InspectorHub";
import { useGraphStore } from "../../stores/useGraphStore";
import { usePerformStore } from "../../stores/usePerformStore";
import { useEngineSnapshotStore } from "../../stores/useEngineSnapshotStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { useBusStore } from "../../stores/useBusStore";
import { useCableMeterStore } from "../../stores/useCableMeterStore";
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

function seedProjectOverview() {
  useGraphStore.setState((s) => ({
    ...s,
    nodes: [selectedModifier, selectedGenerator],
    edges: [
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
    ],
    selectedNodeId: null,
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

const PANEL = { width: 300, height: 680 } as const;

const meta = {
  title: "Layout/InspectorHub",
  component: InspectorHub,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Docked tabbed inspector shell (bake-off verdict #6) — Block / Bus / Cable / Health. " +
          "BLOCK holds the per-Block detail: gradient header, A/B preset compare, parameter sliders, " +
          "plugin-window embed, bypass/mute controls, metrics, notes, and the inline Script editor for " +
          "Script Blocks (with nothing selected it shows the Project Overview). BUS is the wireless-bus " +
          "auditor. CABLE is the routing editor + smart-cable meter count. HEALTH consolidates engine " +
          "vitals, host meters, and the log. The docked shell + gradient header come from the mockup; " +
          "the wiring, stores, and bridge calls are Element's.",
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
    // The BLOCK tab is default-active and selected.
    const blockTab = canvas.getByRole("tab", { name: "BLOCK" });
    await expect(blockTab).toHaveAttribute("aria-selected", "true");
    // Header reflects the selected block + its live ACTIVE state.
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
    // The inline Script editor mounted inside the Block tab — assert on its
    // unique "Save & Compile" action (the block is itself named "Script", so
    // that text alone would be ambiguous).
    await expect(canvas.getByText("Save & Compile")).toBeInTheDocument();
  },
};

// ── BUS tab — wireless bus auditor ──
export const BusTab: Story = {
  decorators: [
    (Story) => {
      seedNodeSelected(selectedModifier);
      // Flag the one cable as a wireless bus so the auditor shows a row.
      useBusStore.setState({ cableBus: { e1: "Reverb Send A" } });
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
          "BUS tab — the wireless-bus auditor (BusInspector). Lists every named bus on the board, its " +
          "signal-type colour, cable count and endpoints. Reachable as a first-class tab now, not just " +
          "the empty-state.",
      },
    },
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "BUS" }));
    await expect(canvas.getByRole("tab", { name: "BUS" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  },
};

// ── CABLE tab — routing editor + smart-cable meters ──
export const CableTab: Story = {
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
          "CABLE tab — the ConnectionEditor (connection list, signal-type filters, Add Cable) plus the " +
          "smart-cable meter count from the engine.",
      },
    },
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "CABLE" }));
    await expect(canvas.getByRole("tab", { name: "CABLE" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The Add Cable affordance from ConnectionEditor is present.
    await expect(canvas.getByText(/Add Cable/)).toBeInTheDocument();
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
    await userEvent.click(canvas.getByRole("tab", { name: "HEALTH" }));
    await expect(canvas.getByRole("tab", { name: "HEALTH" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The Engine vitals section header is present.
    await expect(canvas.getByText(/Engine vitals/i)).toBeInTheDocument();
  },
};

// ── Empty graph (no nodes) — BLOCK tab resting + tab nav still works ──
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
          "Empty Project (no Blocks): the BLOCK tab shows zero Blocks/Cables in the Project Overview and " +
          "every tab still mounts cleanly — the inspector on a brand-new Board.",
      },
    },
  },
  play: async ({ canvas, canvasElement }) => {
    // Walk all four tabs to prove each mounts without throwing on an empty graph.
    for (const name of ["BUS", "CABLE", "HEALTH", "BLOCK"]) {
      await userEvent.click(canvas.getByRole("tab", { name }));
      await expect(canvas.getByRole("tab", { name })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    }
    const tablist = within(canvasElement).getByRole("tablist");
    await expect(tablist).toBeInTheDocument();
  },
};
