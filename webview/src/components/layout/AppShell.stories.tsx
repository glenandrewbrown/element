import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { AppShell } from "./AppShell";
import { useAppStore } from "../../stores/useAppStore";
import { usePerformStore } from "../../stores/usePerformStore";

// ── Store seeding ──
// AppShell reads useAppStore (mode, leftPanelOpen, rightPanelOpen,
// bottomPanelOpen, togglePanel) and usePerformStore (mapModeActive via
// selectMapMode). setState shallow-merges, so the togglePanel action survives
// seeding — only the boolean/mode flags are overridden here.
//
// ── Isolation constraint ──
// These are minimal SMOKE stories. AppShell composes the real Toolbar /
// ToolPalette / InspectorHub / Snippet / Macro panels in the live app, each of
// which pulls in several stores. To keep the story self-contained (and to
// guarantee it mounts without seeding every downstream store), we pass ONLY
// `children` and let AppShell render its built-in PlaceholderPanel fallbacks in
// every slot. AppShell also uses fixed/absolute positioning, so each story is
// wrapped in a relative, full-viewport host. To see the shell with real panels,
// view the individual panel stories (Layout/Toolbar, Layout/ToolPalette, …).
//
// In Edit mode AppShell unconditionally mounts two real canvas-area children,
// <Breadcrumb /> and <BlockTabStrip />. Both are mount-safe at the default
// store state we leave untouched: breadcrumbStack defaults to ["Main Project"]
// (length 1 → Breadcrumb renders null) and openBlockTabs defaults to []
// (→ BlockTabStrip renders null). Perform-mode stories skip both children.

function seed(mode: "edit" | "perform", mapMode = false) {
  useAppStore.setState({
    mode,
    leftPanelOpen: true,
    rightPanelOpen: true,
    bottomPanelOpen: true,
  });
  usePerformStore.setState({ mapModeActive: mapMode });
}

const meta = {
  title: "Layout/AppShell",
  component: AppShell,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Whole-app chassis: a fixed top Toolbar, animated left/right side panels, a bottom panel, the centre Board canvas, and the bottom StatusBar. Panel content and sizing are resolved by mode (Edit vs Perform) and panels collapse to thin rails. Use it as the frame every screen lives inside. These stories are minimal smoke tests using AppShell's built-in placeholder panels — see the individual Layout/* panel stories for real content.",
      },
    },
  },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

const host = (node: ReactNode) => (
  <div className="relative w-full bg-canvas" style={{ height: 600 }}>
    {node}
  </div>
);

const canvas = (
  <div className="flex items-center justify-center h-full text-text-dim text-[11px] uppercase tracking-widest">
    Board canvas
  </div>
);

// ── Edit mode: workshop layout with placeholder panels in every slot ──
export const EditMode: Story = {
  args: { children: canvas },
  parameters: {
    docs: {
      description: {
        story:
          "The workshop frame: Edit mode with all three panels open, showing the Tool Palette / Inspector / Snippet Shelf placeholder slots around the Board canvas.",
      },
    },
  },
  render: (args) => host(<AppShell {...args} />),
  decorators: [
    (Story) => {
      seed("edit");
      return <Story />;
    },
  ],
};

// ── Perform mode: stage layout (taller bottom panel, perform-mode canvas) ──
export const PerformMode: Story = {
  args: { children: canvas },
  parameters: {
    docs: {
      description: {
        story:
          "The stage frame: Perform mode swaps panel content (Quick Access / Live Health / Macro Dashboard placeholders) and uses the taller bottom panel — the structural shift from Edit mode, not just a colour change.",
      },
    },
  },
  render: (args) => host(<AppShell {...args} />),
  decorators: [
    (Story) => {
      seed("perform");
      return <Story />;
    },
  ],
};

// ── Perform mode + Map Mode: the macro-assignment banner over the canvas ──
export const PerformMapMode: Story = {
  args: { children: canvas },
  parameters: {
    docs: {
      description: {
        story:
          "Perform mode with Map Mode armed: the 'click parameter to assign macro' banner overlays the canvas, the state used when binding Block parameters to dashboard macros.",
      },
    },
  },
  render: (args) => host(<AppShell {...args} />),
  decorators: [
    (Story) => {
      seed("perform", true);
      return <Story />;
    },
  ],
};
