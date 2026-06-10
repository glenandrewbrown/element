import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, expect, userEvent, within } from "storybook/test";
import { CategoryRail } from "./CategoryRail";

/**
 * CategoryRail — the V2 (Category-Led) 52px nav rail.
 *
 * A persistent left column that drives the browser list pane: All / the four
 * category taxonomy entries (● VI / ▲ MIDI / ◆ FX / ⬡ Mod) / ★ Favourites /
 * ⏱ Recent, plus a Projects entry. The active entry gets a 2px left-edge accent
 * bar in the category hue, mirroring the canvas Block accent language. These
 * stories cover the default, an active category, a favourites-active state, and
 * the empty-facet (disabled Fav/Recent) state, and assert the selection
 * contract.
 */

const counts = {
  all: 248,
  byCategory: { instrument: 42, audiofx: 147, midifx: 19, modulator: 40 },
  favourites: 12,
};

const meta = {
  title: "Layout/Palette/CategoryRail",
  component: CategoryRail,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "V2 Category-Led 52px rail. The rail IS the tab strip — All / 4 categories / ★ Fav / ⏱ Recent / Projects are always visible; tapping one narrows the list pane. Wired to the same activeCategory / favouritesOnly / recentSort state the old facet chips drove, so host filter behaviour is unchanged — only the surface moved into a persistent column.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="relative bg-canvas" style={{ height: 560, width: 60 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    activeTab: "plugins",
    activeCategory: null,
    favouritesOnly: false,
    recentSort: false,
    counts,
    hasFavourites: true,
    hasRecents: true,
    onSelect: fn(),
    onSelectProjects: fn(),
  },
} satisfies Meta<typeof CategoryRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Default state — ALL active, every category entry shown with its live count. Clicking FX emits a category selection.",
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "All Blocks" }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "FX Blocks" }));
    await expect(args.onSelect).toHaveBeenCalledWith({
      kind: "category",
      category: "audiofx",
    });
  },
};

export const AudioFxActive: Story = {
  args: { activeCategory: "audiofx" },
  parameters: {
    docs: {
      description: {
        story:
          "Audio FX selected — the ◆ entry carries the active accent bar + amber/orange label; ALL is no longer pressed.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "FX Blocks" }),
    ).toHaveAttribute("aria-pressed", "true");
  },
};

export const FavouritesActive: Story = {
  args: { favouritesOnly: true },
  parameters: {
    docs: {
      description: {
        story:
          "★ Favourites facet active — the star entry is pressed; clicking it again emits a favourites toggle.",
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const fav = canvas.getByRole("button", { name: "Favourites only" });
    await expect(fav).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(fav);
    await expect(args.onSelect).toHaveBeenCalledWith({ kind: "favourites" });
  },
};

export const EmptyFacets: Story = {
  args: {
    hasFavourites: false,
    hasRecents: false,
    counts: { ...counts, favourites: 0 },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Nothing favourited or used yet — the ★ Fav and ⏱ Recent entries are disabled (dimmed) so the rail never dead-ends on an empty facet.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Favourites only" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Most recently used first" }),
    ).toBeDisabled();
  },
};

export const ProjectsTab: Story = {
  args: { activeTab: "projects" },
  parameters: {
    docs: {
      description: {
        story:
          "Projects entry active — on the Projects tab the plugin facets are no longer pressed; the Projects entry carries the accent.",
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Projects" }));
    await expect(args.onSelectProjects).toHaveBeenCalled();
  },
};
