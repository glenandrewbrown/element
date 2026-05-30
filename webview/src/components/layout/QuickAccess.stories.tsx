import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
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
    category: "instrument" as const,
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
    category: "audiofx" as const,
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
    category: "audiofx" as const,
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
    category: "midifx" as const,
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
    design: {
      type: "link",
      url: "/docs/stitch-reference/DESIGN.md",
    },
    docs: {
      description: {
        component:
          "Perform-mode left rail: a flat, read-only roster of every Block on the active Board, ordered by canvas position. Each entry shows category colour swatch, name, format, per-block CPU load bar + latency so the user can scan the signal chain at a glance. Footer mirrors the LiveHealth CPU gradient bar + a 4-bar output peak LED. Reads useGraphStore.nodes and usePerformStore (sessionName, liveHealth); seed both per story.",
      },
    },
  },
  tags: ["autodocs", "gate-ab"],
} satisfies Meta<typeof QuickAccess>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Populated board with several blocks ──
export const WithBlocks: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The real on-stage use: a mixed chain (instrument + audiofx + midifx) with one bypassed Block showing category swatches, CPU mini bars, latency, bypass label, and the health footer.",
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
  play: async ({ canvas }) => {
    // Block names visible (G-10: richer info)
    await expect(canvas.getByText("Mini V3")).toBeInTheDocument();
    await expect(canvas.getByText("Pro-Q 3")).toBeInTheDocument();
    // CPU % shown per block — not just a category dot (the key G-10 upgrade)
    await expect(canvas.getByText("4.2%")).toBeInTheDocument();
    // Bypass badge for EchoBoy
    await expect(canvas.getByText("BYP")).toBeInTheDocument();
    // Latency shown for EchoBoy
    await expect(canvas.getByText("22.5 ms")).toBeInTheDocument();
    // Footer device name always present
    await expect(canvas.getByText("Built-in Output")).toBeInTheDocument();
    // CPU progress bar accessible
    await expect(
      canvas.getByRole("progressbar", { name: /cpu load/i }),
    ).toBeInTheDocument();
  },
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
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/no blocks yet/i)).toBeInTheDocument();
    // Footer still present even with empty board
    await expect(
      canvas.getByRole("progressbar", { name: /cpu load/i }),
    ).toBeInTheDocument();
  },
};

// ── High CPU warning state ──
export const HighCpu: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "CPU above the 85% threshold: the footer CPU bar turns orange/red and the status dot turns error-red, cueing the user that the Project is overloading the audio device.",
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
  play: async ({ canvas }) => {
    // High CPU value in footer
    await expect(canvas.getByText("92%")).toBeInTheDocument();
    // Progress bar accessible in warning state
    const bar = canvas.getByRole("progressbar", { name: /cpu load/i });
    await expect(bar).toBeInTheDocument();
  },
};
