import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Node } from "@xyflow/react";
import { MiniFlow } from "../../../.storybook/decorators";
import { Block } from "./Block";
import { useParameterStore } from "../../stores/useParameterStore";
import { useGraphStore } from "../../stores/useGraphStore";
import { useCableMeterStore } from "../../stores/useCableMeterStore";
import type { BlockData, CableData } from "../../data/types";

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

// Seeds `useParameterStore` with live param values for one Block so the on-Block
// knobs (verdict 1) render the way they do against the real 15 Hz host delta.
// Cleared on unmount so stories stay isolated.
function SeededFlow({
  data,
  params,
  height = 320,
  selected = false,
}: {
  data: BlockData;
  params: number[];
  height?: number;
  selected?: boolean;
}) {
  // `params` is a fresh literal each render; key the effect on its contents so
  // it doesn't clear+reseed on every re-render.
  const seedKey = params.join(",");
  useEffect(() => {
    const st = useParameterStore.getState();
    params.forEach((v, i) => st.setLocal(data.id, i, v));
    return () => useParameterStore.getState().clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id, seedKey]);
  return (
    <MiniFlow
      nodes={[{ ...flowNode(data), selected }]}
      nodeTypes={nodeTypes}
      height={height}
    />
  );
}

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

export const Instrument: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Instrument Block — blue ● accent. The baseline sound-source state: an inline knob bank (live param values off `useParameterStore`) plus the stacked L/R RMS strip fills the control deck, matching the mockup's Kick Synth (PITCH/DECAY + meters). Seeded here with three param values so the deck is never dead.",
      },
    },
  },
  render: () => (
    <SeededFlow
      data={makeBlock({ name: "Serum", category: "instrument", format: "VST3" })}
      params={[0.45, 0.62, 0.3]}
    />
  ),
};
export const AudioFx: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "AudioFx Block — orange ◆ accent. Inline knob bank + RMS strip fills the deck (mockup parity); confirms the effect signal role reads at a glance with nothing dead in the middle. Seeded with live param values.",
      },
    },
  },
  render: () => (
    <SeededFlow
      data={makeBlock({ name: "Pro-Q 4", category: "audiofx", format: "AU" })}
      params={[0.62, 0.4, 0.78]}
    />
  ),
};
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

// ── Verdict 1 (pilot) — re-housed mockup affordances on the real engine ──

export const PilotKnobs: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Pilot (bake-off verdict 1). On-Block knobs are wired to REAL parameters — live value read off `useParameterStore` (the host's 15 Hz delta channel), and a vertical drag writes back through `nativeSetNodeParameter` → `elementSetNodeParameter` → `setValueNotifyingHost` (Shift = fine). The header carries the wired B (bypass) / M (mute) buttons + a signal LED. Seeded here with three param values so the knobs render off-engine.",
      },
    },
    // addon-designs: the bake-off design reference is the mindful-studio mockup
    // NodeBlock. Run the mockup Storybook on :6008 (ELEMENT_SB_MOCKUP_REF=1) to
    // populate the Design panel for the per-component compare.
    design: {
      type: "iframe",
      name: "Bake-off ref — mockup NodeBlock (mindful-studio :6008)",
      url: "http://localhost:6008",
    },
  },
  render: () => (
    <SeededFlow
      data={makeBlock({ name: "Pro-Q 4", category: "audiofx", format: "AU" })}
      params={[0.62, 0.4, 0.78]}
    />
  ),
};

export const PilotKnobsFocused: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Same pilot Block, hovered/selected — the dense state. Port labels (outward) + the compact perf row reveal alongside the knobs; this is the layout-stress case where overlap would show if the body weren't budgeted.",
      },
    },
  },
  render: () => (
    <SeededFlow
      selected
      data={makeBlock({
        name: "Pro-Q 4",
        category: "audiofx",
        format: "AU",
        ports: [
          { id: "in", type: "audio", direction: "input", label: "In", connected: true },
          { id: "sc", type: "audio", direction: "input", label: "SC", connected: false },
          { id: "out", type: "audio", direction: "output", label: "Out", connected: true },
        ],
      })}
      params={[0.62, 0.4, 0.78]}
    />
  ),
};

