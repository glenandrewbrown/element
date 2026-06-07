import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { QuickAddPopup } from "./QuickAddPopup";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";

// Base demo shape (the fields a story author cares about). The N2 alias-aware
// group fields (aliases / variants / isFavorite / recentRank) are derived by
// `seed()` from the favorites/recents args, so each story stays a single source
// of truth for what's starred/recent.
type DemoPluginBase = Omit<
  import("../../stores/usePluginBrowserStore").BrowserPlugin,
  "description" | "aliases" | "variants" | "isFavorite" | "recentRank"
>;

// ── Store seeding ──
// QuickAddPopup reads the plugin list + favorites + recents from
// usePluginBrowserStore and calls refresh() on mount. With no backend,
// refresh() early-returns without clearing the store, so the seeded list
// survives. nativeGraphAddPlugin is a no-op. Positioned at (x, y) viewport
// coords.

// signalOut + usageCount are REAL fields now sent by C++ (G3c items 2+3).
// Demo values: Surge XT is the most-used instrument; Stepic emits MIDI;
// LFOTool emits value/CV — exercising the real per-plugin signal filter.
const demoPlugins: DemoPluginBase[] = [
  {
    identifier: "com.vendor.SurgeXT",
    name: "Surge XT",
    manufacturer: "Surge Synth Team",
    format: "VST3",
    category: "Synth",
    blockCategory: "instrument",
    signalOut: "audio",
    usageCount: 12,
  },
  {
    identifier: "com.vendor.ProQ4",
    name: "Pro-Q 4",
    manufacturer: "FabFilter",
    format: "AU",
    category: "EQ",
    blockCategory: "audiofx",
    signalOut: "audio",
    usageCount: 5,
  },
  {
    identifier: "com.vendor.Stepic",
    name: "Stepic",
    manufacturer: "Audiomodern",
    format: "CLAP",
    category: "MIDI",
    blockCategory: "midifx",
    signalOut: "midi",
    usageCount: 3,
  },
  {
    identifier: "com.vendor.LFOTool",
    name: "LFOTool",
    manufacturer: "Xfer",
    format: "VST3",
    category: "Modulator",
    blockCategory: "modulator",
    signalOut: "value",
    usageCount: 2,
  },
  {
    identifier: "com.vendor.ValhallaVV",
    name: "ValhallaVintageVerb",
    manufacturer: "Valhalla DSP",
    format: "AU",
    category: "Reverb",
    blockCategory: "audiofx",
    signalOut: "audio",
    usageCount: 1,
  },
  {
    identifier: "com.vendor.ProC2",
    name: "Pro-C 2",
    manufacturer: "FabFilter",
    format: "AU",
    category: "Compressor",
    blockCategory: "audiofx",
    signalOut: "audio",
    usageCount: 0,
  },
];

