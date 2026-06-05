import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ParamConfigPopover } from "./ParamConfigPopover";
import { useGraphStore } from "../../stores/useGraphStore";
import type { BlockData, Port } from "../../data/types";

// ── Store seeding ──
// ParamConfigPopover reads the node (and its hiddenParams) from useGraphStore
// and writes back via setHiddenParams (the native bridge no-ops in Storybook,
// so the optimistic store update is what we observe). We seed a params-as-ports
// reverb so the param list is realistic. The popover is normally rendered inline
// inside the NodeContextMenu Options group, but it is self-contained, so these
// stories mount it directly on a panel-tinted card to judge the surface design.

const NODE_ID = "n1";

// A realistic Valhalla-style reverb: 2 audio I/O + 8 Value/CV param ports
// (the plugin's REAL param names — nothing fabricated).
const PARAM_PORTS: Port[] = [
  { id: "in-l", type: "audio", direction: "input", label: "In L", connected: true },
  { id: "out-l", type: "audio", direction: "output", label: "Out L", connected: true },
  { id: "p-mix", type: "value", direction: "input", label: "Mix", connected: false },
  { id: "p-fb", type: "value", direction: "input", label: "Feedback", connected: true },
  { id: "p-density", type: "value", direction: "input", label: "Density", connected: false },
  { id: "p-width", type: "value", direction: "input", label: "Width", connected: false },
  { id: "p-lowcut", type: "value", direction: "input", label: "LowCut", connected: false },
  { id: "p-highcut", type: "value", direction: "input", label: "HighCut", connected: false },
  { id: "p-predelay", type: "value", direction: "input", label: "PreDelay", connected: false },
  { id: "p-decay", type: "value", direction: "input", label: "Decay", connected: true },
];

function makeNode(over: Partial<BlockData> = {}): BlockData {
  return {
    id: NODE_ID,
    name: "ValhallaDelay",
    category: "audiofx",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: PARAM_PORTS,
    cpuLoad: 12,
    latencyMs: 2,
    bypassed: false,
    error: false,
    isMacroTagged: false,
    hiddenParams: [],
    ...over,
  };
}

function seed(node: BlockData) {
  useGraphStore.setState({ nodes: [node] });
}

// A params-light block (only 3 param ports) to exercise the no-filter layout.
const FEW_PARAM_PORTS: Port[] = [
  { id: "in-l", type: "audio", direction: "input", label: "In", connected: true },
  { id: "out-l", type: "audio", direction: "output", label: "Out", connected: true },
  { id: "p-gain", type: "value", direction: "input", label: "Gain", connected: false },
  { id: "p-freq", type: "value", direction: "input", label: "Freq", connected: false },
  { id: "p-q", type: "value", direction: "input", label: "Q", connected: false },
];

const meta = {
  title: "Canvas/ParamConfigPopover",
  component: ParamConfigPopover,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: [
          "ParamConfigPopover — per-block parameter-presence editor (Glen 2026-06-03).",
          "",
          "Opened from the NodeContextMenu \"Configure Parameters…\" entry, it lists the",
          "Block's Value/CV param ports with a per-param show/hide neumorphic switch, a",
          "visible/total count, and Show all / Hide all. A text filter appears once the",
          "list is long (>8 params). Each toggle optimistically updates the store's",
          "`hiddenParams` AND persists it via `nativeGraphSetNodeHiddenParams` (the host",
          "stores the CSV on the Node ValueTree, so the choice survives project save/load).",
          "",
          "Hidden params drop off the Block entirely — Block.tsx filters them out of the",
          "param-port group and the \"▸ N params\" count. NOTHING fabricated: the set is",
          "engine-persisted and reconciled on the next snapshot.",
          "",
          "Visual language: the locked neumorphic \"one chassis\" — pressed inner well for",
          "the scroll list, recessed bulk chips, no transparency/glass.",
        ].join("\n"),
      },
    },
  },
} satisfies Meta<typeof ParamConfigPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

// The popover normally lives inside the w-56 NodeContextMenu; frame it on a
// matching panel-tinted card so the surface design reads as it would in-menu.
const framed = (Story: React.ComponentType) => (
  <div
    className="w-56 bg-panel border border-white/10 rounded-lg overflow-hidden py-1"
    style={{
      boxShadow:
        "-4px -4px 8px rgba(255,255,255,0.04), 8px 8px 24px rgba(0,0,0,0.5)",
    }}
  >
    <Story />
  </div>
);

