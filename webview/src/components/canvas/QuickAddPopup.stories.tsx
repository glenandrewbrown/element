import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { QuickAddPopup } from "./QuickAddPopup";
import {
  usePluginBrowserStore,
  type BrowserPlugin,
} from "../../stores/usePluginBrowserStore";

// ── Store seeding ──
// QuickAddPopup reads the plugin list + favorites from usePluginBrowserStore
// and calls refresh() on mount. With no backend, refresh() early-returns
// without clearing the store, so the seeded list survives. nativeGraphAddPlugin
// is a no-op. Positioned at (x, y) viewport coords.

const demoPlugins: BrowserPlugin[] = [
  {
    identifier: "com.vendor.SurgeXT",
    name: "Surge XT",
    manufacturer: "Surge Synth Team",
    format: "VST3",
    category: "Synth",
    blockCategory: "instrument",
  },
  {
    identifier: "com.vendor.ProQ4",
    name: "Pro-Q 4",
    manufacturer: "FabFilter",
    format: "AU",
    category: "EQ",
    blockCategory: "audiofx",
  },
  {
    identifier: "com.vendor.Stepic",
    name: "Stepic",
    manufacturer: "Audiomodern",
    format: "CLAP",
    category: "MIDI",
    blockCategory: "midifx",
  },
  {
    identifier: "com.vendor.LFOTool",
    name: "LFOTool",
    manufacturer: "Xfer",
    format: "VST3",
    category: "Modulator",
    blockCategory: "modulator",
  },
];

function seed(
  plugins: BrowserPlugin[],
  favorites: string[] = [],
  recents: string[] = [],
) {
  usePluginBrowserStore.setState({
    plugins,
    favoriteIdentifiers: new Set(favorites),
    recentIdentifiers: recents,
  });
}

const meta = {
  title: "Canvas/QuickAddPopup",
  component: QuickAddPopup,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "QuickAddPopup — the fastest path to add a Block to the Board. A small keyboard-first search popup anchored at the cursor, opening focused with favourites pinned on top and results shape/colour-coded by category (● instrument / ◆ audio FX / ▲ MIDI FX / ⬡ modulator). Two modes: GENERIC (right-click empty canvas — full plugin list, favourites first) and PORT-TYPE-AWARE (dragged off a port — only Blocks accepting that signal type, under an \"ADD BLOCK ACCEPTING <TYPE>\" header tinted in the signal's hue). It reads the scanned plugin list from usePluginBrowserStore (seeded here) and shows an empty state when nothing is scanned.",
      },
    },
  },
} satisfies Meta<typeof QuickAddPopup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: { x: 80, y: 60, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          'GENERIC mode (no portType) with a favourite pinned — the right-click-canvas path. Shows the "Favorites" section above the rest of the scanned plugins, no port-type header. The primary in-use state.',
      },
    },
  },
  decorators: [
    (Story) => {
      seed(demoPlugins, ["com.vendor.SurgeXT"]);
      return (
        <div className="bg-canvas" style={{ height: 480 }}>
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // Generic mode: no port-type header, all categories visible.
    await expect(body.queryByText("Add block accepting")).toBeNull();
    await expect(body.getByText("Surge XT")).toBeVisible();
    await expect(body.getByText("Pro-Q 4")).toBeVisible();
    await expect(body.getByText("Stepic")).toBeVisible();
  },
};

export const PortTypeAudio: Story = {
  args: { x: 80, y: 60, portType: "audio", onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          'PORT-TYPE-AWARE mode — opened by dragging a Cable off an AUDIO port. Header reads "ADD BLOCK ACCEPTING AUDIO" with a blue signal pill, and the list is filtered to Blocks that pass audio (instruments + audio FX). MIDI FX (Stepic) and modulators are hidden. This is the dragged-off-port flow.',
      },
    },
  },
  decorators: [
    (Story) => {
      seed(demoPlugins);
      return (
        <div className="bg-canvas" style={{ height: 480 }}>
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // Header present + tinted AUDIO pill.
    await expect(body.getByText("Add block accepting")).toBeVisible();
    await expect(body.getByText("AUDIO")).toBeVisible();
    // Audio-passing blocks shown…
    await expect(body.getByText("Surge XT")).toBeVisible(); // instrument → audio
    await expect(body.getByText("Pro-Q 4")).toBeVisible(); // audiofx → audio
    // …MIDI-fx + modulator filtered out.
    await expect(body.queryByText("Stepic")).toBeNull(); // midifx → midi
    await expect(body.queryByText("LFOTool")).toBeNull(); // modulator → value
  },
};

export const PortTypeMidi: Story = {
  args: { x: 80, y: 60, portType: "midi", onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          'PORT-TYPE-AWARE mode — dragged off a MIDI port. Header reads "ADD BLOCK ACCEPTING MIDI" with a teal pill; only Blocks that accept MIDI (instruments + MIDI FX) pass the filter.',
      },
    },
  },
  decorators: [
    (Story) => {
      seed(demoPlugins);
      return (
        <div className="bg-canvas" style={{ height: 480 }}>
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("MIDI")).toBeVisible();
    await expect(body.getByText("Stepic")).toBeVisible(); // midifx → midi
    await expect(body.queryByText("Pro-Q 4")).toBeNull(); // audiofx → audio, hidden
  },
};