export const Muted: Story = story(
  makeBlock({ name: "Reverb", category: "audiofx", muted: true }),
  "Muted Block — header M lit red + body dimmed. Wired to the real `toggleMute` engine action (optimistic + host-confirmed).",
);

// Drives the Block VU off REAL cable data: seeds useGraphStore with this block
// + an outgoing edge, then pushes a non-zero level for that edge into
// useCableMeterStore (the same store the host fills ~60Hz). useBlockOutputLevel
// derives the meter level = max over outgoing cables, so the VU lights — proving
// the signal→meter path end to end, with NO fabricated motion. Stores are
// restored on unmount so the story stays isolated.
function VuFlow({ level }: { level: number }) {
  const data = makeBlock({ name: "Bass Synth", category: "instrument", format: "VST3" });
  const edgeId = `${data.id}-out`;
  useEffect(() => {
    const g = useGraphStore.getState();
    const prevNodes = g.nodes;
    const prevEdges = g.edges;
    const edge: CableData = {
      id: edgeId,
      source: data.id,
      sourcePort: "out",
      target: "downstream",
      targetPort: "in",
      signalType: "audio",
      channelCount: 2,
      isSidechain: false,
    };
    useGraphStore.setState({ nodes: [data], edges: [edge] });
    useCableMeterStore.setState({ levels: { [edgeId]: level } });
    return () => {
      useGraphStore.setState({ nodes: prevNodes, edges: prevEdges });
      useCableMeterStore.setState({ levels: {} });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);
  return <MiniFlow nodes={[flowNode(data)]} nodeTypes={nodeTypes} height={320} />;
}

export const VuMeterLit: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "VU lit by REAL signal (Q-VU-PER-BLOCK fast path). The Block's RMS strip is driven by the live level of its OUTGOING cable via `useBlockOutputLevel` (max over outgoing edges in `useCableMeterStore` — the store the host pushes ~60Hz). Here a level of 0.82 is fed for the outgoing cable, so the LED ladder lights into the amber shoulder. At a level of 0 the same meter stays dark — nothing is fabricated. The C++ feeds this store in the running app; a true per-channel L/R bridge is the later D1-full step.",
      },
    },
  },
  render: () => <VuFlow level={0.82} />,
};

export const VuMeterIdle: Story = {
  tags: ["!manifest"],
  parameters: {
    docs: {
      description: {
        story:
          "Honesty control for VuMeterLit — identical Block, outgoing cable level 0, so the VU stays dark. Confirms the meter reflects real signal rather than always-on motion.",
      },
    },
  },
  render: () => <VuFlow level={0} />,
};

export const LabeledPorts: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Verdict 1 — labeled ports. Each handle shows its real engine `port.label` OUTWARD of the chassis (in the canvas gutter, never over the body), revealed only on port-hover or when the block is hovered/selected so the canvas stays clean at rest. Long labels truncate. Shown here with the block selected so all labels are visible; suppressed when the port is a wireless bus.",
      },
    },
  },
  render: () => {
    const data = makeBlock({
      name: "Splitter",
      category: "midifx",
      format: "INT",
      ports: [
        { id: "ai", type: "audio", direction: "input", label: "Audio In", connected: true },
        { id: "mi", type: "midi", direction: "input", label: "MIDI In", connected: true },
        { id: "mo", type: "midi", direction: "output", label: "Ch 1", connected: false },
        { id: "vo", type: "value", direction: "output", label: "Gate", connected: false },
      ],
    });
    return (
      <MiniFlow
        nodes={[{ ...flowNode(data), selected: true }]}
        nodeTypes={nodeTypes}
        height={320}
      />
    );
  },
};

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
