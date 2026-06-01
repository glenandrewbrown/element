import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ReactFlowProvider } from "@xyflow/react";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { useGraphStore } from "../../stores/useGraphStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import type { BlockData } from "../../data/types";

// ── Store seeding ──
// CanvasContextMenu calls useReactFlow() — which throws outside a provider — so
// it must be wrapped in <ReactFlowProvider>. It reads:
//   • useGraphStore.nodes          → block count + Select-All / Fit enablement
//   • useGraphStore.minimapVisible → Minimap toggle check state
//   • useHostExtrasStore.canvas    → Snap-to-Grid check state + grid size badge
// All native bridges (comment add, paste, set-canvas-options) no-op in
// Storybook; reactFlow.fitView / zoom are real but harmless on an empty pane.

function makeBlock(id: string, over: Partial<BlockData> = {}): BlockData {
  return {
    id,
    name: id,
    category: "instrument",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 0,
    latencyMs: 0,
    bypassed: false,
    error: false,
    isMacroTagged: false,
    ...over,
  };
}

function seed(opts: {
  nodes?: BlockData[];
  minimapVisible?: boolean;
  snapToGrid?: boolean;
  gridSize?: number;
}) {
  const {
    nodes = [],
    minimapVisible = true,
    snapToGrid = false,
    gridSize = 8,
  } = opts;
  useGraphStore.setState({ nodes, minimapVisible });
  useHostExtrasStore.setState((s) => ({
    canvas: { ...s.canvas, snapToGrid, gridSize },
  }));
}

const meta = {
  title: "Canvas/CanvasContextMenu",
  component: CanvasContextMenu,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: [
          "CanvasContextMenu — the right-click action menu for the empty Board surface.",
          "",
          "Replaces the old behaviour where right-clicking the pane opened QuickAdd",
          "directly. QuickAdd (\"Add Block…\") is now ONE entry inside a fuller,",
          "contextual menu that mirrors the native JUCE canvas menu set",
          "(`src/ui/contextmenus.hpp`), adapted to the webview stores.",
          "",
          "**Wired (real store/bridge):** Add Block… (→ QuickAdd at cursor),",
          "Add Comment Box (nativeGraphCommentAdd), Paste (nativeGraphPasteNodes),",
          "Select All Blocks (React Flow selection), Fit to View / Zoom In / Zoom Out",
          "(reactFlow), Snap to Grid (nativeGraphSetCanvasOptions), Minimap",
          "(useGraphStore.toggleMinimap).",
          "",
          "**Honest-disabled:** Auto-Layout… — native has a layout engine, the webview",
          "has no `elementGraphAutoLayout` bridge yet, so the item is disabled with a",
          "tooltip naming the gap. Nothing is a silent no-op.",
          "",
          "**Design:** mirrors NodeContextMenu — same neumorphic shell, header, and",
          "MenuItem primitives, with the primary signal-blue dopamine hover-glow.",
          "Toggle items (Snap, Minimap) show a filled accent dot when active.",
        ].join("\n"),
      },
    },
  },
} satisfies Meta<typeof CanvasContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const framed = (Story: React.ComponentType) => (
  <ReactFlowProvider>
    <div className="bg-canvas" style={{ height: 520 }}>
      <Story />
    </div>
  </ReactFlowProvider>
);

const baseArgs = {
  position: { x: 24, y: 16 },
  flowPosition: { x: 200, y: 160 },
  onAddBlock: () => {},
  onClose: () => {},
};

