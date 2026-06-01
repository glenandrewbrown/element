import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent } from "storybook/test";
import { BottomStrip } from "./BottomStrip";
import { usePerformStore } from "../../stores/usePerformStore";
import { useEngineSnapshotStore } from "../../stores/useEngineSnapshotStore";
import { useGraphStore } from "../../stores/useGraphStore";
import type { BlockData, CableData } from "../../data/types";

/**
 * BottomStrip reads from three real stores:
 *  • useEngineSnapshotStore — transport (play/record), engine running, SR,
 *    buffer, latency, CPU, time signature (the 4 Hz C++ snapshot).
 *  • usePerformStore        — bpm + liveHealth.outputPeak (the master meter).
 *  • useGraphStore          — node/edge counts (BLOCKS / CABLES).
 *
 * Transport WRITE actions go through the `nativeTransport*` bridge; without a
 * JUCE backend those calls resolve to no-ops, so the click tests assert the
 * button is wired/operable rather than a state flip (the flip arrives via the
 * snapshot poll in the real host — the same contract the Toolbar relies on).
 */

// Two demo blocks + one cable so BLOCKS/CABLES read non-zero in the catalog.
const demoBlocks = [
  { id: "b1", type: "instrument" },
  { id: "b2", type: "audiofx" },
] as unknown as BlockData[];
const demoCables = [{ id: "c1", source: "b1", target: "b2" }] as unknown as CableData[];

function seed(overrides: {
  engineRunning?: boolean;
  transportPlaying?: boolean;
  transportRecording?: boolean;
  sampleRate?: number;
  bufferSize?: number;
  latencyInMs?: number;
  latencyOutMs?: number;
  cpu?: number; // fraction 0..1
  timeSig?: [number, number];
  bpm?: number;
  outputPeak?: number; // 0..1
  blocks?: BlockData[];
  cables?: CableData[];
}) {
  useEngineSnapshotStore.setState((s) => ({
    ...s,
    engineRunning: overrides.engineRunning ?? false,
    hasHostData: true,
    transportPlaying: overrides.transportPlaying ?? false,
    transportRecording: overrides.transportRecording ?? false,
    sampleRate: overrides.sampleRate ?? 0,
    bufferSize: overrides.bufferSize ?? 0,
    deviceLatencyInputMs: overrides.latencyInMs ?? 0,
    deviceLatencyOutputMs: overrides.latencyOutMs ?? 0,
    cpu: overrides.cpu ?? 0,
    timeSig: overrides.timeSig ?? [4, 4],
  }));
  usePerformStore.setState((s) => ({
    ...s,
    liveHealth: {
      ...s.liveHealth,
      bpm: overrides.bpm ?? 120,
      outputPeak: overrides.outputPeak ?? 0,
    },
  }));
  useGraphStore.setState({
    nodes: overrides.blocks ?? [],
    edges: overrides.cables ?? [],
  });
}

const meta = {
  title: "Layout/BottomStrip",
  component: BottomStrip,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Persistent footer status bar (bake-off verdict #22, MERGE 50/50): the mockup's transport cluster + dual master meter on Element's chassis, beside Element's slim status fields (ENGINE/SR/BUF/LAT/CPU/BLOCKS/CABLES). All data is REAL — transport via useEngineSnapshotStore + nativeTransport* bridge, master meter via usePerformStore.outputPeak (single aggregate host peak — both ladder rows reflect it, not a fake L/R split), device vitals from the snapshot, counts from useGraphStore. The collapsible minimap slot shows an honest n/a placeholder until AppShell integration wires a real viewport. Not yet mounted in AppShell.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ height: 54 }} className="w-full">
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
} satisfies Meta<typeof BottomStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Primary: live engine, signal hitting the master meter ──
export const Running: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Healthy live state — engine OK, 48k/256, low latency, sub-50% CPU (green), tempo 124, signal lighting the master ladders into the amber band.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed({
        engineRunning: true,
        transportPlaying: true,
        sampleRate: 48000,
        bufferSize: 256,
        latencyInMs: 2.6,
        latencyOutMs: 2.7,
        cpu: 0.234,
        timeSig: [4, 4],
        bpm: 124,
        outputPeak: 0.78,
        blocks: demoBlocks,
        cables: demoCables,
      });
      return <Story />;
    },
  ],
  play: async ({ canvas }) => {
    // Engine vitals are visible and real.
    await expect(canvas.getByText("ENGINE")).toBeInTheDocument();
    await expect(canvas.getByText("OK")).toBeInTheDocument();
    await expect(canvas.getByText("48k")).toBeInTheDocument();
    await expect(canvas.getByText("256")).toBeInTheDocument();
    await expect(canvas.getByText("5.3ms")).toBeInTheDocument();
    // Topology counts reflect useGraphStore.
    await expect(canvas.getByText("BLOCKS")).toBeInTheDocument();
    await expect(canvas.getByText("CABLES")).toBeInTheDocument();
    // Playing → the toggle is labelled Pause.
    await expect(canvas.getByLabelText("Pause")).toBeInTheDocument();
    // Master meter exposes its live value via the meter role.
    const meter = canvas.getByRole("meter", { name: "Master output level" });
    const now = Number(meter.getAttribute("aria-valuenow"));
    await expect(now).toBeGreaterThan(0);
  },
};

