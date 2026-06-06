import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Node, Edge } from "@xyflow/react";
import { MiniFlow } from "../../../.storybook/decorators";
import { Cable } from "./Cable";
import type { CableData, SignalType } from "../../data/types";
import { useAppStore } from "../../stores/useAppStore";
import { useBusStore } from "../../stores/useBusStore";
import { useCableMeterStore } from "../../stores/useCableMeterStore";

// ── Helpers ──
//
// Cable is a React Flow *edge*. We mount it on a tiny canvas with two plain
// (default-type) nodes so the edge binds to default handles without needing
// a custom node + matching port-handle ids. Signal colour is driven by
// `data.signalType`, width by `data.channelCount`. Wireless state is read
// from useBusStore (NOT data.busName); meter glow/pulse from useCableMeterStore.

const nodes: Node[] = [
  { id: "src", position: { x: 0, y: 40 }, data: { label: "Out" } },
  { id: "dst", position: { x: 240, y: 40 }, data: { label: "In" } },
];

function makeCable(over: Partial<CableData> = {}): CableData {
  return {
    id: "cab-1",
    source: "src",
    sourcePort: "out",
    target: "dst",
    targetPort: "in",
    signalType: "audio",
    channelCount: 2,
    isSidechain: false,
    ...over,
  };
}

function edge(data: CableData): Edge {
  return { id: data.id, source: "src", target: "dst", type: "cable", data };
}

const edgeTypes = { cable: Cable };

function resetStores() {
  useBusStore.setState({ cableBus: {} });
  useCableMeterStore.setState({ levels: {}, values: {} });
  // Reset routing to the T9a default (bezier) so the matrix/perf stories that
  // override it don't leak their choice into the single-cable stories.
  useAppStore.setState({ flowDebug: false, cableRouting: "bezier" });
}

// Render-only edge stories drive everything through MiniFlow, so the story
// type is left loose (`StoryObj`) rather than bound to EdgeProps — binding it
// would force a full `args: EdgeProps` on every render-only story.
const meta: Meta<typeof Cable> = {
  title: "Canvas/Cable",
  component: Cable,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Cable — the React Flow edge that draws a signal path between two Block ports. Registered as the `cable` edge type and rendered for every entry in `useGraphStore.edges`. Stroke colour encodes signal type (audio = blue, MIDI = teal, value/CV = orange), width encodes channel count (1/2/6), a dashed stroke marks a sidechain, and brightness + signal-pulse track the live engine RMS level (`useCableMeterStore`). A Cable assigned to a named bus (`useBusStore`) becomes wireless: the curve is hidden and the connection shows as per-port badges instead. Mounted on a MiniFlow canvas with two plain nodes here so the edge binds to default handles.",
      },
    },
  },
  // Cable is a React Flow edge — autodocs can't introspect EdgeProps usefully.
  tags: ["!autodocs"],
};

export default meta;
type Story = StoryObj;

function signalStory(signalType: SignalType, doc: string): Story {
  return {
    render: () => (
      <MiniFlow nodes={nodes} edges={[edge(makeCable({ signalType }))]} edgeTypes={edgeTypes} height={220} />
    ),
    parameters: { docs: { description: { story: doc } } },
    decorators: [
      (Story) => {
        resetStores();
        return <Story />;
      },
    ],
  };
}

// Signal types — audio (blue), midi (teal), value/CV (orange).
export const Audio: Story = signalStory(
  "audio",
  "Audio Cable — blue stroke. The default signal type; verifies audio routing reads as blue.",
);
export const Midi: Story = signalStory(
  "midi",
  "MIDI Cable — teal stroke. Distinguishes note/CC routing from audio at a glance.",
);
export const Value: Story = signalStory(
  "value",
  "Value/CV Cable — orange stroke. The third signal type, carrying control data independent of MIDI.",
);

// 6-channel surround cable renders at max stroke width.
export const SurroundSixChannel: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "6-channel surround Cable — max stroke width encodes channel count, so wide buses read as heavier than mono/stereo.",
      },
    },
  },
  render: () => (
    <MiniFlow
      nodes={nodes}
      edges={[edge(makeCable({ signalType: "audio", channelCount: 6 }))]}
      edgeTypes={edgeTypes}
      height={220}
    />
  ),
  decorators: [
    (Story) => {
      resetStores();
      return <Story />;
    },
  ],
};

// Sidechain cable uses a dashed stroke.
export const Sidechain: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Sidechain Cable — dashed stroke marks a sidechain/key input so it's not mistaken for the main signal path.",
      },
    },
  },
  render: () => (
    <MiniFlow
      nodes={nodes}
      edges={[edge(makeCable({ signalType: "audio", isSidechain: true }))]}
      edgeTypes={edgeTypes}
      height={220}
    />
  ),
  decorators: [
    (Story) => {
      resetStores();
      return <Story />;
    },
  ],
};