function seed(
  plugins: DemoPluginBase[],
  favorites: string[] = [],
  recents: string[] = [],
) {
  // Derive the N2 group fields from the favorites/recents intent so QuickAdd's
  // group-level browse stack matches what the story declares.
  const favSet = new Set(favorites);
  const full = plugins.map((p) => ({
    ...p,
    description: "",
    aliases: [p.identifier],
    variants: [{ format: p.format, identifier: p.identifier }],
    isFavorite: favSet.has(p.identifier),
    recentRank: recents.indexOf(p.identifier),
  }));
  usePluginBrowserStore.setState({
    plugins: full,
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
          "under an 'ADD BLOCK ACCEPTING `TYPE`' header tinted in the signal's hue; " +
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
    // Removable port-context pill present + tinted AUDIO label (Unreal model).
    await expect(body.getByLabelText("Clear AUDIO filter")).toBeVisible();
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
 * PortTypeAddAndConnect — T3 ⌥(Alt)+drop add-and-connect mode.
 * Same port-typed AUDIO filter as PortTypeAudio, but an `onPick` override is
 * supplied: selecting a Block routes to a positioned add + auto-connect instead
 * of the default plain insert, and the override (not the popup) owns dismissal.
 * The play test proves picking calls the override with the chosen plugin id and
 * does NOT auto-close.
 */
export const PortTypeAddAndConnect: Story = {
  args: {
    x: 80,
    y: 60,
    portType: "audio",
    onClose: fn(),
    onPick: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          "T3 — opened by an ⌥(Alt)+drop of a Cable on empty canvas. Port-typed " +
          "to the dragged port's signal (AUDIO here); the chosen Block is added " +
          "AT the drop point and atomically auto-connected via the `onPick` " +
          "override (positioned add+connect), bypassing the default plain insert.",
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
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("AUDIO")).toBeVisible();
    const row = body.getByText("Surge XT").closest("button")!;
    row.click();
    // The override fires with the picked id; the popup does NOT auto-close.
    await expect(args.onPick).toHaveBeenCalledWith("com.vendor.SurgeXT");
    await expect(args.onClose).not.toHaveBeenCalled();
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
    // Removable port-context pill still present.
    await expect(body.getByLabelText("Clear AUDIO filter")).toBeVisible();
    await expect(body.getByText("AUDIO")).toBeVisible();
    // Favorites section shows audio-passing favourite. (getAllByText: "Favorites"
    // appears both as a rail item and the results section label.)
    await expect(body.getAllByText("Favorites").length).toBeGreaterThan(0);
    await expect(body.getByText("Surge XT")).toBeVisible();
    // Recents section shows audio-passing recent only.
    await expect(body.getAllByText("Recents").length).toBeGreaterThan(0);
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
    // Favorites section present (label appears in BOTH the rail and the results
    // section, so there are ≥2 matches in browse mode).
    await expect(body.getAllByText("Favorites").length).toBeGreaterThan(1);
    await expect(body.getByText("Surge XT")).toBeVisible();
    // Recents section present, ordered most-recent-first
    await expect(body.getAllByText("Recents").length).toBeGreaterThan(1);
    await expect(body.getByText("LFOTool")).toBeVisible();
    await expect(body.getByText("Stepic")).toBeVisible();
    // Non-recent, non-favorite plugin still appears (in the rest section)
    await expect(body.getByText("Pro-Q 4")).toBeVisible();
    // No port-type pill in generic mode
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
    const input = body.getByPlaceholderText("Search blocks, makers, categories…");

    // Type "pro" — Pro-Q 4 and Pro-C 2 should appear; Surge XT, Stepic, LFOTool should not
    await userEvent.type(input, "pro");
    await expect(body.getByText("Pro-Q 4")).toBeVisible();
    await expect(body.getByText("Pro-C 2")).toBeVisible();
    // Result SECTION labels collapse to a flat scored list while searching — so
    // "Favorites"/"Recents" now appear ONLY in the rail (exactly 1 each), never
    // as a results section header.
    await expect(body.getAllByText("Favorites")).toHaveLength(1);
    await expect(body.getAllByText("Recents")).toHaveLength(1);
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
    const input = body.getByPlaceholderText("Search blocks, makers, categories…");

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
    const input = body.getByPlaceholderText("Search blocks, makers, categories…");

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
    const input = body.getByPlaceholderText("Search blocks, makers, categories…");

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

/**
 * SignalOutOverridesCategory — G3c item 2 core test.
 * Port-type filtering keys off the REAL per-plugin signalOut, not the inferred
 * blockCategory. A plugin tagged blockCategory:"modulator" (which historically
 * forced CV) but with signalOut:"audio" MUST appear under an AUDIO port; a
 * MIDI-fx plugin whose real signalOut is "audio" likewise passes the audio
 * filter. This proves the audio-vs-CV split now comes from real engine data.
 */
export const SignalOutOverridesCategory: Story = {
  args: { x: 80, y: 60, portType: "audio", onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "G3c item 2 — port filtering uses real signalOut, not category. " +
          'A "modulator"-category block whose real signalOut is "audio" appears under ' +
          "an AUDIO port (category alone would have hidden it as CV). A modulator whose " +
          'real signalOut stays "value" is correctly filtered out.',
      },
    },
  },
  decorators: [
    (Story) => {
      // Two modulator-category blocks with DIFFERENT real signal outputs.
      const audioModulator: DemoPluginBase = {
        identifier: "com.vendor.ShaperBox",
        name: "ShaperBox",
        manufacturer: "Cableguys",
        format: "VST3",
        category: "Modulator",
        blockCategory: "modulator", // category → would be CV under old logic
        signalOut: "audio", // real signal → audio (it processes audio)
        usageCount: 0,
      };
      const cvModulator: DemoPluginBase = {
        identifier: "com.vendor.LFOTool",
        name: "LFOTool",
        manufacturer: "Xfer",
        format: "VST3",
        category: "Modulator",
        blockCategory: "modulator",
        signalOut: "value", // real signal → value/CV
        usageCount: 0,
      };
      seed([audioModulator, cvModulator]);
      return (
        <div className="bg-canvas" style={{ height: 480 }}>
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("AUDIO")).toBeVisible();
    // Real signalOut:"audio" modulator passes the audio filter (category=modulator).
    await expect(body.getByText("ShaperBox")).toBeVisible();
    // Real signalOut:"value" modulator is filtered out under the audio port.
    await expect(body.queryByText("LFOTool")).toBeNull();
  },
};

/**
 * UsageCountRanking — G3c item 3 core test.
 * When two results tie on fuzzy score, the one with the higher REAL usageCount
 * sorts first. ProHigh (usageCount 20) must appear before ProLow (usageCount 0)
 * even though neither is a favourite or recent.
 */
export const UsageCountRanking: Story = {
  args: { x: 80, y: 60, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "G3c item 3 — real usageCount drives most-used ranking. Two plugins with the same " +
          'fuzzy score ("pro" prefix) but different real usage counts: the higher-count one ' +
          "sorts first. No favourite/recent involved — pure frequency ordering from engine data.",
      },
    },
  },
  decorators: [
    (Story) => {
      const proHigh: DemoPluginBase = {
        identifier: "com.vendor.ProHigh",
        name: "Pro-High",
        manufacturer: "Acme",
        format: "AU",
        category: "EQ",
        blockCategory: "audiofx",
        signalOut: "audio",
        usageCount: 20,
      };
      const proLow: DemoPluginBase = {
        identifier: "com.vendor.ProLow",
        name: "Pro-Low",
        manufacturer: "Acme",
        format: "AU",
        category: "EQ",
        blockCategory: "audiofx",
        signalOut: "audio",
        usageCount: 0,
      };
      // No favourites, no recents — only usageCount differs.
      seed([proLow, proHigh]);
      return (
        <div className="bg-canvas" style={{ height: 480 }}>
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = body.getByPlaceholderText("Search blocks, makers, categories…");
    await userEvent.type(input, "pro");
    const high = body.getByText("Pro-High");
    const low = body.getByText("Pro-Low");
    await expect(high).toBeVisible();
    await expect(low).toBeVisible();
    // Pro-High (usageCount 20) must precede Pro-Low (usageCount 0).
    expect(
      low.compareDocumentPosition(high) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  },
};

/**
 * SourcesRailVisible — N3 rebuild: the left filter rail is always present
 * (★Favorites · ◷Recents · the 4 category shape-glyphs · All), single-level and
 * keyboard-selectable — NOT a hover-cascade. The bigger ~520×460 panel removes
 * the old over-truncation.
 */
export const SourcesRailVisible: Story = {
  args: { x: 60, y: 40, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "N3 layout — the persistent sources/filter rail on the left (research " +
          "DECISION). Rows: ★Favorites, ◷Recents, the 4 Element categories with " +
          "their colour-blind-safe shape glyphs, and All. Click or keyboard-select " +
          "(Tab/← into the rail, ↑↓ to pick, 1–7 hotkeys) to scope the results. " +
          "No hover fly-outs.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(demoPlugins, ["com.vendor.SurgeXT"], ["com.vendor.ProQ4"]);
      return (
        <div className="bg-canvas" style={{ height: 480 }}>
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // Rail items present (Favorites/Recents also appear as section labels, so
    // ≥1 each; the category labels are rail-only).
    await expect(body.getAllByText("Favorites").length).toBeGreaterThan(0);
    await expect(body.getByText("Instruments")).toBeVisible();
    await expect(body.getByText("Audio FX")).toBeVisible();
    await expect(body.getByText("MIDI FX")).toBeVisible();
    await expect(body.getByText("Modulators")).toBeVisible();
    // Keyboard hint footer present.
    await expect(body.getByText("navigate")).toBeVisible();
    await expect(body.getByText("filter rail")).toBeVisible();
  },
};

/**
 * RailCategoryFilter — clicking a category rail row scopes the results to that
 * block category (drill-able visible hierarchy, no cascading menus).
 */
export const RailCategoryFilter: Story = {
  args: { x: 60, y: 40, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Selecting the 'Audio FX' rail filter narrows the results to audio-effect " +
          "blocks (Pro-Q 4, ValhallaVintageVerb, Pro-C 2). Instruments (Surge XT), " +
          "MIDI FX (Stepic) and modulators (LFOTool) drop out. Click-driven; the rail " +
          "is a filter, not a tree.",
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
    // Click the "Audio FX" rail filter.
    await userEvent.click(body.getByText("Audio FX"));
    // Audio-FX blocks remain…
    await expect(body.getByText("Pro-Q 4")).toBeVisible();
    await expect(body.getByText("ValhallaVintageVerb")).toBeVisible();
    await expect(body.getByText("Pro-C 2")).toBeVisible();
    // …non-audiofx categories drop out.
    await expect(body.queryByText("Surge XT")).toBeNull(); // instrument
    await expect(body.queryByText("Stepic")).toBeNull(); // midifx
    await expect(body.queryByText("LFOTool")).toBeNull(); // modulator
  },
};

/**
 * PortPillDismiss — the port-context pill is removable (Unreal model). Clicking
 * the ✕ (or "Show all blocks") widens the audio-typed list to the full set.
 */
export const PortPillDismiss: Story = {
  args: { x: 60, y: 40, portType: "audio", onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Opened port-typed to AUDIO (a removable accent pill shows the active " +
          "filter — Unreal's 'context-sensitive' chip). Clicking the pill's ✕ clears " +
          "the signal-type constraint and reveals every block, including the MIDI FX " +
          "and modulators that the audio filter had hidden.",
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
    // Audio-typed: MIDI fx + modulator hidden.
    await expect(body.queryByText("Stepic")).toBeNull();
    await expect(body.queryByText("LFOTool")).toBeNull();
    // Dismiss the port pill via its ✕.
    await userEvent.click(body.getByLabelText("Clear AUDIO filter"));
    // Now ALL blocks show (the filter widened).
    await expect(body.getByText("Stepic")).toBeVisible();
    await expect(body.getByText("LFOTool")).toBeVisible();
    // Pill is gone.
    await expect(body.queryByLabelText("Clear AUDIO filter")).toBeNull();
  },
};
