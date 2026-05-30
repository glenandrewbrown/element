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
    category: "instrument",
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
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Block — the neumorphic node representing a single instrument/effect/utility on the Board. Registered as the React Flow `block` node type and rendered for every entry in `useGraphStore.nodes`. Colour-coded by category (generator = blue ●, modifier = orange ◆, logic = teal ▲), draws audio/MIDI/value ports as connectable handles, and adapts its body to the active semantic-zoom tier. Container and Portal Blocks, plus bypass/mute/error states, get distinct visual treatments. Mounted on a MiniFlow canvas in these stories so its React Flow handles resolve.",
      },
    },
  },
  // Block is a React Flow node — autodocs can't introspect NodeProps usefully.
  tags: ["!autodocs"],
  // Loose Meta (not `satisfies`) — Block is a React Flow node whose NodeProps
  // would otherwise force `args` on every render-only story.
} as Meta<typeof Block>;

export default meta;
type Story = StoryObj<typeof Block>;

const story = (data: BlockData, doc: string, height = 320): Story => ({
  render: () => <MiniFlow nodes={[flowNode(data)]} nodeTypes={nodeTypes} height={height} />,
  parameters: { docs: { description: { story: doc } } },
});

export const Instrument: Story = story(
  makeBlock({ name: "Serum", category: "instrument", format: "VST3" }),
  "Instrument Block — blue ● accent. The baseline sound-source state with a waveform viz in the body.",
);
export const AudioFx: Story = story(
  makeBlock({ name: "Pro-Q 4", category: "audiofx", format: "AU" }),
  "AudioFx Block — orange ◆ accent. Confirms the effect signal role reads at a glance.",
);
export const MidiFx: Story = story(
  makeBlock({ name: "MIDI Split", category: "midifx", format: "INT" }),
  "MidiFx (routing/MIDI) Block — teal ▲ accent. The MIDI/routing signal role.",
);
export const Modulator: Story = story(
  makeBlock({ name: "LFO Tool", category: "modulator", format: "CLAP" }),
  "Modulator Block — purple ⬡ accent. CV/modulation sources like LFOs, envelopes, automation curves.",
);
export const Bypassed: Story = story(
  makeBlock({ name: "Reverb", category: "audiofx", bypassed: true }),
  "Bypassed Block — diagonal-stripe overlay + dimmed header signals the engine is passing signal through untouched.",
);
export const Errored: Story = story(
  makeBlock({ name: "Missing.dll", error: true }),
  "Errored Block — pulsing red ring flags a failed/missing plugin so the user spots the broken node in a large Board.",
);
export const Container: Story = story(
  makeBlock({ name: "Drum Bus", category: "midifx", containerNodeCount: 6 }),
  "Container Block — inset surface with child slots; double-click dives into the nested Board it represents.",
);

export const CategoryRow: Story = {
  tags: ["!manifest"],
  parameters: {
    docs: {
      description: {
        story:
          "Visual showcase of all four category accents side by side — reference only, not a usage pattern.",
      },
    },
  },
  render: () => (
    <MiniFlow
      height={360}
      nodeTypes={nodeTypes}
      nodes={[
        { id: "a", type: "block", position: { x: 0, y: 0 }, data: makeBlock({ name: "Serum", category: "instrument" }) },
        { id: "b", type: "block", position: { x: 240, y: 0 }, data: makeBlock({ name: "Pro-Q 4", category: "audiofx", format: "AU" }) },
        { id: "c", type: "block", position: { x: 480, y: 0 }, data: makeBlock({ name: "Arp", category: "midifx", format: "CLAP" }) },
        { id: "d", type: "block", position: { x: 720, y: 0 }, data: makeBlock({ name: "LFO Tool", category: "modulator", format: "CLAP" }) },
      ]}
    />
  ),
};