// Active cable — engine RMS level drives glow + signal pulse animation.
export const ActiveWithSignal: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Active Cable — a high engine RMS level (0.8) drives the glow + animated signal pulse, the visual feedback that signal is flowing.",
      },
    },
  },
  render: () => (
    <MiniFlow nodes={nodes} edges={[edge(makeCable())]} edgeTypes={edgeTypes} height={220} />
  ),
  decorators: [
    (Story) => {
      resetStores();
      useCableMeterStore.setState({ levels: { "cab-1": 0.8 } });
      return <Story />;
    },
  ],
};

// ── Flow-Debug chips (logic-routing plan W3) ──
// VISUAL-ONLY coverage: these stories inject store fixtures to exercise the
// chip's render states. They CANNOT and do not verify engine behaviour — the
// engine path is gated by test/engine/CVFlowTests.cpp + the live OSC check.

function flowDebugStory(
  doc: string,
  data: Partial<CableData>,
  meter: {
    levels?: Record<string, number>;
    values?: Record<string, number>;
    peaks?: Record<string, number>;
  },
): Story {
  return {
    parameters: { docs: { description: { story: doc } } },
    render: () => (
      <MiniFlow nodes={nodes} edges={[edge(makeCable(data))]} edgeTypes={edgeTypes} height={220} />
    ),
    decorators: [
      (Story) => {
        resetStores();
        useCableMeterStore.setState({
          levels: meter.levels ?? {},
          values: meter.values ?? {},
          peaks: meter.peaks ?? {},
        });
        useAppStore.setState({ flowDebug: true });
        return <Story />;
      },
    ],
  };
}

export const FlowDebugAudioHot: Story = flowDebugStory(
  "Flow-Debug on an active audio Cable — mid-cable chip reads the live level as dB in the cable's blue.",
  { signalType: "audio" },
  { levels: { "cab-1": 0.5 } },
);

export const FlowDebugAudioSilent: Story = flowDebugStory(
  "Flow-Debug on a silent audio Cable — dim '-∞ dB' chip (G4): honest silence readout for the blocked/no-signal state a gated path shows.",
  { signalType: "audio" },
  { levels: { "cab-1": 0 } },
);

export const FlowDebugCvValue: Story = flowDebugStory(
  "Flow-Debug on a CV Cable — the chip shows the ALWAYS-SIGNED live value (here -0.80) in value-orange; this is the conditional-routing readout (a Comparator emitting 0/1 reads as +0.00/+1.00).",
  { signalType: "value" },
  { levels: { "cab-1": 0.8 }, values: { "cab-1": -0.8 }, peaks: { "cab-1": 0.8 } },
);

export const FlowDebugCvZeroCrossingPeak: Story = flowDebugStory(
  "Flow-Debug on a fast bipolar CV Cable caught at a zero crossing — last sample reads +0.00 but the chip stays LIT because the block's |peak| latch (A5) carries the real activity. Without the peak feed this cable would falsely look idle.",
  { signalType: "value" },
  { levels: { "cab-1": 0.9 }, values: { "cab-1": 0 }, peaks: { "cab-1": 0.9 } },
);

export const FlowDebugMidiActive: Story = flowDebugStory(
  "Flow-Debug on an active MIDI Cable — '●' activity dot in teal while events pass (G4: the colour already says MIDI; no redundant word).",
  { signalType: "midi" },
  { levels: { "cab-1": 0.75 } },
);

export const FlowDebugControlValueDash: Story = flowDebugStory(
  "Flow-Debug on a Control-sourced value Cable — intentionally shows '—' (Control carries no numeric feed; only CV does). Not a defect.",
  { signalType: "value" },
  { levels: { "cab-1": 0.75 } },
);

// ── T9 redesign — variant matrix (routing × state) ──
// One canvas showing the cable across the locked-verdict #2 surface: bezier vs
// step (manhattan) routing crossed with idle / hot / sidechain / selected /
// bus states. Lets a reviewer eyeball plugs + arrowhead + flow-pulse + the
// soft-curve default in a single frame. NOTHING-fake: the "hot" rows seed a
// real engine level into useCableMeterStore; idle rows have no level.

type MatrixRow = {
  label: string;
  data?: Partial<CableData>;
  level?: number;
  selected?: boolean;
  bus?: string;
};

const MATRIX_ROWS: MatrixRow[] = [
  { label: "idle" },
  { label: "hot", level: 0.8 },
  { label: "sidechain", data: { isSidechain: true } },
  { label: "selected", selected: true },
  { label: "bus (wireless)", bus: "Reverb Send", selected: true },
];

