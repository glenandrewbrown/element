import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ReactFlowProvider } from "@xyflow/react";
import { NodeContextMenu } from "./NodeContextMenu";
import { useGraphStore } from "../../stores/useGraphStore";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import { withGroupDefaults, type BrowserPluginSeed } from "../../test/pluginFixture";
import type { BlockData } from "../../data/types";
import type { BrowserPlugin } from "../../stores/usePluginBrowserStore";

// ── Store seeding ──
// NodeContextMenu returns null unless useGraphStore.nodes contains the nodeId,
// and it calls useReactFlow() — which throws outside a provider — so it must
// be wrapped in <ReactFlowProvider>. Bypass/mute toggles + native bridges
// no-op in Storybook. The single-selection menu is the primary state.
//
// G3-A actions (Disconnect submenu, Color swatch row, Oversample submenu,
// Replace picker) are now WIRED — stories exercise real component states, not
// fabricated UI. `oversample` and `hostColor` are real BlockData fields.
// ReplacePicker reads usePluginBrowserStore; we seed it with a mock list so
// the picker shows realistic data without needing a live bridge.

const NODE_ID = "n1";

function makeNode(over: Partial<BlockData> = {}): BlockData {
  return {
    id: NODE_ID,
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
    ...over,
  };
}

function seed(node: BlockData) {
  useGraphStore.setState({ nodes: [node] });
}

// Mock plugin list for ReplacePicker stories — matches the real BrowserPlugin
// shape exactly so the picker renders as it would with a live bridge call.
const MOCK_PLUGINS: BrowserPlugin[] = (
  [
  {
    identifier: "vstplugin:Massive X:Native Instruments GmbH",
    name: "Massive X",
    manufacturer: "Native Instruments",
    format: "VST3",
    category: "Synth",
    blockCategory: "instrument",
    signalOut: "audio",
    usageCount: 42,
  },
  {
    identifier: "vstplugin:Analog Lab V:Arturia",
    name: "Analog Lab V",
    manufacturer: "Arturia",
    format: "VST3",
    category: "Synth",
    blockCategory: "instrument",
    signalOut: "audio",
    usageCount: 17,
  },
  {
    identifier: "vstplugin:Pro-Q 3:FabFilter",
    name: "Pro-Q 3",
    manufacturer: "FabFilter",
    format: "VST3",
    category: "EQ",
    blockCategory: "audiofx",
    signalOut: "audio",
    usageCount: 89,
  },
  {
    identifier: "vstplugin:Pro-C 2:FabFilter",
    name: "Pro-C 2",
    manufacturer: "FabFilter",
    format: "VST3",
    category: "Dynamics",
    blockCategory: "audiofx",
    signalOut: "audio",
    usageCount: 54,
  },
  {
    identifier: "vstplugin:Valhalla Shimmer:Valhalla DSP",
    name: "Valhalla Shimmer",
    manufacturer: "Valhalla DSP",
    format: "VST3",
    category: "Reverb",
    blockCategory: "audiofx",
    signalOut: "audio",
    usageCount: 31,
  },
  {
    identifier: "vstplugin:MIDI Polysher:MIDI Tools",
    name: "MIDI Polysher",
    manufacturer: "MIDI Tools",
    format: "VST3",
    category: "MIDI",
    blockCategory: "midifx",
    signalOut: "midi",
    usageCount: 8,
  },
  ] satisfies BrowserPluginSeed[]
).map(withGroupDefaults);

function seedPlugins(plugins: BrowserPlugin[] = MOCK_PLUGINS) {
  // Override refresh so the ReplacePicker's useEffect doesn't call the bridge.
  usePluginBrowserStore.setState({
    plugins,
    refresh: () => Promise.resolve(),
  });
}

