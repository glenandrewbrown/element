import type { Meta, StoryObj } from "@storybook/react-vite";
import { Toolbar } from "./Toolbar";
import { useAppStore } from "../../stores/useAppStore";
import { useGraphStore } from "../../stores/useGraphStore";
import { usePerformStore } from "../../stores/usePerformStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { useEngineSnapshotStore } from "../../stores/useEngineSnapshotStore";

// ── Store seeding ──
// The Edit-only Toolbar reads from useAppStore (cableRouting), useGraphStore
// (breadcrumbs), usePerformStore (bpm), useEngineSnapshotStore (transport +
// sampleRate / bufferSize / device latency / timeSig — these drive the
// SAMPLE / BUFFER / LATENCY / SIG metric fields directly), and useSessionStore
// (filePath, dirty, graphs). Native bridge calls no-op without a JUCE backend —
// only seed store state. Perform mode is shelved (D3): the toolbar has no mode
// branch, so there is no Perform story.

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
    liveHealth: { ...s.liveHealth, ...defaultHealth },
  }));
  // Engine-snapshot fields now own the metric readouts (SAMPLE = sampleRate,
  // BUFFER = bufferSize, LATENCY = input+output device latency, SIG = timeSig).
  useEngineSnapshotStore.setState({
    engineRunning: true,
    transportPlaying: false,
    transportRecording: false,
    tempoBpm: 120,
    timeSig: [4, 4] as [number, number],
    sampleRate: 44100,
    bufferSize: 256,
    deviceLatencyInputMs: 2.1,
    deviceLatencyOutputMs: 2.1,
  });
  useSessionStore.setState({
    filePath: "/Users/glen/Music/Demo.els",
    dirty: false,
    graphs: [{ id: "g1", name: "Main Board", index: 0, active: true }],
  });
}

const meta = {
  title: "Layout/Toolbar",
  component: Toolbar,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Edit-mode top application toolbar / command centre: ELEMENT wordmark, session file actions (New/Open/Save/As), depth-hued breadcrumb pills, a Board switcher (multi-Board only), undo/redo, transport (rewind/play/stop/record), tempo with tap-tempo, time signature + sample-rate / buffer / latency metrics, a ⌘K command-palette affordance, cable-routing style, About/Preferences, and the always-visible red PANIC. Perform mode is shelved (D3) so there is no mode toggle. Reads useAppStore, useGraphStore, usePerformStore, useEngineSnapshotStore, and useSessionStore — seed all five per story; native bridge calls no-op without a JUCE backend.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Toolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Edit mode, populated session ──
export const EditMode: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The default working state: a saved Project, one Board, engine running at 44.1k / 256 — the toolbar's everyday view.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedEdit();
      return (
        <div style={{ width: 1440, height: 40 }} className="bg-panel flex items-center px-2">
          <Story />
        </div>
      );
    },
  ],
};

// ── Edit mode, multiple boards + deeper breadcrumb ──
export const EditModeMultiBoard: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Multi-Board Project with a deeper, depth-hued breadcrumb (Main Project › Synth Layer › Reverb Send) and a dirty file dot — shows the Board switcher and the per-level depth pill colours.",
      },
    },
  },
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
      useGraphStore.setState({
        breadcrumbStack: ["Main Project", "Synth Layer", "Reverb Send"],
      });
      // Wider container (1680) — the dense multi-Board + 3-deep-nest case is
      // the toolbar's widest state; at a realistic desktop width the full
      // depth-hue trail shows. (Below ~1600 the breadcrumb is the flex
      // shrink-victim and the intermediate crumbs ellipsize — controls stay
      // intact; the active/deepest pill is always preserved.)
      return (
        <div style={{ width: 1680, height: 40 }} className="bg-panel flex items-center px-2">
          <Story />
        </div>
      );
    },
  ],
};

// ── Edit mode, recording + playing (transport active states) ──
export const EditModeRecording: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Transport live: playing + armed for record — the play icon flips to Pause and the record dot pulses red. Verifies the engine-snapshot-driven transport buttons.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedEdit();
      useEngineSnapshotStore.setState({
        transportPlaying: true,
        transportRecording: true,
        sampleRate: 48000,
        bufferSize: 128,
      });
      return (
        <div style={{ width: 1440, height: 40 }} className="bg-panel flex items-center px-2">
          <Story />
        </div>
      );
    },
  ],
};

// ── Edit mode, untitled (no file path, dirty) ──
export const EditModeUntitled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A brand-new unsaved Project: no file path, dirty=true, single Board — verifies the 'Untitled •' display name and the empty-session toolbar.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedEdit();
      useSessionStore.setState({
        filePath: "",
        dirty: true,
        graphs: [{ id: "g1", name: "Main Board", index: 0, active: true }],
      });
      return (
        <div style={{ width: 1440, height: 40 }} className="bg-panel flex items-center px-2">
          <Story />
        </div>
      );
    },
  ],
};

// ── Edit mode narrow — tests responsive collapse ──
export const EditModeNarrow: Story = {
  tags: ["!manifest"],
  parameters: {
    docs: {
      description: {
        story:
          "Visual-only: the same Edit state rendered at 720px to verify the responsive behaviour of the flex layout (breadcrumb well flexes, fixed clusters keep their footprint). Excluded from the agent manifest — it is a layout breakpoint test, not a distinct usage pattern.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedEdit();
      return (
        <div style={{ width: 720, height: 40 }} className="bg-panel flex items-center px-2">
          <Story />
        </div>
      );
    },
  ],
};