function matrixStory(routing: "bezier" | "manhattan"): Story {
  return {
    parameters: {
      docs: {
        description: {
          story:
            `Cable variant matrix — ${routing} routing across idle / hot / sidechain / selected / bus states. ` +
            "Verifies the T9 redesign: endpoint plugs, per-edge direction arrowhead, and the amp-scaled flow-pulse on the hot row, with the soft-curve default (bezier) vs the explicitly-chosen step (manhattan) geometry.",
        },
      },
    },
    render: () => {
      const ROW_H = 120;
      const rowNodes: Node[] = MATRIX_ROWS.flatMap((row, i) => [
        { id: `src-${i}`, position: { x: 0, y: i * ROW_H + 20 }, data: { label: row.label } },
        { id: `dst-${i}`, position: { x: 260, y: i * ROW_H + 20 }, data: { label: "" } },
      ]);
      const rowEdges: Edge[] = MATRIX_ROWS.map((row, i) => {
        const data = makeCable({ id: `cab-${i}`, ...(row.data ?? {}) });
        return {
          id: `cab-${i}`,
          source: `src-${i}`,
          target: `dst-${i}`,
          type: "cable",
          data,
          selected: row.selected ?? false,
        };
      });
      return (
        <MiniFlow
          nodes={rowNodes}
          edges={rowEdges}
          edgeTypes={edgeTypes}
          height={MATRIX_ROWS.length * ROW_H + 40}
        />
      );
    },
    decorators: [
      (Story) => {
        resetStores();
        const levels: Record<string, number> = {};
        const cableBus: Record<string, string> = {};
        MATRIX_ROWS.forEach((row, i) => {
          if (row.level !== undefined) levels[`cab-${i}`] = row.level;
          if (row.bus) cableBus[`cab-${i}`] = row.bus;
        });
        useCableMeterStore.setState({ levels });
        useBusStore.setState({ cableBus });
        useAppStore.setState({ cableRouting: routing });
        return <Story />;
      },
    ],
  };
}

export const MatrixBezier: Story = matrixStory("bezier");
export const MatrixStep: Story = matrixStory("manhattan");

// ── Perf board — ~40 live cables ──
// Eyeball render cost with the redesigned cable (plugs + per-edge marker +
// pulse overlay) at scale. Half the cables carry a live level so the flow-pulse
// animation runs on ~20 of them simultaneously.

export const PerfBoardManyCables: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "~40-cable board — perf eyeball for the redesigned cable at scale. Every cable has its own arrowhead marker (unique id, no colour collision) and endpoint plugs; ~half carry a live level so the dashed flow-pulse animates concurrently. Watch for jank / dropped frames.",
      },
    },
  },
  render: () => {
    const COUNT = 40;
    const COLS = 4;
    const X_GAP = 220;
    const Y_GAP = 90;
    const signals: SignalType[] = ["audio", "midi", "value"];
    const perfNodes: Node[] = [];
    const perfEdges: Edge[] = [];
    for (let i = 0; i < COUNT; i++) {
      const col = i % COLS;
      const rowIdx = Math.floor(i / COLS);
      const x = col * X_GAP * 2;
      const y = rowIdx * Y_GAP + 20;
      perfNodes.push({ id: `ps-${i}`, position: { x, y }, data: { label: `${i}` } });
      perfNodes.push({ id: `pd-${i}`, position: { x: x + X_GAP, y }, data: { label: "" } });
      perfEdges.push({
        id: `pcab-${i}`,
        source: `ps-${i}`,
        target: `pd-${i}`,
        type: "cable",
        data: makeCable({
          id: `pcab-${i}`,
          signalType: signals[i % signals.length],
          channelCount: (i % 3 === 0 ? 6 : i % 2 === 0 ? 2 : 1) as 1 | 2 | 6,
        }),
      });
    }
    return (
      <MiniFlow
        nodes={perfNodes}
        edges={perfEdges}
        edgeTypes={edgeTypes}
        height={Math.ceil(COUNT / COLS) * Y_GAP + 60}
      />
    );
  },
  decorators: [
    (Story) => {
      resetStores();
      // Half the cables live (alternating) so ~20 flow-pulses run at once.
      const levels: Record<string, number> = {};
      for (let i = 0; i < 40; i += 2) levels[`pcab-${i}`] = 0.3 + (i % 5) * 0.12;
      useCableMeterStore.setState({ levels });
      useAppStore.setState({ cableRouting: "bezier" });
      return <Story />;
    },
  ],
};

// Wireless cable on a named bus. The badge lives in Block.tsx; the cable
// itself draws only a faint dotted ghost, and only when selected — so the
// edge is rendered selected here to make the wireless state visible.
export const WirelessBusBadge: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Wireless Cable on a named bus — the curve is suppressed (faint dotted ghost only while selected); the connection is shown via per-port badges in Block. Demonstrates the de-cluttering wireless-patching state.",
      },
    },
  },
  render: () => (
    <MiniFlow
      nodes={nodes}
      edges={[{ ...edge(makeCable({ busName: "Reverb Send A" })), selected: true }]}
      edgeTypes={edgeTypes}
      height={220}
    />
  ),
  decorators: [
    (Story) => {
      resetStores();
      useBusStore.setState({ cableBus: { "cab-1": "Reverb Send A" } });
      return <Story />;
    },
  ],
};
