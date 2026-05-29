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
    blockCategory: "generator",
  },
  {
    identifier: "com.vendor.ProQ4",
    name: "Pro-Q 4",
    manufacturer: "FabFilter",
    format: "AU",
    category: "EQ",
    blockCategory: "modifier",
  },
  {
    identifier: "com.vendor.Arp",
    name: "Stepic",
    manufacturer: "Audiomodern",
    format: "CLAP",
    category: "MIDI",
    blockCategory: "logic",
  },
];

const demoBlocks: BlockData[] = [
  {
    id: "n1",
    name: "Serum",
    category: "generator",
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
    category: "modifier",
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
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CommandPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: { open: true, onClose: () => {} },
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
