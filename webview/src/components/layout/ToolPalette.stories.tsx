import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within, waitFor } from "storybook/test";
import { useState } from "react";
import { ToolPalette } from "./ToolPalette";
import { usePluginBrowserStore } from "../../stores/usePluginBrowserStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { usePerformStore } from "../../stores/usePerformStore";

// ── Store seeding ──
// ToolPalette reads from usePluginBrowserStore (plugins, favoriteIdentifiers,
// recentIdentifiers), useSessionStore (recentFiles, graphs), useHostExtrasStore
// (molecules, activeGraphOutline), and usePerformStore (liveHealth.cpu).
//
// Mount effect calls refreshPlugins() which resolves to undefined without a
// JUCE backend; logBridgeError uses console.warn (not console.error), so the
// verify gate is unaffected. We override `refresh` with a no-op to prevent
// the store.plugins seed being clobbered by an async resolve.

const demoPlugins = [
  {
    identifier: "com.fabfilter.pro-q3.vst3",
    name: "FabFilter Pro-Q 3",
    manufacturer: "FabFilter",
    format: "VST3",
    category: "EQ",
    blockCategory: "audiofx" as const,
  },
  {
    identifier: "com.fabfilter.pro-c2.vst3",
    name: "FabFilter Pro-C 2",
    manufacturer: "FabFilter",
    format: "VST3",
    category: "Compressor",
    blockCategory: "audiofx" as const,
  },
  {
    identifier: "com.arturia.minimoog-v.au",
    name: "Mini V3",
    manufacturer: "Arturia",
    format: "AU",
    category: "Instrument",
    blockCategory: "instrument" as const,
  },
  {
    identifier: "com.soundtoys.echoboy.au",
    name: "EchoBoy",
    manufacturer: "SoundToys",
    format: "AU",
    category: "Delay",
    blockCategory: "audiofx" as const,
  },
  {
    identifier: "com.native.kontakt7.vst3",
    name: "Kontakt 7",
    manufacturer: "Native Instruments",
    format: "VST3",
    category: "Instrument",
    blockCategory: "instrument" as const,
  },
  {
    identifier: "com.xfer.serum.clap",
    name: "Serum",
    manufacturer: "Xfer Records",
    format: "CLAP",
    category: "Synth",
    blockCategory: "instrument" as const,
  },
  {
    identifier: "el.MidiMonitor",
    name: "MIDI Monitor",
    manufacturer: "Element",
    format: "INT",
    category: "Utility",
    blockCategory: "midifx" as const,
  },
  {
    identifier: "el.LFO",
    name: "LFO",
    manufacturer: "Element",
    format: "INT",
    category: "Modulator",
    blockCategory: "modulator" as const,
  },
];

const demoMolecules = [
  { name: "Sidechain Comp", description: "Classic sidechain compression chain" },
  { name: "Reverb Send", description: "Stereo reverb send with pre-delay" },
  { name: "Mid/Side", description: "M/S encoder + processor + decoder" },
];

function seedPopulated() {
  usePluginBrowserStore.setState({
    plugins: demoPlugins,
    favoriteIdentifiers: new Set([
      "com.fabfilter.pro-q3.vst3",
      "com.arturia.minimoog-v.au",
    ]),
    recentIdentifiers: ["com.soundtoys.echoboy.au", "com.native.kontakt7.vst3"],
    refresh: async () => {},
  });
  useSessionStore.setState({
    filePath: "/Users/glen/Music/Demo.els",
    dirty: false,
    recentFiles: ["/Users/glen/Music/Demo.els", "/Users/glen/Music/LiveSet.els"],
    graphs: [
      { id: "g1", name: "Main Board", index: 0, active: true },
      { id: "g2", name: "FX Chain", index: 1, active: false },
    ],
  });
  useHostExtrasStore.setState((s) => ({
    ...s,
    molecules: demoMolecules,
    activeGraphOutline: [
      {
        id: "n1",
        name: "Synth Layer",
        isContainer: true,
        children: [{ id: "n1a", name: "Mini V3", isContainer: false }],
      },
    ],
  }));
  usePerformStore.setState((s) => ({
    liveHealth: { ...s.liveHealth, cpu: 18.7 },
  }));
}