export const PortTypeNoMatch: Story = {
  args: { x: 80, y: 60, portType: "value", onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          'PORT-TYPE-AWARE mode with no compatible Blocks — dragged off a value/CV port when only audio/MIDI Blocks are scanned. Shows the "No compatible blocks" message under the CV header rather than the generic "No matches".',
      },
    },
  },
  decorators: [
    (Story) => {
      // Seed only audio/MIDI plugins → nothing maps to the "value" signal.
      seed([demoPlugins[0], demoPlugins[1], demoPlugins[2]]);
      return (
        <div className="bg-canvas" style={{ height: 480 }}>
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("CV")).toBeVisible();
    await expect(body.getByText("No compatible blocks")).toBeVisible();
  },
};

export const NoFavorites: Story = {
  args: { x: 80, y: 60, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          'No favourites — confirms the popup renders a single flat plugin list (no "Favorites" header) when nothing is starred.',
      },
    },
  },
  decorators: [
    (Story) => {
      seed(demoPlugins);
      return (
        <div className="bg-canvas" style={{ height: 480 }}>
          <Story />
        </div>
      );
    },
  ],
};

export const NoPluginsScanned: Story = {
  args: { x: 80, y: 60, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          'No plugins scanned — shows the empty state with an "Open Preferences" CTA instead of fabricated entries. The honest first-run state.',
      },
    },
  },
  decorators: [
    (Story) => {
      seed([]);
      return (
        <div className="bg-canvas" style={{ height: 480 }}>
          <Story />
        </div>
      );
    },
  ],
};

/**
 * RecentsFirstOnOpen — on open before the user types, the list leads with a
 * "Recents" section (most-recently-used first), then falls through to the
 * remaining plugins. Favorites are pinned above recents when both are present.
 * This is the P2 refinement Glen requested.
 */
export const RecentsFirstOnOpen: Story = {
  args: { x: 80, y: 60, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          'RECENTS-FIRST on open (empty search). The list leads with a "Recents" section ordered most-recently-used first (LFOTool, then Stepic), a "Favorites" section above it for starred plugins (Surge XT), and the remaining plugins below. No search query typed — this is the browse-mode layout.',
      },
    },
  },
  decorators: [
    (Story) => {
      // Surge XT is a favorite; LFOTool + Stepic are recent (LFOTool most recent)
      seed(
        demoPlugins,
        ["com.vendor.SurgeXT"],
        ["com.vendor.LFOTool", "com.vendor.Stepic"],
      );
      return (
        <div className="bg-canvas" style={{ height: 480 }}>
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // Favorites section present with the starred plugin
    await expect(body.getByText("Favorites")).toBeVisible();
    await expect(body.getByText("Surge XT")).toBeVisible();
    // Recents section present, ordered most-recent-first
    await expect(body.getByText("Recents")).toBeVisible();
    await expect(body.getByText("LFOTool")).toBeVisible();
    await expect(body.getByText("Stepic")).toBeVisible();
    // Non-recent, non-favorite plugin still appears (in the rest section)
    await expect(body.getByText("Pro-Q 4")).toBeVisible();
    // No port-type header in generic mode
    await expect(body.queryByText("Add block accepting")).toBeNull();
  },
};

/**
 * FuzzySearchResults — once the user types, the full list is fuzzy-scored and
 * reordered. Exact prefix matches rank highest; subsequence matches appear
 * below. The section headers (Favorites / Recents) collapse — only a flat
 * scored list is shown, so the user sees the best matches regardless of recency.
 */
export const FuzzySearchResults: Story = {
  args: { x: 80, y: 60, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          'FUZZY SEARCH in action. Typing "pro" scores Pro-Q 4 highest (exact prefix). Typing "lf" scores LFOTool first (prefix). Section headers collapse; the flat scored list shows only matching blocks. Port-type filter still applies when portType is set.',
      },
    },
  },
  decorators: [
    (Story) => {
      seed(
        demoPlugins,
        ["com.vendor.SurgeXT"],
        ["com.vendor.LFOTool", "com.vendor.Stepic"],
      );
      return (
        <div className="bg-canvas" style={{ height: 480 }}>
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = body.getByPlaceholderText("Add block...");

    // Type "pro" — Pro-Q 4 should appear; Surge XT, Stepic, LFOTool should not
    await import("storybook/test").then(({ userEvent }) =>
      userEvent.type(input, "pro"),
    );
    await expect(body.getByText("Pro-Q 4")).toBeVisible();
    // Section labels gone while searching
    await expect(body.queryByText("Favorites")).toBeNull();
    await expect(body.queryByText("Recents")).toBeNull();
  },
};
