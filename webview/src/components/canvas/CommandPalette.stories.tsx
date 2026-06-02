import type { Meta, StoryObj } from "@storybook/react-vite";
import { CommandPalette } from "./CommandPalette";
import { useGraphStore } from "../../stores/useGraphStore";
import { usePerformStore } from "../../stores/usePerformStore";
import {
  usePluginBrowserStore,
  type BrowserPlugin,
} from "../../stores/usePluginBrowserStore";
import type { BlockData, SceneData } from "../../data/types";

// ── Store seeding ──
// CommandPalette aggregates results from useGraphStore (blocks on canvas),
// usePluginBrowserStore (plugins), and usePerformStore (scenes). Its
// refresh() effect hits the native bridge, which no-ops without a backend
// and early-returns WITHOUT clearing the store — so the seeded plugin list
// survives. Native action bridges are also no-ops. Seeding state is enough.

const demoPlugins: BrowserPlugin[] = [
  {
    identifier: "com.vendor.SurgeXT",
    name: "Surge XT",
    manufacturer: "Surge Synth Team",
    format: "VST3",
    category: "Synth",
    blockCategory: "instrument",
    signalOut: "audio",
    usageCount: 9,
  },
  {
    identifier: "com.vendor.ProQ4",
    name: "Pro-Q 4",
    manufacturer: "FabFilter",
    format: "AU",
    category: "EQ",
    blockCategory: "audiofx",
    signalOut: "audio",
    usageCount: 4,
  },
  {
    identifier: "com.vendor.Arp",
    name: "Stepic",
    manufacturer: "Audiomodern",
    format: "CLAP",
    category: "MIDI",
    blockCategory: "midifx",
    signalOut: "midi",
    usageCount: 2,
  },
];

const demoBlocks: BlockData[] = [
  {
    id: "n1",
    name: "Serum",
    category: "instrument",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 18,
    latencyMs: 2,
    bypassed: false,
    error: false,
    isMacroTagged: false,
  },
  {
    id: "n2",
    name: "Valhalla Reverb",
    category: "audiofx",
    format: "AU",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 9,
    latencyMs: 1,
    bypassed: false,
    error: false,
    isMacroTagged: false,
  },
];

const demoScenes: SceneData[] = [
  { id: "s1", name: "Intro", index: 0, active: true, hasCapture: true },
  { id: "s2", name: "Drop", index: 1, active: false, hasCapture: true },
];

function seed(opts: {
  plugins?: BrowserPlugin[];
  blocks?: BlockData[];
  scenes?: SceneData[];
} = {}) {
  usePluginBrowserStore.setState({
    plugins: opts.plugins ?? demoPlugins,
    favoriteIdentifiers: new Set(["com.vendor.SurgeXT"]),
    recentIdentifiers: ["com.vendor.ProQ4"],
  });
  useGraphStore.setState({ nodes: opts.blocks ?? demoBlocks });
  usePerformStore.setState({ scenes: opts.scenes ?? demoScenes });
}

const meta = {
  title: "Canvas/CommandPalette",
  component: CommandPalette,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "CommandPalette — the Cmd+K \"search everything\" overlay. One keyboard-first entry point to actions (undo, save, bypass all, toggle Edit/Perform), Blocks on the Board, scannable plugins, Scenes, and host settings — grouped and runnable without leaving the keyboard. Results are aggregated live from useGraphStore, usePluginBrowserStore, and usePerformStore, which these stories seed directly.",
      },
    },
  },
} satisfies Meta<typeof CommandPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: { open: true, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Open palette with a populated Board — shows grouped Actions / Blocks / Plugins / Scenes / Settings with favourites and recents ordered first. The primary in-use state.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed();
      return (
        <div className="bg-canvas" style={{ height: 600 }}>
          <Story />
        </div>
      );
    },
  ],
};

export const EmptyResults: Story = {
  args: { open: true, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Empty Project — no Blocks, plugins, or Scenes seeded. Confirms the palette shows the \"No results\" state rather than fabricated entries.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed({ plugins: [], blocks: [], scenes: [] });
      return (
        <div className="bg-canvas" style={{ height: 600 }}>
          <Story />
        </div>
      );
    },
  ],
};