// Plugins-only seed (no favourites/recents) so every plugin name appears
// exactly once — lets interaction tests use singular getByRole queries without
// tripping on the duplicate card the Favourites/Recents sections would render.
function seedPluginsOnly() {
  seedEmpty();
  usePluginBrowserStore.setState({
    plugins: demoPlugins,
    favoriteIdentifiers: new Set(),
    recentIdentifiers: [],
    refresh: async () => {},
  });
  usePerformStore.setState((s) => ({
    liveHealth: { ...s.liveHealth, cpu: 8.4 },
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
  usePerformStore.setState((s) => ({
    liveHealth: { ...s.liveHealth, cpu: 0 },
  }));
}

// Wrapper exercising the controlled collapsed-rail prop (matches AppShell usage).
function CollapsibleHost() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div
      style={{ width: collapsed ? 40 : 280, height: 640, transition: "width 150ms" }}
      className="bg-panel"
    >
      <ToolPalette
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />
    </div>
  );
}

const meta = {
  title: "Layout/ToolPalette",
  component: ToolPalette,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Search-first Edit-mode left browser for adding Blocks. A single search field + category quick-filter chips drive a flat, scannable list (grid or list view) of the real host-scanned AU/VST3/CLAP/LV2 plugins — each a raised neumorphic card with a format badge. Tabs between this Plugins view (favourites, recents, molecules, Boards, .elg import/export) and a Projects view (host-scanned session files). Includes a collapsible Plugin-Scan-&-Paths control group, a collapsed rail, recent sessions, and a live CPU meter. The scan/rescan/paths/format controls are intentionally DISABLED (no native bridge exists yet — see ToolPalette.tsx ScanControls note); the working scan path is the 'Open Preferences' CTA. Reads usePluginBrowserStore, useSessionStore, useHostExtrasStore, and usePerformStore; the mount refreshPlugins() is overridden with a no-op so seeded plugins survive.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ToolPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Populated: plugins, favourites, recents, molecules ──
export const Populated: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The fully-stocked browser an expert user works from: scanned plugins as neu cards, favourites, recents, molecules, a Board outline, and moderate CPU — the primary add-a-Block workflow.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedPopulated();
      return (
        <div style={{ width: 280, height: 640 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};

// ── Empty: no plugins scanned yet ──
export const Empty: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "First-run state with nothing scanned: shows the EmptyState illustration and the 'Open Preferences' call-to-action to scan plugins.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedEmpty();
      return (
        <div style={{ width: 280, height: 640 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};

// ── Plugins only, no molecules or recents ──
export const PluginsNoExtras: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Plugins scanned but no favourites, recents, or molecules yet: the bare search-first plugin list + category filter chips, the state right after a first scan.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedEmpty();
      usePluginBrowserStore.setState({
        plugins: demoPlugins,
        favoriteIdentifiers: new Set(),
        recentIdentifiers: [],
        refresh: async () => {},
      });
      usePerformStore.setState((s) => ({
        liveHealth: { ...s.liveHealth, cpu: 5.2 },
      }));
      return (
        <div style={{ width: 280, height: 640 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};

// ── Grid view ──
export const GridView: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Grid view: the flat plugin list rendered as a two-column wall of raised neu cards (category shape + format badge), for fast visual scanning. The play function switches to grid and asserts the cards render.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedPluginsOnly();
      return (
        <div style={{ width: 280, height: 640 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Grid view" }));
    // The grid renders the plugin cards (role=button); assert one survived the
    // view switch.
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: /FabFilter Pro-Q 3/ }),
      ).toBeInTheDocument(),
    );
  },
};

// ── High CPU load ──
export const HighCpu: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Fully populated but with CPU at ~91%: the footer meter fills toward the danger zone, the cue that the Project is near overload while browsing.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedPopulated();
      usePerformStore.setState((s) => ({
        liveHealth: { ...s.liveHealth, cpu: 91.4 },
      }));
      return (
        <div style={{ width: 280, height: 640 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};

// ── Scan / paths / formats control group (the #1 native gap) ──
export const ScanControls: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The Plugin-Scan-&-Paths control group expanded: scan / rescan buttons, format enable toggles (VST3/AU/CLAP/LV2), and a scan-paths row. These are intentionally DISABLED and labelled 'via Preferences' — there is no native scan/rescan/paths/format bridge in the webview host yet (only read-only elementGetPluginList), and Glen's rule is nothing fake. The one working affordance is 'Open Preferences to Scan'. The play function expands the panel and asserts the scan controls are present AND disabled.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedPopulated();
      return (
        <div style={{ width: 280, height: 640 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Expand the collapsible scan section.
    const toggle = canvas.getByRole("button", { name: /Plugin Scan & Paths/ });
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "true"));

    // Scan + Rescan render but are DISABLED (honest, no fake scan).
    const scanBtn = canvas.getByRole("button", { name: "Scan" });
    const rescanBtn = canvas.getByRole("button", { name: "Rescan" });
    await expect(scanBtn).toBeDisabled();
    await expect(rescanBtn).toBeDisabled();

    // Format toggles present and disabled.
    await expect(canvas.getByRole("button", { name: "VST3" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "AU" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "CLAP" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "LV2" })).toBeDisabled();

    // The working escape hatch is enabled.
    await expect(
      canvas.getByRole("button", { name: /Open Preferences to Scan/ }),
    ).toBeEnabled();
  },
};

// ── Search-first behaviour: typing filters the flat list ──
export const SearchFiltering: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Search-first interaction: typing 'fab' narrows the flat list to the two FabFilter plugins and hides the Arturia instrument. Drives the real filter logic over the seeded plugin list.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedPluginsOnly();
      return (
        <div style={{ width: 280, height: 640 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByPlaceholderText("Search plugins…");
    await userEvent.type(search, "fab");
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: /FabFilter Pro-C 2/ }),
      ).toBeInTheDocument(),
    );
    // Both FabFilter plugins match…
    await expect(
      canvas.getByRole("button", { name: /FabFilter Pro-Q 3/ }),
    ).toBeInTheDocument();
    // …non-matching instrument is filtered out.
    await expect(
      canvas.queryByRole("button", { name: /Mini V3/ }),
    ).not.toBeInTheDocument();
  },
};

// ── Category quick-filter chips ──
export const CategoryFilter: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Category quick-filter chips: clicking INST restricts the flat list to instrument-category plugins (Mini V3, Kontakt 7, Serum) and hides audio FX (FabFilter). Asserts the chip's pressed state and the filtered list.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedPluginsOnly();
      return (
        <div style={{ width: 280, height: 640 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The chip's accessible name is its visible text ("INST"), not the title.
    const instChip = canvas.getByRole("button", { name: "INST" });
    await userEvent.click(instChip);
    await waitFor(() => expect(instChip).toHaveAttribute("aria-pressed", "true"));
    // Instruments shown…
    await expect(
      canvas.getByRole("button", { name: /Mini V3/ }),
    ).toBeInTheDocument();
    // …audio FX hidden.
    await expect(
      canvas.queryByRole("button", { name: /FabFilter Pro-Q 3/ }),
    ).not.toBeInTheDocument();
  },
};

// ── Collapsed rail (static initial paint) ──
export const CollapsedRail: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The 40px collapsed rail as its initial paint: a search icon over the four category glyphs (●▲◆⬡), each in its accent colour. Click any to filter-and-expand. Static (no interaction) so the rail is visible at a glance.",
      },
    },
  },
  args: { collapsed: true },
  decorators: [
    (Story) => {
      seedPopulated();
      return (
        <div style={{ width: 40, height: 640 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};

// ── Collapsed rail (interactive collapse/expand) ──
export const Collapsed: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The collapsed 40px rail: a search icon (expands the panel) plus the four category glyphs (●▲◆⬡) for one-click filter-and-expand. The play function expands via the search button and asserts the full browser returns.",
      },
    },
  },
  render: () => <CollapsibleHost />,
  decorators: [
    (Story) => {
      seedPopulated();
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Start expanded → collapse it.
    await userEvent.click(canvas.getByRole("button", { name: "Collapse browser" }));
    const expandBtn = await canvas.findByRole("button", { name: "Expand browser" });
    await expect(expandBtn).toBeInTheDocument();
    // Expand again → search field returns.
    await userEvent.click(expandBtn);
    await waitFor(() =>
      expect(canvas.getByPlaceholderText("Search plugins…")).toBeInTheDocument(),
    );
  },
};