// ── Default: populated board ──────────────────────────────────────────────────
export const Default: Story = {
  args: baseArgs,
  parameters: {
    docs: {
      description: {
        story:
          "Populated Board (3 blocks). The full contextual menu: Create (Add Block… / " +
          "Add Comment Box), Edit (Paste / Select All Blocks), View (Fit / Zoom), and " +
          "Canvas toggles (Snap to Grid / Minimap / Auto-Layout honest-disabled). " +
          "Select All + Fit to View are enabled because the Board has blocks.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed({
        nodes: [makeBlock("Serum"), makeBlock("Pro-Q 4"), makeBlock("Reverb")],
        minimapVisible: true,
        snapToGrid: false,
      });
      return framed(Story);
    },
  ],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // Header reflects the live block count.
    await expect(body.getByText("3 blocks")).toBeVisible();
    // Wired items present.
    await expect(body.getByText("Add Block…")).toBeVisible();
    await expect(body.getByText("Add Comment Box")).toBeVisible();
    await expect(body.getByText("Paste")).toBeVisible();
    await expect(body.getByText("Select All Blocks")).toBeVisible();
    await expect(body.getByText("Fit to View")).toBeVisible();
    await expect(body.getByText("Zoom In")).toBeVisible();
    await expect(body.getByText("Zoom Out")).toBeVisible();
    await expect(body.getByText("Snap to Grid")).toBeVisible();
    await expect(body.getByText("Minimap")).toBeVisible();
    // Honest-disabled Auto-Layout — present, disabled, "soon" badge, tooltip.
    const autoLayout = body.getByText("Auto-Layout…").closest("button")!;
    await expect(autoLayout).toBeDisabled();
    await expect(autoLayout.getAttribute("title")).toContain(
      "elementGraphAutoLayout",
    );
  },
};

// ── Empty board — Select All + Fit disabled ──────────────────────────────────
export const EmptyBoard: Story = {
  args: baseArgs,
  parameters: {
    docs: {
      description: {
        story:
          "Empty Board (0 blocks). Select All Blocks and Fit to View are honest-disabled " +
          "(nothing to select / fit) with tooltips, while Add Block… / Paste / Zoom / the " +
          "Canvas toggles remain enabled. The header reads \"0 blocks\".",
      },
    },
  },
  decorators: [
    (Story) => {
      seed({ nodes: [], minimapVisible: true, snapToGrid: false });
      return framed(Story);
    },
  ],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("0 blocks")).toBeVisible();
    const selectAll = body.getByText("Select All Blocks").closest("button")!;
    const fit = body.getByText("Fit to View").closest("button")!;
    await expect(selectAll).toBeDisabled();
    await expect(fit).toBeDisabled();
    // Add Block… stays enabled even on an empty board.
    const addBlock = body.getByText("Add Block…").closest("button")!;
    await expect(addBlock).not.toBeDisabled();
  },
};

// ── Snap + minimap both ON — toggle checks visible ───────────────────────────
export const TogglesActive: Story = {
  args: baseArgs,
  parameters: {
    docs: {
      description: {
        story:
          "Snap to Grid and Minimap both active. Each toggle row uses " +
          "role=menuitemcheckbox with aria-checked=true, renders the filled accent " +
          "dot, and the Snap row shows the live grid-size badge (16px).",
      },
    },
  },
  decorators: [
    (Story) => {
      seed({
        nodes: [makeBlock("Serum")],
        minimapVisible: true,
        snapToGrid: true,
        gridSize: 16,
      });
      return framed(Story);
    },
  ],
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const snap = body.getByText("Snap to Grid").closest("button")!;
    const minimap = body.getByText("Minimap").closest("button")!;
    // Both toggles report checked state to AT.
    await expect(snap.getAttribute("role")).toBe("menuitemcheckbox");
    await expect(snap.getAttribute("aria-checked")).toBe("true");
    await expect(minimap.getAttribute("aria-checked")).toBe("true");
    // Live grid-size badge reflects the host store.
    await expect(body.getByText("16px")).toBeVisible();
  },
};

// ── Add Block… hands off to QuickAdd ─────────────────────────────────────────
export const AddBlockHandoff: Story = {
  args: { ...baseArgs, onAddBlock: fn() },
  parameters: {
    docs: {
      description: {
        story:
          "Clicking \"Add Block…\" calls onAddBlock — the single entry that routes to the " +
          "existing QuickAddPopup at the cursor. This menu does NOT rebuild QuickAdd; it " +
          "delegates. Verifies the hand-off callback fires exactly once.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed({ nodes: [makeBlock("Serum")], snapToGrid: false });
      return framed(Story);
    },
  ],
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByText("Add Block…"));
    await expect(args.onAddBlock).toHaveBeenCalledTimes(1);
  },
};
