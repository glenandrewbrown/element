import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuickAccess } from "./QuickAccess";
import { useGraphStore } from "../../stores/useGraphStore";
import { usePerformStore } from "../../stores/usePerformStore";

// ── Store seeding ──
// QuickAccess reads from useGraphStore (nodes via selectNodes) and
// usePerformStore (sessionName via selectSessionName, liveHealth via
// selectLiveHealth). No bridge calls at mount — pure store render.

const defaultHealth = {
  cpu: 14.2,
  buffer: 256,
  latency: 5.8,
  clock: "Built-in Output",
  bpm: 120,
  timecode: "1.1.0",
  sampleRateLabel: "48.0 kHz",
  alerts: [],
  ioActivity: "nominal" as const,
  outputPeak: 0.3,
};

const demoNodes = [
  {
    id: "n1",
    name: "Mini V3",
    category: "generator" as const,
    format: "AU" as const,
    position: { x: 100, y: 80 },
    ports: [],
    cpuLoad: 4.2,
    latencyMs: 0,
    bypassed: false,
    muted: false,
    muteInput: false,
    error: false,
    isMacroTagged: false,
  },
  {
    id: "n2",
    name: "Pro-Q 3",
    category: "modifier" as const,
    format: "VST3" as const,
    position: { x: 320, y: 80 },
    ports: [],
    cpuLoad: 2.1,
    latencyMs: 0,
    bypassed: false,
    muted: false,
    muteInput: false,
    error: false,
    isMacroTagged: false,
  },
  {
    id: "n3",
    name: "EchoBoy",
    category: "modifier" as const,
    format: "AU" as const,
    position: { x: 540, y: 80 },
    ports: [],
    cpuLoad: 3.8,
    latencyMs: 22.5,
    bypassed: true,
    muted: false,
    muteInput: false,
    error: false,
    isMacroTagged: false,
  },
  {
    id: "n4",
    name: "MIDI Monitor",
    category: "logic" as const,
    format: "INT" as const,
    position: { x: 100, y: 220 },
    ports: [],
    cpuLoad: 0.1,
    latencyMs: 0,
    bypassed: false,
    muted: false,
    muteInput: false,
    error: false,
    isMacroTagged: false,
  },
];

const meta = {
  title: "Layout/QuickAccess",
  component: QuickAccess,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Perform-mode left rail: a flat, read-only roster of every Block on the active Board, ordered by canvas position and category-dotted (generator/modifier/logic), with a live audio-device/CPU footer. Reads useGraphStore.nodes and usePerformStore (sessionName, liveHealth); seed both per story.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof QuickAccess>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Populated board with several blocks ──
export const WithBlocks: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The real on-stage use: a mixed chain (generator + modifiers + logic) with one bypassed Block, showing the category dots, format/bypass sub-labels, and a healthy CPU footer.",
      },
    },
  },
  decorators: [
    (Story) => {
      useGraphStore.setState((s) => ({ ...s, nodes: demoNodes, edges: [] }));
      usePerformStore.setState((s) => ({
        sessionName: "Demo Session",
        liveHealth: { ...s.liveHealth, ...defaultHealth },
      }));
      return (
        <div style={{ width: 280, height: 560 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};

// ── Empty board (no blocks) ──
export const Empty: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Fresh Project with nothing on the Board: shows the 'No blocks yet' prompt directing the user to the palette or QuickAdd.",
      },
    },
  },
  decorators: [
    (Story) => {
      useGraphStore.setState((s) => ({ ...s, nodes: [], edges: [] }));
      usePerformStore.setState((s) => ({
        sessionName: "Empty Session",
        liveHealth: { ...s.liveHealth, ...defaultHealth, cpu: 0 },
      }));
      return (
        <div style={{ width: 280, height: 560 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};

// ── High CPU warning state ──
export const HighCpu: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "CPU above the 85% threshold: the footer status dot turns error-red, the cue that the Project is overloading the audio device.",
      },
    },
  },
  decorators: [
    (Story) => {
      useGraphStore.setState((s) => ({ ...s, nodes: demoNodes, edges: [] }));
      usePerformStore.setState((s) => ({
        sessionName: "Heavy Session",
        liveHealth: { ...s.liveHealth, ...defaultHealth, cpu: 92.1 },
      }));
      return (
        <div style={{ width: 280, height: 560 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};