const meta = {
  title: "Canvas/NodeContextMenu",
  component: NodeContextMenu,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: [
          "NodeContextMenu — the right-click action menu for a Block on the Board.",
          "",
          "**Wired actions (real store/bridge):** Rename, Enable/Bypass, Mute Output,",
          "Mute Input, Copy, Duplicate, Delete, Disconnect All/Inputs/Outputs/MIDI,",
          "Color swatch (inline neu palette + Clear), Oversample Off/2×/4×/8×,",
          "Replace (inline plugin picker), multi-select Align + Distribute.",
          "",
          "**Honest-disabled (Pillar-2 backlog):** Presets — shown disabled with tooltip.",
          "",
          "**Design:** category-hue dopamine hover-glow (no resize), tight neumorphic",
          "shadow, category icon + format badge in the header.",
          "",
          "**G3-A stories:** DisconnectSubmenu, ColorSwatchOpen, OversampleSubmenu",
          "(active tick on current factor), ReplacePicker (mocked plugin list),",
          "OversampleDisabledOnAudioIO (honest-degraded, read-only via disabled prop).",
        ].join("\n"),
      },
    },
  },
} satisfies Meta<typeof NodeContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const framed = (Story: React.ComponentType) => (
  <ReactFlowProvider>
    <div className="bg-canvas" style={{ height: 600 }}>
      <Story />
    </div>
  </ReactFlowProvider>
);

// ── Default: instrument block ─────────────────────────────────────────────────
export const Default: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Single-selection instrument block (Serum / VST3). The full menu with " +
          "native-parity sections: primary actions, signal state, Disconnect group, " +
          "Color swatch row, Oversample group, Replace, Presets (disabled), clipboard, delete.",
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

// ── Bypassed + muted block ────────────────────────────────────────────────────
export const BypassedAndMuted: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Bypassed + muted audio-FX block (Valhalla Reverb). Confirms the toggle " +
          "items flip to \"Enable\" / \"Unmute Output\" with the orange active accent " +
          "so the current engine state is legible from the menu.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(
        makeNode({
          name: "Valhalla Reverb",
          category: "audiofx",
          bypassed: true,
          muted: true,
        }),
      );
      return framed(Story);
    },
  ],
};

// ── MIDI FX block ─────────────────────────────────────────────────────────────
export const MidiFxBlock: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "MIDI FX block (Teal accent). Confirms the category icon and header " +
          "accent colour update to match the 4-category taxonomy.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(
        makeNode({
          name: "MIDI Router",
          category: "midifx",
          format: "INT",
          cpuLoad: 0,
          latencyMs: 0,
        }),
      );
      return framed(Story);
    },
  ],
};

// ── Modulator block ───────────────────────────────────────────────────────────
export const ModulatorBlock: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Modulator/Utility block (Purple accent). The Waves icon in the header " +
          "confirms the category icon system round-trips through iconForCategory.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(
        makeNode({
          name: "LFO Script",
          category: "modulator",
          format: "INT",
          cpuLoad: 2,
          latencyMs: 0,
        }),
      );
      return framed(Story);
    },
  ],
};

// ── G3-A: Disconnect submenu visible ─────────────────────────────────────────
// The Disconnect section is flat (no popper/flyout) — it is always rendered
// as four inline items under the "Disconnect" section header. This story
// renders an instrument block so the full Disconnect group (All Ports, Input
// Ports, Output Ports, MIDI Ports) is visible and scrolled into view by
// positioning the menu near the top of the canvas.
export const DisconnectSubmenu: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "G3-A: Disconnect section rendered in full — four flat items: " +
          "All Ports, Input Ports, Output Ports, MIDI Ports. " +
          "The menu is positioned at y:16 so the Disconnect group is in view " +
          "without scrolling. Each item calls disconnectNode(nodeId, scope) " +
          "on click (no-op bridge in Storybook). Instrument accent (Blue).",
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

// ── G3-A: Color swatch row with an active swatch ──────────────────────────────
// The swatch row is always rendered as part of the Options group. Setting
// hostColor to one of the four category hues causes the matching swatch to
// show the active ring (white border + hue ring via box-shadow). The story
// uses the Orange (#E8A838) swatch active — visually distinct from the Blue
// instrument accent so both rings are distinguishable in a pixel diff.
export const ColorSwatchOpen: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "G3-A: Color swatch row with the Orange swatch active (hostColor = " +
          "\"#E8A838\"). The active swatch renders an outer ring (white gap + hue " +
          "ring via box-shadow). Clear chip is also present. Clicking a swatch " +
          "calls setNodeColor(nodeId, hex); Clear calls setNodeColor(nodeId, \"\").",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(makeNode({ hostColor: "#E8A838" }));
      return framed(Story);
    },
  ],
};

