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
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Editor-style tab bar of open Blocks above the canvas. Lets the user pin several Blocks for fast switching — click a tab to select that Block, click the X to close it. Renders nothing when no Blocks are open, so it can sit unconditionally in the layout.",
      },
    },
  },
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
  parameters: {
    docs: {
      description: {
        story:
          "Typical multi-Block workflow: three tabs open with the first selected (inset/active styling), the others showing the muted resting state.",
      },
    },
  },
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
  parameters: {
    docs: {
      description: {
        story:
          "Single open Block — the minimum non-empty strip. Verifies a lone tab renders in its active state.",
      },
    },
  },
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
  parameters: {
    docs: {
      description: {
        story:
          "Active selection sits in the middle of the strip — confirms the active tab is highlighted independent of position, with inactive tabs on both sides.",
      },
    },
  },
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
  parameters: {
    docs: {
      description: {
        story:
          "Empty state: with no open Blocks the component renders null (it does not reserve space). The wrapper text stands in for the otherwise-blank area.",
      },
    },
  },
};
