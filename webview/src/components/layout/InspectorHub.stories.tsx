import type { Meta, StoryObj } from "@storybook/react-vite";
import { InspectorHub } from "./InspectorHub";
import { useGraphStore } from "../../stores/useGraphStore";
import { usePerformStore } from "../../stores/usePerformStore";
import { useEngineSnapshotStore } from "../../stores/useEngineSnapshotStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { useBusStore } from "../../stores/useBusStore";
import type { BlockData } from "../../data/types";

// ── Store seeding ──
// InspectorHub reads from useGraphStore (selectedNode, nodes, edges),
// usePerformStore (sessionName, liveHealth), useEngineSnapshotStore (cpu,
// sampleRate, bufferSize, deviceName, deviceLatencyMs, hasHostData),
// useHostExtrasStore (logLines), useCableMeterStore (levels), and
// useBusStore (cableBus).
//
// Node-selected path mounts BlockParameterList → nativeGetNodeParameters
// (returns { parameters: [] } when bridgeless — safe) and PresetStrip →
// nativePresetList (returns { ok: false, presets: [] } — safe).
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
}

function seedNodeSelected(node: BlockData) {
  seedProjectOverview();
  useGraphStore.setState((s) => ({ ...s, selectedNodeId: node.id }));
}

const meta = {
  title: "Layout/InspectorHub",
  component: InspectorHub,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Tabbed right-hand inspector for the selected Block. The INSPECTOR tab shows the Block header, A/B preset compare, parameter sliders, plugin-window embed, bypass/mute controls and notes; CABLES, LOG and METERS cover routing and diagnostics, and a SCRIPT tab appears for Script Blocks. With no Block selected it falls back to a Project Overview plus the wireless Bus inspector.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof InspectorHub>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── No block selected: Project Overview + Wireless Buses ──
export const NothingSelected: Story = {
  decorators: [
    (Story) => {
      seedProjectOverview();
      return (
        <div style={{ width: 280, height: 640 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "No Block selected — the inspector falls back to the Project Overview (Blocks/Cables count, engine CPU, sample rate, device) plus the wireless Bus inspector. The default resting state.",
      },
    },
  },
};

// ── AudioFx plugin selected ──
export const AudioFxSelected: Story = {
  decorators: [
    (Story) => {
      seedNodeSelected(selectedModifier);
      return (
        <div style={{ width: 280, height: 640 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "A modifier Block (EQ) selected — the full INSPECTOR tab: header, preset A/B strip, parameter list, plugin-window embed, bypass/mute controls and notes. The primary single-Block editing view.",
      },
    },
  },
};

// ── Instrument selected ──
export const InstrumentSelected: Story = {
  decorators: [
    (Story) => {
      seedNodeSelected(selectedGenerator);
      return (
        <div style={{ width: 280, height: 640 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "A generator Block (instrument) selected — confirms the generator category styling and a MIDI-in port summary in the header.",
      },
    },
  },
};

// ── Bypassed block selected ──
export const BypassedBlockSelected: Story = {
  decorators: [
    (Story) => {
      seedProjectOverview();
      useGraphStore.setState((s) => ({
        ...s,
        nodes: [
          { ...selectedModifier, id: "sel-byp", bypassed: true },
        ],
        selectedNodeId: "sel-byp",
      }));
      return (
        <div style={{ width: 280, height: 640 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Selected Block is bypassed — the BYPASS control reads its active 'BYPASSED' state, confirming the toggle reflects engine truth.",
      },
    },
  },
};

// ── Empty graph (no nodes) ──
export const EmptyGraph: Story = {
  decorators: [
    (Story) => {
      seedProjectOverview();
      useGraphStore.setState((s) => ({ ...s, nodes: [], edges: [], selectedNodeId: null }));
      return (
        <div style={{ width: 280, height: 640 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Empty Project (no Blocks): the Project Overview shows zero Blocks/Cables and the Bus inspector its tip — the inspector on a brand-new Board.",
      },
    },
  },
};