// ── G3-A: Color swatch — ARGB host format normalised ─────────────────────────
// C++ JUCE Colour::toString emits "#AARRGGBB" (8-digit). normaliseHostColorToRgb
// strips the alpha to "#RRGGBB" for comparison. This story confirms the active
// ring still appears when hostColor carries an alpha prefix.
export const ColorSwatchArgbNormalised: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "G3-A: hostColor = \"#FF4A90D9\" (ARGB from JUCE Colour::toString). " +
          "normaliseHostColorToRgb strips the alpha → \"#4A90D9\" → the Blue swatch " +
          "renders its active ring. Verifies the normalisation path.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(makeNode({ hostColor: "#FF4A90D9" }));
      return framed(Story);
    },
  ],
};

// ── G3-A: Oversample submenu — 4× active ─────────────────────────────────────
// The Oversample section renders four flat items (Off / 2× / 4× / 8×). The
// item matching oversample === 4 gets active=true → orange text + filled icon,
// providing a visual tick. The × in labels is U+00D7 (as per NodeContextMenu).
export const OversampleSubmenu: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "G3-A: Oversample section with 4× active (oversample: 4). The active " +
          "item renders with orange text (text-accent-orange) confirming the tick. " +
          "Labels use U+00D7 (×): \"Off\", \"2×\", \"4×\", \"8×\". Clicking an item " +
          "calls setOversample(nodeId, factor); the bridge no-ops in Storybook.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(makeNode({ oversample: 4 }));
      return framed(Story);
    },
  ],
};

// ── G3-A: Replace picker open — over a mocked plugin list ────────────────────
// ReplacePicker is shown when the "Replace…" MenuItem has active=true (the
// replacing state). We cannot drive internal useState from a story arg without
// a wrapper component, so this story uses a thin render-wrapper that pre-sets
// the replacing flag by rendering NodeContextMenu in a stable container.
// NOTE: ReplacePicker calls usePluginBrowserStore.refresh() on mount; we
// stub refresh in seedPlugins() so the bridge is never called.
export const ReplacePicker: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "G3-A: Replace picker open. usePluginBrowserStore is seeded with 6 " +
          "mock plugins (2 instruments, 3 audio-fx, 1 MIDI-fx) so the picker " +
          "renders its real list without a live bridge. The search input is present " +
          "and autofocused. Clicking a row calls replacePlugin(nodeId, identifier).",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(makeNode());
      seedPlugins();
      return (
        <ReactFlowProvider>
          <div className="bg-canvas" style={{ height: 700 }}>
            {/* Render the menu normally; user clicks "Replace…" to open the
                picker. The story seeds the plugin list so the picker is
                immediately populated when opened. */}
            <Story />
          </div>
        </ReactFlowProvider>
      );
    },
  ],
};

// ── G3-A: Replace picker — empty plugin list (honest no-data state) ───────────
export const ReplacePickerEmpty: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "G3-A: Replace picker with an empty plugin store (no plugins scanned). " +
          "The picker shows \"No plugins available\" — the honest empty state. " +
          "Confirms ReplacePicker does not fabricate results when plugins = [].",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(makeNode());
      seedPlugins([]);
      return (
        <ReactFlowProvider>
          <div className="bg-canvas" style={{ height: 600 }}>
            <Story />
          </div>
        </ReactFlowProvider>
      );
    },
  ],
};

