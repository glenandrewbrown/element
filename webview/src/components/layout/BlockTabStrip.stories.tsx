import type { Meta, StoryObj } from "@storybook/react-vite";
import { BlockTabStrip } from "./BlockTabStrip";
import { useAppStore } from "../../stores/useAppStore";
import { useGraphStore } from "../../stores/useGraphStore";

// ── Store seeding ──
// BlockTabStrip reads from useAppStore (openBlockTabs), useGraphStore
// (selectedNodeId, nodes for name lookup). Returns null when openBlockTabs
// is empty (documented edge case). No bridge calls.

const tabNodes = [
  {
    id: "tab-1",
    name: "Pro-Q 3",
    category: "modifier" as const,
    format: "VST3" as const,
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 2.1,
    latencyMs: 0,
    bypassed: false,
    error: false,
    isMacroTagged: false,
  },
  {
    id: "tab-2",
    name: "Mini V3",
    category: "generator" as const,
    format: "AU" as const,
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 4.2,
    latencyMs: 0,
    bypassed: false,
    error: false,
    isMacroTagged: false,
  },
  {
    id: "tab-3",
    name: "EchoBoy",
    category: "modifier" as const,
    format: "AU" as const,
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 3.8,
    latencyMs: 22.5,
    bypassed: false,
    error: false,
    isMacroTagged: false,
  },
];

const meta = {
  title: "Layout/BlockTabStrip",
  component: BlockTabStrip,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof BlockTabStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Several tabs, first one active ──
export const MultipleTabs: Story = {
  decorators: [
    (Story) => {
      useGraphStore.setState((s) => ({ ...s, nodes: tabNodes, selectedNodeId: "tab-1" }));
      useAppStore.setState({ openBlockTabs: ["tab-1", "tab-2", "tab-3"] });
      return (
        <div style={{ width: 900, height: 32 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};

// ── Single tab, active ──
export const SingleTab: Story = {
  decorators: [
    (Story) => {
      useGraphStore.setState((s) => ({ ...s, nodes: tabNodes, selectedNodeId: "tab-2" }));
      useAppStore.setState({ openBlockTabs: ["tab-2"] });
      return (
        <div style={{ width: 900, height: 32 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};

// ── Middle tab active ──
export const MiddleTabActive: Story = {
  decorators: [
    (Story) => {
      useGraphStore.setState((s) => ({ ...s, nodes: tabNodes, selectedNodeId: "tab-2" }));
      useAppStore.setState({ openBlockTabs: ["tab-1", "tab-2", "tab-3"] });
      return (
        <div style={{ width: 900, height: 32 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};

// ── Empty — BlockTabStrip returns null; wrapper shows empty area ──
// BlockTabStrip renders null when openBlockTabs is empty (by design).
export const NoTabs: Story = {
  decorators: [
    (Story) => {
      useGraphStore.setState((s) => ({ ...s, nodes: [], selectedNodeId: null }));
      useAppStore.setState({ openBlockTabs: [] });
      return (
        <div
          style={{ width: 900, height: 32 }}
          className="bg-panel flex items-center justify-center"
        >
          <span className="text-[10px] text-text-dim italic">
            (BlockTabStrip renders null when no tabs are open)
          </span>
          <Story />
        </div>
      );
    },
  ],
};
