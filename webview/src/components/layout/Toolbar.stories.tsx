import type { Meta, StoryObj } from "@storybook/react-vite";
import { Toolbar } from "./Toolbar";
import { useAppStore } from "../../stores/useAppStore";
import { useGraphStore } from "../../stores/useGraphStore";
import { usePerformStore } from "../../stores/usePerformStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { useEngineSnapshotStore } from "../../stores/useEngineSnapshotStore";

// ── Store seeding ──
// Toolbar reads from useAppStore (mode, cableRouting, activeScene),
// useGraphStore (breadcrumbs), usePerformStore (bpm, scenes, liveHealth),
// useEngineSnapshotStore (engineRunning, transportPlaying, transportRecording, timeSig),
// and useSessionStore (filePath, dirty, graphs).
// Native bridge calls no-op without a JUCE backend — only seed store state.

const defaultHealth = {
  cpu: 12.3,
  buffer: 256,
  latency: 4.2,
  clock: "Built-in Output",
  bpm: 120,
  timecode: "1.1.0",
  sampleRateLabel: "44.1 kHz",
  alerts: [],
  ioActivity: "nominal" as const,
  outputPeak: 0.4,
};

function seedEdit() {
  useAppStore.setState({
    mode: "edit",
    cableRouting: "manhattan",
    activeScene: 0,
  });
  useGraphStore.setState({ breadcrumbStack: ["Main Project"] });
  usePerformStore.setState((s) => ({
    scenes: [
      { id: "s1", name: "Intro", index: 0, active: true, hasCapture: true },
      { id: "s2", name: "Verse", index: 1, active: false, hasCapture: false },
    ],
    liveHealth: { ...s.liveHealth, ...defaultHealth },
  }));
  useEngineSnapshotStore.setState({
    engineRunning: true,
    transportPlaying: false,
    transportRecording: false,
    tempoBpm: 120,
    timeSig: [4, 4] as [number, number],
  });
  useSessionStore.setState({
    filePath: "/Users/glen/Music/Demo.els",
    dirty: false,
    graphs: [
      { id: "g1", name: "Main Board", index: 0, active: true },
    ],
  });
}

function seedPerform() {
  useAppStore.setState({ mode: "perform", activeScene: 0 });
  usePerformStore.setState((s) => ({
    scenes: [
      { id: "s1", name: "Intro", index: 0, active: true, hasCapture: true },
    ],
    liveHealth: { ...s.liveHealth, ...defaultHealth },
  }));
  useEngineSnapshotStore.setState({
    engineRunning: true,
    transportPlaying: true,
    transportRecording: false,
    tempoBpm: 128,
    timeSig: [4, 4] as [number, number],
  });
  useSessionStore.setState({ filePath: "", dirty: false, graphs: [] });
}

const meta = {
  title: "Layout/Toolbar",
  component: Toolbar,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof Toolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Edit mode, populated session ──
export const EditMode: Story = {
  decorators: [
    (Story) => {
      seedEdit();
      return (
        <div style={{ width: 1100, height: 48 }} className="bg-panel flex items-center px-4">
          <Story />
        </div>
      );
    },
  ],
};

// ── Edit mode, multiple boards ──
export const EditModeMultiBoard: Story = {
  decorators: [
    (Story) => {
      seedEdit();
      useSessionStore.setState({
        filePath: "/Users/glen/Music/Demo.els",
        dirty: true,
        graphs: [
          { id: "g1", name: "Main Board", index: 0, active: true },
          { id: "g2", name: "FX Chain", index: 1, active: false },
          { id: "g3", name: "Drums", index: 2, active: false },
        ],
      });
      useGraphStore.setState({ breadcrumbStack: ["Main Project", "Synth Layer"] });
      return (
        <div style={{ width: 1100, height: 48 }} className="bg-panel flex items-center px-4">
          <Story />
        </div>
      );
    },
  ],
};

// ── Edit mode narrow — tests responsive flex-wrap collapse ──
export const EditModeNarrow: Story = {
  decorators: [
    (Story) => {
      seedEdit();
      return (
        <div style={{ width: 640, height: 48 }} className="bg-panel flex items-center px-4">
          <Story />
        </div>
      );
    },
  ],
};

// ── Perform mode with engine live ──
export const PerformMode: Story = {
  decorators: [
    (Story) => {
      seedPerform();
      return (
        <div style={{ width: 1100, height: 48 }} className="bg-panel flex items-center px-4">
          <Story />
        </div>
      );
    },
  ],
};

// ── Perform mode, engine idle (IDLE badge) ──
export const PerformModeIdle: Story = {
  decorators: [
    (Story) => {
      seedPerform();
      useEngineSnapshotStore.setState({ engineRunning: false, transportPlaying: false });
      return (
        <div style={{ width: 1100, height: 48 }} className="bg-panel flex items-center px-4">
          <Story />
        </div>
      );
    },
  ],
};

// ── Edit mode, untitled (no file path, dirty) ──
export const EditModeUntitled: Story = {
  decorators: [
    (Story) => {
      seedEdit();
      useSessionStore.setState({ filePath: "", dirty: true, graphs: [] });
      usePerformStore.setState((s) => ({
        scenes: [],
        liveHealth: { ...s.liveHealth, ...defaultHealth },
      }));
      return (
        <div style={{ width: 1100, height: 48 }} className="bg-panel flex items-center px-4">
          <Story />
        </div>
      );
    },
  ],
};
