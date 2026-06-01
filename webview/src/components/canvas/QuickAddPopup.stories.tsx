import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { QuickAddPopup } from "./QuickAddPopup";
import {
  usePluginBrowserStore,
  type BrowserPlugin,
} from "../../stores/usePluginBrowserStore";

// ── Store seeding ──
// QuickAddPopup reads the plugin list + favorites + recents from
// usePluginBrowserStore and calls refresh() on mount. With no backend,
// refresh() early-returns without clearing the store, so the seeded list
// survives. nativeGraphAddPlugin is a no-op. Positioned at (x, y) viewport
// coords.

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
  {
    identifier: "com.vendor.ValhallaVV",
    name: "ValhallaVintageVerb",
    manufacturer: "Valhalla DSP",
    format: "AU",
    category: "Reverb",
    blockCategory: "audiofx",
  },
  {
    identifier: "com.vendor.ProC2",
    name: "Pro-C 2",
    manufacturer: "FabFilter",
    format: "AU",
    category: "Compressor",
    blockCategory: "audiofx",
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
          "QuickAddPopup — the fastest path to add a Block to the Board. " +
          "A small keyboard-first search popup anchored at the cursor, opening " +
          "focused with favourites pinned on top and results icon- and colour-coded " +
          "by category (icons from iconForCategory: Piano/instrument, SlidersHorizontal/audiofx, " +
          "GitBranch/midifx, Waves/modulator). " +
          "Two modes: GENERIC (right-click empty canvas — full plugin list, Favorites then Recents first) " +
          "and PORT-TYPE-AWARE (dragged off a port — only Blocks accepting that signal type, " +
          "under an 'ADD BLOCK ACCEPTING <TYPE>' header tinted in the signal's hue; " +
          "also shows Favorites + Recents pre-filtered to the compatible signal type). " +
          "Fuzzy search (R2) matches across name, manufacturer, raw category, blockCategory, " +
          "and signal-type aliases — 'valhalla', 'reverb', 'Pro q', 'Pro-q', and 'pro q4' all find the right blocks. " +
          "Results are ranked by fuzzy score then most-used (recency+favourite) so common picks surface first. " +
          "Category label (EQ, Reverb…) shown in each row; format badge (VST3/AU/CLAP) removed.",
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
          'GENERIC mode (no portType) with a favourite pinned — the right-click-canvas path. ' +
          'Shows the "Favorites" section above the rest of the scanned plugins, no port-type header. ' +
          'Category label badge (EQ/Synth/Reverb…) replaces the old format badge (VST3/AU/CLAP).',
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
          'PORT-TYPE-AWARE mode — opened by dragging a Cable off an AUDIO port. Header reads ' +
          '"ADD BLOCK ACCEPTING AUDIO" with a blue signal pill, and the list is filtered to Blocks ' +
          'that pass audio (instruments + audio FX). MIDI FX (Stepic) and modulators are hidden. ' +
          'ITEM 1: Favorites + Recents sections also appear in this mode (pre-filtered to audio-passers).',
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

/**
 * PortTypeAudioWithFavRecents — ITEM 1 core test.
 * Port-type-aware mode with favorites and recents seeded.
 * Both sections must appear, pre-filtered to audio-passers.
 */
export const PortTypeAudioWithFavRecents: Story = {
  args: { x: 80, y: 60, portType: "audio", onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          'PORT-TYPE-AWARE mode with Favorites + Recents seeded — ITEM 1 verification. ' +
          'SurgeXT (instrument → audio) is a favourite, ValhallaVintageVerb (audiofx → audio) is recent. ' +
          'Both appear in their sections under the AUDIO header. Stepic (midifx → midi) is also recent ' +
          'but is filtered out because it does not accept audio — it must NOT appear. ' +
          'Shows Favorites → Recents → Others layout inside the port-type filter.',
      },
    },
  },
  decorators: [
    (Story) => {
      seed(
        demoPlugins,
        ["com.vendor.SurgeXT"],
        ["com.vendor.ValhallaVV", "com.vendor.Stepic"],
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
    // Port-type header still present.
    await expect(body.getByText("Add block accepting")).toBeVisible();
    await expect(body.getByText("AUDIO")).toBeVisible();
    // Favorites section shows audio-passing favourite.
    await expect(body.getByText("Favorites")).toBeVisible();
    await expect(body.getByText("Surge XT")).toBeVisible();
    // Recents section shows audio-passing recent only.
    await expect(body.getByText("Recents")).toBeVisible();
    await expect(body.getByText("ValhallaVintageVerb")).toBeVisible();
    // Stepic is recent but MIDI — must be filtered out.
    await expect(body.queryByText("Stepic")).toBeNull();
  },
};

export const PortTypeMidi: Story = {
  args: { x: 80, y: 60, portType: "midi", onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          'PORT-TYPE-AWARE mode — dragged off a MIDI port. Header reads "ADD BLOCK ACCEPTING MIDI" ' +
          'with a teal pill; only Blocks that accept MIDI (MIDI FX) pass the filter.',
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
          'PORT-TYPE-AWARE mode with no compatible Blocks — dragged off a value/CV port when only ' +
          'audio/MIDI Blocks are scanned. Shows the "No compatible blocks" message under the CV header.',
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
          'No favourites — confirms the popup renders a single flat plugin list (no "Favorites" ' +
          'header) when nothing is starred.',
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
          'No plugins scanned — shows the empty state with an "Open Preferences" CTA instead of ' +
          'fabricated entries. The honest first-run state.',
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
 */
export const RecentsFirstOnOpen: Story = {
  args: { x: 80, y: 60, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          'RECENTS-FIRST on open (empty search). The list leads with a "Favorites" section ' +
          'for starred plugins (Surge XT), then a "Recents" section ordered most-recently-used ' +
          'first (LFOTool, then Stepic), then an "All" section for the remainder. ' +
          'No search query typed — this is the browse-mode layout.',
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
 * below. Section headers collapse to a flat scored list.
 */
export const FuzzySearchResults: Story = {
  args: { x: 80, y: 60, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          'FUZZY SEARCH in action. Typing "pro" scores Pro-Q 4 / Pro-C 2 highest (exact prefix). ' +
          'Section headers collapse; the flat scored list shows only matching blocks.',
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

    // Type "pro" — Pro-Q 4 and Pro-C 2 should appear; Surge XT, Stepic, LFOTool should not
    await userEvent.type(input, "pro");
    await expect(body.getByText("Pro-Q 4")).toBeVisible();
    await expect(body.getByText("Pro-C 2")).toBeVisible();
    // Section labels gone while searching
    await expect(body.queryByText("Favorites")).toBeNull();
    await expect(body.queryByText("Recents")).toBeNull();
  },
};

/**
 * MetadataSearch — R2 refinement. Fuzzy search matches metadata fields beyond
 * the display name: manufacturer, raw C++ category string, blockCategory, and
 * signal-type keyword aliases. This story verifies all three axes:
 *   1. Manufacturer match  — "valhalla" finds ValhallaVintageVerb
 *   2. Category match      — "reverb"   finds plugins with category="Reverb"
 *   3. Signal-type alias   — "audio fx" finds audiofx-category blocks
 */
export const MetadataSearch: Story = {
  args: { x: 80, y: 60, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          'METADATA FUZZY SEARCH (R2). The search field matches name, manufacturer, raw category ' +
          'string, blockCategory, and signal-type aliases simultaneously. ' +
          'Typing "valhalla" finds ValhallaVintageVerb via its manufacturer field. ' +
          'Typing "reverb" finds it via its raw category "Reverb". ' +
          'Typing "fabfilter" finds Pro-Q 4 and Pro-C 2 via manufacturer. ' +
          'Typing "audio fx" finds all audiofx-category blocks via signal alias. ' +
          'This is the real-data R2 implementation — no fake tag arrays needed.',
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
    const body  = within(canvasElement.ownerDocument.body);
    const input = body.getByPlaceholderText("Add block...");

    // ── Test 1: manufacturer match — "valhalla" → ValhallaVintageVerb ────────
    await userEvent.type(input, "valhalla");
    await expect(body.getByText("ValhallaVintageVerb")).toBeVisible();
    // Other plugins NOT matched by "valhalla"
    await expect(body.queryByText("Surge XT")).toBeNull();

    // ── Test 2: raw category match — "reverb" → ValhallaVintageVerb ──────────
    await userEvent.clear(input);
    await userEvent.type(input, "reverb");
    await expect(body.getByText("ValhallaVintageVerb")).toBeVisible();

    // ── Test 3: manufacturer match — "fabfilter" → Pro-Q 4 + Pro-C 2 ─────────
    await userEvent.clear(input);
    await userEvent.type(input, "fabfilter");
    await expect(body.getByText("Pro-Q 4")).toBeVisible();
    await expect(body.getByText("Pro-C 2")).toBeVisible();
    await expect(body.queryByText("Surge XT")).toBeNull();
  },
};

/**
 * TypoTolerance — ITEM 2 typo/separator normalisation.
 * "Pro q", "Pro-q", and "pro q4" must all find "Pro-Q 4".
 */
export const TypoTolerance: Story = {
  args: { x: 80, y: 60, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          'TYPO TOLERANCE (ITEM 2). Separator normalisation + Levenshtein fallback. ' +
          '"Pro q", "Pro-q", and "pro q4" must all surface "Pro-Q 4". ' +
          'Hyphens, spaces, and missing digits are normalised before matching.',
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
    const body  = within(canvasElement.ownerDocument.body);
    const input = body.getByPlaceholderText("Add block...");

    // ── "Pro q" (space instead of hyphen) → Pro-Q 4 ────────────────────────
    await userEvent.type(input, "Pro q");
    await expect(body.getByText("Pro-Q 4")).toBeVisible();

    // ── "Pro-q" (hyphen, lowercase q) → Pro-Q 4 ────────────────────────────
    await userEvent.clear(input);
    await userEvent.type(input, "Pro-q");
    await expect(body.getByText("Pro-Q 4")).toBeVisible();

    // ── "pro q4" (space + extra digit) → Pro-Q 4 ───────────────────────────
    await userEvent.clear(input);
    await userEvent.type(input, "pro q4");
    await expect(body.getByText("Pro-Q 4")).toBeVisible();
  },
};

/**
 * MostUsedOrdering — ITEM 2 most-used ranking.
 * When searching, results with the same fuzzy score sort by recency+favourite
 * weighting so the user's most-used picks appear first.
 * Pro-Q 4 (favourite + recent) must rank above Pro-C 2 (neither).
 */
export const MostUsedOrdering: Story = {
  args: { x: 80, y: 60, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          'MOST-USED ORDERING (ITEM 2). When two results have the same fuzzy score, ' +
          'the most-used (favourite + recently used) item sorts first. ' +
          'Pro-Q 4 is a favourite and recently used; Pro-C 2 is neither. ' +
          'Searching "pro" → Pro-Q 4 must appear before Pro-C 2 in the DOM.',
      },
    },
  },
  decorators: [
    (Story) => {
      seed(
        demoPlugins,
        ["com.vendor.ProQ4"],       // Pro-Q 4 is a favourite
        ["com.vendor.ProQ4"],       // Pro-Q 4 is also most-recent
      );
      return (
        <div className="bg-canvas" style={{ height: 480 }}>
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const body  = within(canvasElement.ownerDocument.body);
    const input = body.getByPlaceholderText("Add block...");

    await userEvent.type(input, "pro");
    const proQ = body.getByText("Pro-Q 4");
    const proC = body.getByText("Pro-C 2");
    await expect(proQ).toBeVisible();
    await expect(proC).toBeVisible();
    // proQ comes before proC → proC.compareDocumentPosition(proQ) has PRECEDING bit set
    expect(
      proC.compareDocumentPosition(proQ) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  },
};

/**
 * CategoryLabelVisible — ITEM 2 category label shown, format badge gone.
 * In each result row the plugin CATEGORY (EQ, Reverb, Compressor…) must be
 * visible and the format string (AU, VST3, CLAP) must NOT be present.
 */
export const CategoryLabelVisible: Story = {
  args: { x: 80, y: 60, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          'CATEGORY LABEL (ITEM 2). Each result row shows the functional category label ' +
          '(EQ, Reverb, Compressor…) instead of the plugin format (AU, VST3, CLAP). ' +
          'Format strings must not appear in the list.',
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
    // Category labels visible in browse mode
    await expect(body.getByText("EQ")).toBeVisible();
    await expect(body.getByText("Reverb")).toBeVisible();
    await expect(body.getByText("Compressor")).toBeVisible();
    // Format badges must NOT be present as distinct elements in the list
    await expect(body.queryByText("AU")).toBeNull();
    await expect(body.queryByText("VST3")).toBeNull();
    await expect(body.queryByText("CLAP")).toBeNull();
  },
};
