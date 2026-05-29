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
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof QuickAccess>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Populated board with several blocks ──
export const WithBlocks: Story = {
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
