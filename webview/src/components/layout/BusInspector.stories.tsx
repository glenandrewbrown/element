import type { Meta, StoryObj } from "@storybook/react-vite";
import { BusInspector } from "./BusInspector";
import { useGraphStore } from "../../stores/useGraphStore";
import { useBusStore } from "../../stores/useBusStore";
import type { BlockData, CableData } from "../../data/types";

// BusInspector reads edges/nodes from useGraphStore and wireless bus assignments
// from useBusStore. Seed both in each story's decorator.

const meta = {
  title: "Layout/BusInspector",
  component: BusInspector,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Inspector section listing every named wireless Bus on the current Board. " +
          "Each bus row shows the Bus name, signal-type colour, cable count, and labelled " +
          "Senders/Receivers endpoint chips (`.bus-sender-highlight` / `.bus-receiver-highlight`). " +
          "A drag-drop zone (`data-drag-target=\"bus-drop\"`) affords adding cables to a bus at " +
          "story level — live C++ wiring confirmed at GATE B-C. Orphan endpoints (block gone from " +
          "graph) render as amber warning chips. Shows an explanatory tip when no Buses exist.",
      },
    },
    // addon-designs reference — replace URL with production Figma/Stitch export
    design: {
      type: "image",
      url: "https://placeholder.design/bus-inspector-spec.png",
    },
  },
  tags: ["autodocs", "gate-ab"],
} satisfies Meta<typeof BusInspector>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── shared fixtures ────────────────────────────────────────────────────────────

function makeBlock(
  id: string,
  name: string,
  category: BlockData["category"],
): BlockData {
  return {
    id,
    name,
    category,
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 0,
    latencyMs: 0,
    bypassed: false,
    muted: false,
    muteInput: false,
    error: false,
    isMacroTagged: false,
    isPortal: false,
  };
}

const SYNTH  = makeBlock("synth-1",  "Synth Lead",  "instrument");
const REVERB = makeBlock("reverb-1", "Hall Reverb", "audiofx");
const DELAY  = makeBlock("delay-1",  "Tape Delay",  "audiofx");
const CHOIR  = makeBlock("choir-1",  "Choir Layer", "instrument");

const makeEdge = (
  id: string,
  source: string,
  target: string,
  signalType: CableData["signalType"],
): CableData => ({
  id,
  source,
  sourcePort: "out-L",
  target,
  targetPort: "in-L",
  signalType,
  channelCount: 2,
  isSidechain: false,
});

function seedStores(
  nodes: BlockData[],
  edges: CableData[],
  cableBus: Record<string, string>,
) {
  useGraphStore.setState({
    nodes,
    edges,
    selectedNodeId: null,
    selectedEdgeId: null,
    commentBoxes: [],
  });
  useBusStore.setState({ cableBus });
}

// ── Stories ────────────────────────────────────────────────────────────────────

/**
 * Empty state — no buses yet. The panel explains the feature to new users.
 */
