import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Node } from "@xyflow/react";
import { MiniFlow } from "../../../.storybook/decorators";
import { Block } from "./Block";
import type { BlockData } from "../../data/types";

// ── Helpers ──

let n = 0;
function makeBlock(over: Partial<BlockData> = {}): BlockData {
  n += 1;
  return {
    id: `n${n}`,
    name: "Serum",
    category: "generator",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [
      { id: "in", type: "audio", direction: "input", label: "In", connected: true },
      { id: "out", type: "audio", direction: "output", label: "Out", connected: false },
    ],
    cpuLoad: 22,
    latencyMs: 3,
    bypassed: false,
    error: false,
    isMacroTagged: false,
    ...over,
  };
}

function flowNode(data: BlockData): Node {
  return { id: data.id, type: "block", position: { x: 0, y: 0 }, data };
}

const nodeTypes = { block: Block };

const meta = {
  title: "Canvas/Block",
  component: Block,
  parameters: { layout: "fullscreen" },
  // Block is a React Flow node — autodocs can't introspect NodeProps usefully.
  tags: ["!autodocs"],
  // Loose Meta (not `satisfies`) — Block is a React Flow node whose NodeProps
  // would otherwise force `args` on every render-only story.
} as Meta<typeof Block>;

export default meta;
type Story = StoryObj<typeof Block>;

const story = (data: BlockData, height = 320): Story => ({
  render: () => <MiniFlow nodes={[flowNode(data)]} nodeTypes={nodeTypes} height={height} />,
});

export const Generator: Story = story(makeBlock({ name: "Serum", category: "generator", format: "VST3" }));
export const Modifier: Story = story(makeBlock({ name: "Pro-Q 4", category: "modifier", format: "AU" }));
export const Logic: Story = story(makeBlock({ name: "MIDI Split", category: "logic", format: "INT" }));
export const Bypassed: Story = story(makeBlock({ name: "Reverb", category: "modifier", bypassed: true }));
export const Errored: Story = story(makeBlock({ name: "Missing.dll", error: true }));
export const Container: Story = story(
  makeBlock({ name: "Drum Bus", category: "logic", containerNodeCount: 6 }),
);

export const CategoryRow: Story = {
  render: () => (
    <MiniFlow
      height={360}
      nodeTypes={nodeTypes}
      nodes={[
        { id: "a", type: "block", position: { x: 0, y: 0 }, data: makeBlock({ name: "Serum", category: "generator" }) },
        { id: "b", type: "block", position: { x: 240, y: 0 }, data: makeBlock({ name: "Pro-Q 4", category: "modifier", format: "AU" }) },
        { id: "c", type: "block", position: { x: 480, y: 0 }, data: makeBlock({ name: "Arp", category: "logic", format: "CLAP" }) },
      ]}
    />
  ),
};
