import type { Meta, StoryObj } from "@storybook/react-vite";
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
    blockCategory: "generator",
  },
  {
    identifier: "com.vendor.ProQ4",
    name: "Pro-Q 4",
    manufacturer: "FabFilter",
    format: "AU",
    category: "EQ",
    blockCategory: "modifier",
  },
  {
    identifier: "com.vendor.Stepic",
    name: "Stepic",
    manufacturer: "Audiomodern",
    format: "CLAP",
    category: "MIDI",
    blockCategory: "logic",
  },
];

function seed(plugins: BrowserPlugin[], favorites: string[] = []) {
  usePluginBrowserStore.setState({
    plugins,
    favoriteIdentifiers: new Set(favorites),
    recentIdentifiers: [],
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
          "QuickAddPopup — the right-click-at-cursor Block inserter. A small keyboard-first search popup anchored at the click point, opening focused with favourites pinned on top and results shape/colour-coded by category (● instrument / ◆ effect / ▲ MIDI). Mount it transiently from GraphCanvas at the cursor; it reads the scanned plugin list from usePluginBrowserStore (seeded here) and shows an empty state when nothing is scanned.",
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
          "Open with a favourite pinned — shows the \"Favorites\" section above the rest of the scanned plugins. The primary in-use state.",
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
};

export const NoFavorites: Story = {
  args: { x: 80, y: 60, onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "No favourites — confirms the popup renders a single flat plugin list (no \"Favorites\" header) when nothing is starred.",
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
          "No plugins scanned — shows the empty state with an \"Open Preferences\" CTA instead of fabricated entries. The honest first-run state.",
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