export const Empty: Story = {
  decorators: [
    (Story) => {
      seedStores([], [], {});
      return (
        <div style={{ width: 320 }} className="bg-canvas p-4">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    design: {
      type: "image",
      url: "https://placeholder.design/bus-inspector-empty.png",
    },
    docs: {
      description: {
        story:
          "No wireless Buses yet — the panel teaches the feature, prompting the user to " +
          "right-click a Cable and choose Make Wireless. The common first-run state.",
      },
    },
  },
};

/**
 * Single audio bus — minimal populated row. Asserts drag target, sender +
 * receiver highlight chips, and labelled Senders/Receivers sections.
 */
export const SingleBus: Story = {
  decorators: [
    (Story) => {
      const edges = [makeEdge("c1", "synth-1", "reverb-1", "audio")];
      seedStores([SYNTH, REVERB], edges, { c1: "FX Send A" });
      return (
        <div style={{ width: 320 }} className="bg-canvas p-4">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    design: {
      type: "image",
      url: "https://placeholder.design/bus-inspector-single.png",
    },
    docs: {
      description: {
        story:
          "One audio Bus (FX Send A) carrying a single Cable — shows the blue swatch, " +
          "cable count, labelled Senders and Receivers sections, and the drag-drop zone.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    // ── 1. Drag target must be present ──────────────────────────────────────
    const dropZone = canvasElement.querySelector(
      '[data-drag-target="bus-drop"]',
    );
    if (!dropZone)
      throw new Error('AC fail: missing [data-drag-target="bus-drop"]');

    // ── 2. Sender chip present (.bus-sender-highlight) ───────────────────────
    const senderChip = canvasElement.querySelector(".bus-sender-highlight");
    if (!senderChip)
      throw new Error("AC fail: missing .bus-sender-highlight chip");

    // ── 3. Receiver chip present (.bus-receiver-highlight) ───────────────────
    const receiverChip = canvasElement.querySelector(".bus-receiver-highlight");
    if (!receiverChip)
      throw new Error("AC fail: missing .bus-receiver-highlight chip");

    // ── 4. "Senders" label rendered (larger labelled text) ───────────────────
    const allText = canvasElement.textContent ?? "";
    if (!allText.includes("Senders"))
      throw new Error('AC fail: "Senders" section label not rendered');

    // ── 5. "Receivers" label rendered ────────────────────────────────────────
    if (!allText.includes("Receivers"))
      throw new Error('AC fail: "Receivers" section label not rendered');

    // ── 6. Bus name visible ───────────────────────────────────────────────────
    if (!allText.includes("FX Send A"))
      throw new Error('AC fail: bus name "FX Send A" not found in DOM');
  },
};

/**
 * Multiple buses — audio + MIDI, showing distinct signal-type colours
 * and per-bus sender/receiver chips across all rows.
 */
export const MultipleBuses: Story = {
  decorators: [
    (Story) => {
      const edges = [
        makeEdge("c1", "synth-1", "reverb-1", "audio"),
        makeEdge("c2", "choir-1", "delay-1",  "audio"),
        makeEdge("c3", "synth-1", "reverb-1", "midi"),
      ];
      seedStores(
        [SYNTH, REVERB, DELAY, CHOIR],
        edges,
        { c1: "FX Send A", c2: "Verb Return", c3: "MIDI Clock" },
      );
      return (
        <div style={{ width: 320 }} className="bg-canvas p-4">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    design: {
      type: "image",
      url: "https://placeholder.design/bus-inspector-multi.png",
    },
    docs: {
      description: {
        story:
          "Several Buses mixing audio and MIDI signal types — demonstrates per-signal " +
          "colour coding (blue audio, teal MIDI) and multiple drag-drop zones.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    // Multiple drag targets — one per bus row
    const dropZones = canvasElement.querySelectorAll(
      '[data-drag-target="bus-drop"]',
    );
    if (dropZones.length < 1)
      throw new Error("AC fail: no [data-drag-target='bus-drop'] found");

    // At least one sender chip and one receiver chip across all rows
    const senderChips = canvasElement.querySelectorAll(".bus-sender-highlight");
    if (senderChips.length < 1)
      throw new Error("AC fail: no .bus-sender-highlight chips found");

    const receiverChips = canvasElement.querySelectorAll(
      ".bus-receiver-highlight",
    );
    if (receiverChips.length < 1)
      throw new Error("AC fail: no .bus-receiver-highlight chips found");

    // All three bus names present
    const allText = canvasElement.textContent ?? "";
    if (!allText.includes("FX Send A"))
      throw new Error('AC fail: "FX Send A" not found');
    if (!allText.includes("Verb Return"))
      throw new Error('AC fail: "Verb Return" not found');
    if (!allText.includes("MIDI Clock"))
      throw new Error('AC fail: "MIDI Clock" not found');

    // Senders/Receivers labels present
    if (!allText.includes("Senders"))
      throw new Error('AC fail: "Senders" label not found');
    if (!allText.includes("Receivers"))
      throw new Error('AC fail: "Receivers" label not found');
  },
};

/**
 * Orphan endpoint — the source block has been removed from the graph.
 * Degrades gracefully: amber warning chip with "?" instead of crashing.
 */
export const OrphanEndpoint: Story = {
  decorators: [
    (Story) => {
      const edges = [makeEdge("c1", "ghost-id", "reverb-1", "audio")];
      seedStores([REVERB], edges, { c1: "Ghost Bus" });
      return (
        <div style={{ width: 320 }} className="bg-canvas p-4">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    design: {
      type: "image",
      url: "https://placeholder.design/bus-inspector-orphan.png",
    },
    docs: {
      description: {
        story:
          "Edge case: a Bus endpoint references a Block that no longer exists — the row " +
          "degrades gracefully with an amber warning chip showing \"?\" rather than crashing " +
          "or showing nothing.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    // Orphan chip present
    const orphanChip = canvasElement.querySelector(".bus-orphan-endpoint");
    if (!orphanChip)
      throw new Error("AC fail: missing .bus-orphan-endpoint amber chip");

    // Drag target still rendered even for orphan rows
    const dropZone = canvasElement.querySelector(
      '[data-drag-target="bus-drop"]',
    );
    if (!dropZone)
      throw new Error('AC fail: missing [data-drag-target="bus-drop"] on orphan row');

    // Receiver chip still present for the surviving target block
    const receiverChip = canvasElement.querySelector(".bus-receiver-highlight");
    if (!receiverChip)
      throw new Error("AC fail: missing .bus-receiver-highlight for surviving target");

    // Bus name visible
    const allText = canvasElement.textContent ?? "";
    if (!allText.includes("Ghost Bus"))
      throw new Error('AC fail: "Ghost Bus" not found in DOM');
  },
};
