import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { MirrorPanel } from "./MirrorPanel";
import { useInstancesStore } from "../../stores/useInstancesStore";

// MirrorPanel is a fixed right-side overlay that self-hides with no target.
// It reads the mirror target/snapshot and the peer name from useInstancesStore.
// NOTHING fake: the summary + block list come only from the peer's real graph
// snapshot; a dead/scan-only target shows the honest "Instance unavailable".

const meta = {
  title: "Layout/MirrorPanel",
  component: MirrorPanel,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "U11 — read-only live view of a peer Element instance's board. Floats as a fixed right-rail overlay (never displaces the canvas). Shows the peer's real project/board name, live block + cable counts, transport state, and a read-only block list — refreshed at 4 Hz. A 'MIRROR · READ ONLY' badge makes the non-editable nature explicit.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="bg-canvas w-full" style={{ height: 480 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MirrorPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const PEER = {
  id: 2,
  name: "Bass Rack",
  variant: 1,
  isSelf: false,
  hasGraph: true,
};

function seed(partial: Record<string, unknown>) {
  useInstancesStore.setState({
    instances: [
      { id: 1, name: "Drums", variant: 0, isSelf: true, hasGraph: true },
      PEER,
    ],
    selfId: 1,
    mirrorTargetId: null,
    mirrorSnapshot: null,
    mirrorUnavailable: false,
    hasHostData: true,
    lastUpdated: Date.now(),
    ...partial,
  });
}

// Honest unavailable state — dead / scan-only / no-data target.
export const Unavailable: Story = {
  decorators: [
    (Story) => {
      seed({ mirrorTargetId: 2, mirrorUnavailable: true });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Instance unavailable")).toBeInTheDocument();
  },
  parameters: {
    docs: {
      description: {
        story:
          "The mirrored instance is no longer running (or has no project loaded). The panel shows an honest 'Instance unavailable' empty state — never a stale or fabricated graph.",
      },
    },
  },
};

// Populated via a mocked peer snapshot.
export const Mirroring: Story = {
  decorators: [
    (Story) => {
      seed({
        mirrorTargetId: 2,
        mirrorUnavailable: false,
        mirrorSnapshot: {
          schema: 2,
          session: { name: "Bass Rack" },
          breadcrumbs: ["Root", "Sub Bass"],
          blocks: [
            { id: "n1", name: "Operator", category: "instrument" },
            { id: "n2", name: "Saturator", category: "audiofx" },
            { id: "n3", name: "Arp", category: "midifx" },
            { id: "n4", name: "LFO", category: "modulator" },
          ],
          cables: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
          engine: { isPlaying: true },
        },
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Read-only badge present.
    await expect(canvas.getByText(/MIRROR/i)).toBeInTheDocument();
    // Real block names from the snapshot.
    await expect(canvas.getByText("Operator")).toBeInTheDocument();
    await expect(canvas.getByText("Saturator")).toBeInTheDocument();
    // Real counts (4 blocks, 3 cables).
    await expect(canvas.getByText("4")).toBeInTheDocument();
    await expect(canvas.getByText("3")).toBeInTheDocument();
  },
  parameters: {
    docs: {
      description: {
        story:
          "Mirroring a peer with a loaded board. Summary (project, active board, block/cable counts, transport dot) and the read-only block list are all sourced from the peer's real graph snapshot. Strictly read-only.",
      },
    },
  },
};
