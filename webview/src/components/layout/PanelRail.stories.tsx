import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, expect, userEvent } from "storybook/test";
import { PanelRail } from "./PanelRail";

/**
 * PanelRail — the unified 40px Activity-Bar icon rail shown when EITHER side
 * panel is collapsed (Task 3.B / brief §4.1). It replaces the old blank
 * drag-handle pill: collapse hides the panel content but the rail keeps a
 * one-click way back. These stories cover both rails (browser / inspector) and
 * the extra-buttons variant (e.g. category filters), and assert the click /
 * a11y contract.
 */

const meta = {
  title: "Layout/PanelRail",
  component: PanelRail,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The 40px neumorphic icon rail rendered in place of a collapsed side panel. A primary expand button restores the panel (and, for the browser, focuses search); optional glyph buttons re-expand AND apply an action. The blank 36px drag-handle rail is gone — collapse hides content, not access.",
      },
    },
  },
  // Dark chassis backdrop so the neumorphic surfaces read correctly, sized to a
  // tall sliver like the real docked rail.
  decorators: [
    (Story) => (
      <div className="relative bg-canvas" style={{ height: 480, width: 80 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    onExpand: fn(),
  },
} satisfies Meta<typeof PanelRail>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Left browser rail: just the expand button ──
export const LeftBrowserRail: Story = {
  args: {
    side: "left",
    expandIcon: "Search",
    expandLabel: "Expand browser",
    expandTitle: "Expand browser (⌘1)",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Collapsed left browser: a single Search glyph that re-opens the panel and focuses its search box (search-first).",
      },
    },
  },
  play: async ({ canvas, args }) => {
    const btn = canvas.getByRole("button", { name: "Expand browser" });
    await expect(btn).toBeInTheDocument();
    await userEvent.click(btn);
    await expect(args.onExpand).toHaveBeenCalledOnce();
  },
};

// ── Right inspector rail ──
export const RightInspectorRail: Story = {
  args: {
    side: "right",
    expandIcon: "SlidersHorizontal",
    expandLabel: "Expand inspector",
    expandTitle: "Expand inspector (⌘2)",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Collapsed right inspector: a Sliders glyph that re-opens the inspector. (When nothing is selected the panel can stay collapsed for max canvas.)",
      },
    },
  },
  play: async ({ canvas, args }) => {
    const btn = canvas.getByRole("button", { name: "Expand inspector" });
    await expect(btn).toBeInTheDocument();
    await userEvent.click(btn);
    await expect(args.onExpand).toHaveBeenCalledOnce();
  },
};

// ── Left rail with category-filter buttons (the richer browser variant) ──
export const LeftRailWithFilters: Story = {
  args: {
    side: "left",
    expandIcon: "Search",
    expandLabel: "Expand browser",
    buttons: [
      { key: "instrument", icon: "Piano", label: "Filter Virtual Instruments", color: "#4A90D9", onClick: fn() },
      { key: "audiofx", icon: "SlidersHorizontal", label: "Filter Audio Effects", color: "#E8A838", onClick: fn() },
      { key: "midifx", icon: "GitBranch", label: "Filter MIDI Effects", color: "#2BC4C4", onClick: fn() },
      { key: "modulator", icon: "Waves", label: "Filter Modulators", color: "#A87FE0", dim: true, onClick: fn() },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          "Collapsed browser rail with the four category-filter glyphs below the divider — tapping one re-expands the panel AND applies that filter. Each carries an aria-label (a11y).",
      },
    },
  },
  play: async ({ canvas, args }) => {
    // Every glyph button is reachable by its accessible label (a11y gate).
    for (const b of args.buttons ?? []) {
      const el = canvas.getByRole("button", { name: b.label });
      await expect(el).toBeInTheDocument();
    }
    // Clicking a filter fires its handler.
    const inst = canvas.getByRole("button", { name: "Filter Virtual Instruments" });
    await userEvent.click(inst);
    await expect(args.buttons![0]!.onClick).toHaveBeenCalledOnce();
  },
};
