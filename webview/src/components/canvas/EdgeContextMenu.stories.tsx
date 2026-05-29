import type { Meta, StoryObj } from "@storybook/react-vite";
import { EdgeContextMenu } from "./EdgeContextMenu";
import { useGraphStore } from "../../stores/useGraphStore";
import { useBusStore } from "../../stores/useBusStore";
import type { CableData } from "../../data/types";

// ── Store seeding ──
// EdgeContextMenu returns null unless useGraphStore.edges contains the edgeId.
// Whether it shows "Make Wireless…" vs "Rename Bus / Make Wired" depends on
// useBusStore.cableBus[edgeId]. Native disconnect/bus bridges are no-ops.

const EDGE_ID = "cab-1";

const demoEdge: CableData = {
  id: EDGE_ID,
  source: "n1",
  sourcePort: "out",
  target: "n2",
  targetPort: "in",
  signalType: "audio",
  channelCount: 2,
  isSidechain: false,
};

function seed(busName?: string) {
  useGraphStore.setState({ edges: [demoEdge] });
  useBusStore.setState({ cableBus: busName ? { [EDGE_ID]: busName } : {} });
}

const meta = {
  title: "Canvas/EdgeContextMenu",
  component: EdgeContextMenu,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof EdgeContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

// Wired cable — offers "Make Wireless…".
export const Wired: Story = {
  args: { edgeId: EDGE_ID, position: { x: 80, y: 60 }, onClose: () => {} },
  decorators: [
    (Story) => {
      seed();
      return (
        <div className="bg-canvas" style={{ height: 360 }}>
          <Story />
        </div>
      );
    },
  ],
};

// Wireless cable — offers "Rename Bus" + "Make Wired".
export const Wireless: Story = {
  args: { edgeId: EDGE_ID, position: { x: 80, y: 60 }, onClose: () => {} },
  decorators: [
    (Story) => {
      seed("Reverb Send A");
      return (
        <div className="bg-canvas" style={{ height: 360 }}>
          <Story />
        </div>
      );
    },
  ],
};