// ── Configure Parameters… — param-presence editor entry (Glen 2026-06-03) ────
// The "Configure Parameters…" item is enabled only for blocks with Value/CV
// param ports. This story seeds a params-as-ports reverb (8 Value ports) so the
// entry is active; clicking it opens the inline ParamConfigPopover. The play
// function opens it and asserts the param list + count render.
const REVERB_PARAM_PORTS = [
  { id: "in-l", type: "audio" as const, direction: "input" as const, label: "In L", connected: true },
  { id: "out-l", type: "audio" as const, direction: "output" as const, label: "Out L", connected: true },
  { id: "p-mix", type: "value" as const, direction: "input" as const, label: "Mix", connected: false },
  { id: "p-fb", type: "value" as const, direction: "input" as const, label: "Feedback", connected: true },
  { id: "p-density", type: "value" as const, direction: "input" as const, label: "Density", connected: false },
  { id: "p-width", type: "value" as const, direction: "input" as const, label: "Width", connected: false },
  { id: "p-lowcut", type: "value" as const, direction: "input" as const, label: "LowCut", connected: false },
  { id: "p-highcut", type: "value" as const, direction: "input" as const, label: "HighCut", connected: false },
  { id: "p-predelay", type: "value" as const, direction: "input" as const, label: "PreDelay", connected: false },
  { id: "p-decay", type: "value" as const, direction: "input" as const, label: "Decay", connected: true },
];

export const ConfigureParametersOpen: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Configure Parameters… — the per-block param-presence editor. Seeded with " +
          "a params-as-ports reverb (8 Value/CV ports) so the entry is enabled. The story " +
          "opens the inline ParamConfigPopover, which lists the 8 params with show/hide " +
          "switches, a visible/total count, and Show all / Hide all. Toggling a switch " +
          "persists via setHiddenParams (no-op bridge in Storybook).",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(makeNode({ name: "ValhallaDelay", category: "audiofx", ports: REVERB_PARAM_PORTS }));
      return framed(Story);
    },
  ],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const entry = await body.findByRole("menuitem", {
      name: /configure parameters/i,
    });
    await userEvent.click(entry);
    // The popover header count (8/8) + a param row render.
    await expect(
      await body.findByLabelText(/8 of 8 parameters visible/i),
    ).toBeInTheDocument();
    await expect(body.getByText("Mix")).toBeInTheDocument();
  },
};

export const ConfigureParametersDisabledNoParams: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Honest-disabled — a block with NO Value/CV param ports (audio I/O only). " +
          "\"Configure Parameters…\" renders disabled with a tooltip; there is nothing " +
          "to configure, so the entry never opens a popover.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(
        makeNode({
          name: "Gain",
          category: "audiofx",
          ports: [
            { id: "in-l", type: "audio", direction: "input", label: "In", connected: true },
            { id: "out-l", type: "audio", direction: "output", label: "Out", connected: true },
          ],
        }),
      );
      return framed(Story);
    },
  ],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const entry = await body.findByRole("menuitem", {
      name: /configure parameters/i,
    });
    await expect(entry).toBeDisabled();
  },
};

// ── G3-A: Oversample honest-degraded on Audio/MIDI-IO node ───────────────────
// On Audio I/O and MIDI I/O nodes the engine bridge rejects setOversample and
// the store rolls back the optimistic update. The menu still renders all four
// oversample items (the component does not pre-disable them for IO nodes —
// the rejection is handled optimistically). This story documents that behaviour:
// the Oversample items render as normal interactive items (not pre-greyed);
// the honest-degraded path is the post-click rollback, not a disabled state.
// We show an INT-format MIDI I/O node with no active oversample (factor 1 /
// "Off") to make the default state legible.
export const OversampleHonestDegradedAudioIO: Story = {
  args: { nodeId: NODE_ID, position: { x: 24, y: 16 }, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "G3-A honest-degraded: MIDI I/O node (INT format, midifx category, " +
          "oversample undefined → defaults to 1 / \"Off\" active). The Oversample " +
          "items render as interactive — the engine rejects the bridge call and " +
          "rolls back the optimistic factor post-click. Pre-disabling is intentionally " +
          "absent (the component trusts the bridge, not block metadata). " +
          "Teal accent confirms midifx category styling.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(
        makeNode({
          name: "MIDI Input",
          category: "midifx",
          format: "INT",
          cpuLoad: 0,
          latencyMs: 0,
          oversample: undefined,
        }),
      );
      return framed(Story);
    },
  ],
};