// ── Stopped / idle: nothing fake — meter dark, em-dash fields ──
export const StoppedIdle: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Engine off, transport stopped, no signal: master ladders fully dark (-∞), device fields show em-dash fallbacks, Play is the transport label. Proves the strip never invents motion.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed({ engineRunning: false, outputPeak: 0, blocks: [], cables: [] });
      return <Story />;
    },
  ],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("OFF")).toBeInTheDocument();
    await expect(canvas.getByText("-∞")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Play")).toBeInTheDocument();
    // Meter idle → no lit segments.
    const meter = canvas.getByRole("meter", { name: "Master output level" });
    await expect(meter.getAttribute("aria-valuenow")).toBe("0");
  },
};

// ── Recording + hot CPU ──
export const RecordingHotCpu: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Armed and recording (record button active/red), CPU in the >80% danger band (error-red), signal peaking into the clip segments.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed({
        engineRunning: true,
        transportPlaying: true,
        transportRecording: true,
        sampleRate: 44100,
        bufferSize: 128,
        latencyInMs: 1.4,
        latencyOutMs: 1.3,
        cpu: 0.876,
        bpm: 90,
        outputPeak: 0.97,
        blocks: demoBlocks,
        cables: demoCables,
      });
      return <Story />;
    },
  ],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("44.1k")).toBeInTheDocument();
    await expect(canvas.getByText("88%")).toBeInTheDocument();
    // Record is active → its label is the "stop recording" affordance.
    await expect(canvas.getByLabelText("Stop recording")).toBeInTheDocument();
  },
};

// ── Interaction: transport buttons are wired/operable ──
export const TransportInteraction: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Drives the transport: clicking Play / Stop / Rewind / Record exercises the nativeTransport* bridge wiring (no-op without a JUCE backend; in the host the snapshot poll flips the icons). Asserts the controls are present and operable.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed({
        engineRunning: true,
        transportPlaying: false,
        sampleRate: 48000,
        bufferSize: 512,
        latencyInMs: 5,
        latencyOutMs: 5,
        cpu: 0.4,
        bpm: 120,
        outputPeak: 0.3,
        blocks: demoBlocks,
        cables: demoCables,
      });
      return <Story />;
    },
  ],
  play: async ({ canvas }) => {
    const play = canvas.getByLabelText("Play");
    const stop = canvas.getByLabelText("Stop");
    const rewind = canvas.getByLabelText("Rewind to start");
    const record = canvas.getByLabelText("Record");
    await expect(play).toBeEnabled();
    await expect(stop).toBeEnabled();
    await expect(rewind).toBeEnabled();
    await expect(record).toBeEnabled();
    // Operable without throwing (bridge no-ops in Storybook).
    await userEvent.click(rewind);
    await userEvent.click(play);
    await userEvent.click(stop);
    await userEvent.click(record);
    // TAP tempo affordance present + operable.
    const tap = canvas.getByLabelText("Tap tempo");
    await userEvent.click(tap);
    await expect(tap).toBeInTheDocument();
  },
};

// ── Interaction: edit tempo inline ──
export const EditTempo: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Click the BPM readout to reveal the inline number editor; type a new tempo and commit with Enter (writes via nativeTransportSetTempo in the host).",
      },
    },
  },
  decorators: [
    (Story) => {
      seed({
        engineRunning: true,
        sampleRate: 48000,
        bufferSize: 256,
        cpu: 0.2,
        bpm: 120,
        outputPeak: 0.1,
        blocks: demoBlocks,
        cables: demoCables,
      });
      return <Story />;
    },
  ],
  play: async ({ canvas, canvasElement }) => {
    const bpmBtn = canvas.getByTitle("Click to edit tempo");
    await userEvent.click(bpmBtn);
    const input = within(canvasElement).getByLabelText("Tempo in BPM");
    await expect(input).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "140");
    await userEvent.keyboard("{Enter}");
    // Editor closes after commit → readout button is back.
    await expect(canvas.getByTitle("Click to edit tempo")).toBeInTheDocument();
  },
};

// ── Minimap collapse toggle (honest n/a slot) ──
export const MinimapToggle: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The mockup's collapsible minimap affordance is preserved, but with an honest 'minimap n/a' placeholder (no real strip-scope viewport source yet). Toggling reveals/hides the slot.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed({
        engineRunning: true,
        sampleRate: 48000,
        bufferSize: 256,
        cpu: 0.15,
        outputPeak: 0.5,
        blocks: demoBlocks,
        cables: demoCables,
      });
      return <Story />;
    },
  ],
  play: async ({ canvas }) => {
    const toggle = canvas.getByLabelText("Show minimap");
    await userEvent.click(toggle);
    await expect(canvas.getByText("minimap n/a")).toBeInTheDocument();
    // Toggle now collapses it.
    await userEvent.click(canvas.getByLabelText("Hide minimap"));
    await expect(canvas.queryByText("minimap n/a")).not.toBeInTheDocument();
  },
};
