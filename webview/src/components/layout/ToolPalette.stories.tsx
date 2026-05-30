import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import { ToolPalette } from "./ToolPalette";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { tpPlugins } from "../../data/fixtures/toolpalette";

// ── Fixture-backed seed helpers ──────────────────────────────────────────────
// All stories use the F6 toolpalette fixture (tpPlugins). The mount-time
// refreshPlugins() is replaced with a no-op so the seeded list survives.

const demoMolecules = [
  { name: "Sidechain Comp", description: "Classic sidechain compression chain" },
  { name: "Reverb Send",    description: "Stereo reverb send with pre-delay"   },
  { name: "Mid/Side",       description: "M/S encoder + processor + decoder"   },
];

function seedPopulated() {
  usePluginBrowserStore.setState({
    plugins: tpPlugins,
    favoriteIdentifiers: new Set(["tp-inst-vital", "tp-audiofx-proq4"]),
    recentIdentifiers: ["tp-audiofx-valhalla", "tp-inst-kontakt"],
    refresh: async () => {},
  });
  useSessionStore.setState({
    filePath: "/Users/glen/Music/Demo.els",
    dirty: false,
    recentFiles: ["/Users/glen/Music/Demo.els", "/Users/glen/Music/LiveSet.els"],
    graphs: [
      { id: "g1", name: "Main Board", index: 0, active: true  },
      { id: "g2", name: "FX Chain",   index: 1, active: false },
    ],
  });
  useHostExtrasStore.setState((s) => ({
    ...s,
    molecules: demoMolecules,
    activeGraphOutline: [],
  }));
}

function seedEmpty() {
  usePluginBrowserStore.setState({
    plugins: [],
    favoriteIdentifiers: new Set(),
    recentIdentifiers: [],
    refresh: async () => {},
  });
  useSessionStore.setState({
    filePath: "",
    dirty: false,
    recentFiles: [],
    graphs: [],
  });
  useHostExtrasStore.setState((s) => ({
    ...s,
    molecules: [],
    activeGraphOutline: [],
  }));
}

// ── Wrapper helper ────────────────────────────────────────────────────────────

function PaletteFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: 280, height: 640 }} className="bg-panel">
      {children}
    </div>
  );
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta = {
  title: "Layout/ToolPalette",
  component: ToolPalette,
  parameters: {
    layout: "fullscreen",
    // addon-designs: reference the locked design system doc per G-17 spec.
    design: {
      type: "url",
      url: "https://github.com/kushview/element/blob/main/docs/stitch-reference/DESIGN.md",
    },
    docs: {
      description: {
        component:
          "Edit-mode left browser for fast Block addition. Three tabs: Plugins (4-category filter + favourites + recents), Molecules (prebuilt Block+Cable snippets), Projects (boards + session files). Search filters the active tab. Reads usePluginBrowserStore, useSessionStore, useHostExtrasStore.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ToolPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Populated ─────────────────────────────────────────────────────────────────
// Primary: scanned plugins, favourites, recents, molecules, boards.

export const Populated: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Fully-stocked browser: 10 scanned plugins (all 4 categories), 2 favourites, 2 recents, 3 molecules, 2 boards. The primary add-a-Block workflow for an expert in flow state.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedPopulated();
      return (
        <PaletteFrame>
          <Story />
        </PaletteFrame>
      );
    },
  ],
  play: async ({ canvas }) => {
    // 1. Search input is present
    const searchInput = canvas.getByPlaceholderText(/search plugins/i);
    expect(searchInput).toBeTruthy();

    // 2. Category filter controls are present with labelled buttons
    const instFilter = canvas.getByRole("button", {
      name: /filter by virtual instrument/i,
    });
    const fxFilter = canvas.getByRole("button", {
      name: /filter by audio effect/i,
    });
    expect(instFilter).toBeTruthy();
    expect(fxFilter).toBeTruthy();

    // 3. NO element exists with text containing "cpu" (case-insensitive)
    expect(canvas.queryByText(/cpu/i)).toBeNull();

    // 4. Results filter by type: click Instrument chip → only instruments remain
    //    in the "All Plugins" section. "Pro-C 2" (audiofx, not a favourite/recent)
    //    should disappear; "Surge XT" (instrument) should remain.
    await userEvent.click(instFilter);
    expect(canvas.queryByText("Pro-C 2")).toBeNull();
    expect(canvas.getByText("Surge XT")).toBeTruthy();

    // Reset filter
    await userEvent.click(instFilter);
  },
};

// ── Empty ─────────────────────────────────────────────────────────────────────
// First-run: nothing scanned yet → EmptyState + "Open Preferences" CTA.

export const Empty: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "First-run state with nothing scanned: shows the EmptyState illustration and the Open Preferences call-to-action.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedEmpty();
      return (
        <PaletteFrame>
          <Story />
        </PaletteFrame>
      );
    },
  ],
  play: async ({ canvas }) => {
    // Search input still present even when empty
    expect(canvas.getByPlaceholderText(/search plugins/i)).toBeTruthy();
    // Category filters are present
    expect(
      canvas.getByRole("button", { name: /filter by virtual instrument/i }),
    ).toBeTruthy();
    // No CPU element
    expect(canvas.queryByText(/cpu/i)).toBeNull();
    // EmptyState CTA button visible (use role to avoid matching the description paragraph)
    expect(canvas.getByRole("button", { name: /open preferences/i })).toBeTruthy();
  },
};

// ── Plugins, no extras ────────────────────────────────────────────────────────
// Plugins scanned but no favourites, recents, or molecules — bare list + filters.

export const PluginsNoExtras: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Plugins scanned but no favourites, recents, or molecules: the bare 10-plugin list with category filters — the state right after a first scan.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedEmpty();
      usePluginBrowserStore.setState({
        plugins: tpPlugins,
        favoriteIdentifiers: new Set(),
        recentIdentifiers: [],
        refresh: async () => {},
      });
      return (
        <PaletteFrame>
          <Story />
        </PaletteFrame>
      );
    },
  ],
  play: async ({ canvas }) => {
    // Both instruments AND audiofx plugins are initially visible
    expect(canvas.getByText("Vital")).toBeTruthy();       // instrument
    expect(canvas.getByText("Pro-C 2")).toBeTruthy();     // audiofx

    // Click Audio Effect filter → instruments disappear from the list
    const fxFilter = canvas.getByRole("button", {
      name: /filter by audio effect/i,
    });
    await userEvent.click(fxFilter);
    expect(canvas.getByText("Pro-C 2")).toBeTruthy();     // still visible (audiofx)
    expect(canvas.queryByText("Vital")).toBeNull();        // instrument filtered out

    // Section heading updates to category label
    expect(canvas.getByText("Audio Effect")).toBeTruthy();

    // No CPU element anywhere
    expect(canvas.queryByText(/cpu/i)).toBeNull();

    // Reset filter
    await userEvent.click(fxFilter);
  },
};
