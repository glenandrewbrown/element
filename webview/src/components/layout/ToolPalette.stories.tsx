import type { Meta, StoryObj } from "@storybook/react-vite";
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
    identifier: "el.MidiMonitor",
    name: "MIDI Monitor",
    manufacturer: "Element",
    format: "INT",
    category: "Utility",
    blockCategory: "midifx" as const,
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
    favoriteIdentifiers: new Set(["com.fabfilter.pro-q3.vst3", "com.arturia.minimoog-v.au"]),
    recentIdentifiers: ["com.soundtoys.echoboy.au", "com.native.kontakt7.vst3"],
    refresh: async () => {},
  });
  useSessionStore.setState({
    filePath: "/Users/glen/Music/Demo.els",
    dirty: false,
    recentFiles: [
      "/Users/glen/Music/Demo.els",
      "/Users/glen/Music/LiveSet.els",
    ],
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

const meta = {
  title: "Layout/ToolPalette",
  component: ToolPalette,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Edit-mode left browser for adding Blocks: tabs between a Plugins view (favourites, recents, molecules, category-filtered AU/VST3/CLAP/LV2 list) and a Projects view (host-scanned session files), with a Board outline, .elg import/export, recent sessions, and a live CPU meter. Reads usePluginBrowserStore, useSessionStore, useHostExtrasStore, and usePerformStore; the mount refreshPlugins() is overridden with a no-op so seeded plugins survive.",
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
          "The fully-stocked browser an expert user works from: scanned plugins, favourites, recents, molecules, a Board outline, and moderate CPU — the primary add-a-Block workflow.",
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
          "Plugins scanned but no favourites, recents, or molecules yet: the bare plugin list + category filters, the state right after a first scan.",
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