// ── Default: all params visible ──────────────────────────────────────────────
export const Default: Story = {
  args: { nodeId: NODE_ID, accent: "#E8A838" },
  parameters: {
    docs: {
      description: {
        story:
          "Default — 8 params, all visible (hiddenParams = []). The count reads 8/8; " +
          "every switch is ON. A filter appears (>8 threshold not crossed at exactly 8, " +
          "so this 8-param block shows none — see ManyParamsFiltered for the filtered case).",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(makeNode());
      return framed(Story);
    },
  ],
};

// ── Two params hidden (the persisted state) ──────────────────────────────────
export const TwoHidden: Story = {
  args: { nodeId: NODE_ID, accent: "#E8A838" },
  parameters: {
    docs: {
      description: {
        story:
          "Two params hidden (hiddenParams = [\"p-density\", \"p-width\"]). The count reads " +
          "6/8; the Density + Width rows dim and their switches are OFF. This is the " +
          "persisted state that hydrates from the engine snapshot — the Block would show " +
          "\"▸ 6 params\" (the two hidden ports filtered off).",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(makeNode({ hiddenParams: ["p-density", "p-width"] }));
      return framed(Story);
    },
  ],
};

// ── Few params (no filter) ───────────────────────────────────────────────────
export const FewParams: Story = {
  args: { nodeId: NODE_ID, accent: "#E8A838" },
  parameters: {
    docs: {
      description: {
        story:
          "A 3-param EQ block — below the filter threshold, so no search field. " +
          "Confirms the compact layout for the common low-param case.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(makeNode({ name: "Pro-Q 4", ports: FEW_PARAM_PORTS }));
      return framed(Story);
    },
  ],
};

// ── Interaction: the param switches + bulk actions are wired and clickable ────
// NOTE: in Storybook the native bridge (nativeGraphSetNodeHiddenParams) no-ops
// and returns undefined, so the store action's optimistic update is immediately
// rolled back (no `true` host confirmation) — the popover therefore reflects the
// SEEDED hiddenParams, not the post-click state. The store round-trip
// (optimistic apply + rollback) is proven in the unit suite
// (useGraphStore.test.ts + useGraphStore.gaps.test.ts); here we assert the
// component renders the controls and they're interactive, which is the visual
// contract Storybook governs.
export const SwitchInteraction: Story = {
  args: { nodeId: NODE_ID, accent: "#E8A838" },
  parameters: {
    docs: {
      description: {
        story:
          "Interaction — the per-param switches reflect the seeded hidden set and are " +
          "clickable. Feedback starts shown (switch ON); Density (seeded hidden) starts " +
          "OFF. The header count reads the visible/total. (Persistence is bridge-driven; " +
          "the store round-trip is covered by the unit suite — the no-op Storybook bridge " +
          "rolls the optimistic update back, so this asserts the rendered controls.)",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(makeNode({ hiddenParams: ["p-density"] }));
      return framed(Story);
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Seeded with one hidden → header reads 7/8.
    await expect(
      await canvas.findByLabelText(/7 of 8 parameters visible/i),
    ).toBeInTheDocument();
    // Feedback is shown (switch ON); Density is hidden (switch OFF).
    const feedbackRow = canvas.getByText("Feedback").closest("div")!;
    const feedbackToggle = within(feedbackRow).getByRole("switch");
    await expect(feedbackToggle).toHaveAttribute("aria-checked", "true");
    const densityRow = canvas.getByText("Density").closest("div")!;
    const densityToggle = within(densityRow).getByRole("switch");
    await expect(densityToggle).toHaveAttribute("aria-checked", "false");
    // The switch is interactive (clickable) — exercises the onChange path.
    await userEvent.click(feedbackToggle);
    // Bulk chips are present and enabled (Show all enabled since one is hidden).
    const showAll = await canvas.findByRole("button", { name: /show all/i });
    await expect(showAll).toBeEnabled();
    await expect(
      await canvas.findByRole("button", { name: /hide all/i }),
    ).toBeEnabled();
  },
};

// ── Filter: long param list surfaces a search field ──────────────────────────
export const ManyParamsFiltered: Story = {
  args: { nodeId: NODE_ID, accent: "#E8A838" },
  parameters: {
    docs: {
      description: {
        story:
          "A 9+ param block crosses the filter threshold (>8), surfacing a search field. " +
          "Typing narrows the list to matching param names. Confirms a params-as-ports " +
          "plugin with many CV inputs stays navigable.",
      },
    },
  },
  decorators: [
    (Story) => {
      // 10 value ports (+2 audio) → above the >8 filter threshold.
      const manyPorts: Port[] = [
        { id: "in-l", type: "audio", direction: "input", label: "In", connected: true },
        { id: "out-l", type: "audio", direction: "output", label: "Out", connected: true },
        ...Array.from({ length: 10 }).map((_, i) => ({
          id: `p-${i}`,
          type: "value" as const,
          direction: "input" as const,
          label: i === 3 ? "Resonance" : `Param ${i}`,
          connected: false,
        })),
      ];
      seed(makeNode({ name: "MegaSynth", category: "instrument", ports: manyPorts }));
      return framed(Story);
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The filter field is present (>8 params).
    const filter = await canvas.findByPlaceholderText(/filter parameters/i);
    await expect(filter).toBeInTheDocument();
    // Narrow to "Resonance".
    await userEvent.type(filter, "reson");
    await expect(await canvas.findByText("Resonance")).toBeInTheDocument();
    await expect(canvas.queryByText("Param 0")).toBeNull();
  },
};
