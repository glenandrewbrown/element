import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent } from "storybook/test";
import { InstanceSwitcher } from "./InstanceSwitcher";
import { useInstancesStore } from "../../stores/useInstancesStore";

// InstanceSwitcher reads the live instance list from useInstancesStore. Seed it
// per-story via the decorator. NOTHING fake: rows come only from the real
// registry payload — the single-instance case is the honest standalone state.

const meta = {
  title: "Layout/InstanceSwitcher",
  component: InstanceSwitcher,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "U11 — toolbar control listing the OTHER live Element plugin instances in the host process. In the standalone app / single-instance host it renders an honest DISABLED '1×' pill (no dropdown, never fabricated peers). With 2+ instances it opens a dropdown to mirror a peer's board read-only.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="bg-panel p-4 flex items-center justify-end min-w-[260px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InstanceSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

function seed(
  instances: Array<{
    id: number;
    name: string;
    variant: number;
    isSelf: boolean;
    hasGraph: boolean;
  }>,
  mirrorTargetId: number | null = null,
) {
  useInstancesStore.setState({
    instances,
    selfId: instances.find((i) => i.isSelf)?.id ?? -1,
    mirrorTargetId,
    mirrorSnapshot: null,
    mirrorUnavailable: false,
    hasHostData: true,
    lastUpdated: Date.now(),
  });
}

// Honest single-instance state — disabled "1×" pill, no dropdown.
export const SingleInstance: Story = {
  decorators: [
    (Story) => {
      seed([
        { id: 1, name: "My Project", variant: 0, isSelf: true, hasGraph: true },
      ]);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pill = canvas.getByRole("button");
    await expect(pill).toBeDisabled();
    await expect(pill).toHaveTextContent("1×");
  },
  parameters: {
    docs: {
      description: {
        story:
          "The standalone app or a host with only one Element instance. The control is a DISABLED '1×' pill — the honest state when there is nothing to mirror. NOTHING fake: no peer is invented.",
      },
    },
  },
};

// Two instances — the dropdown lists the OTHER instance.
export const MultiInstance: Story = {
  decorators: [
    (Story) => {
      seed([
        { id: 1, name: "Drums", variant: 0, isSelf: true, hasGraph: true },
        { id: 2, name: "Bass", variant: 1, isSelf: false, hasGraph: true },
        { id: 3, name: "Lead Synth", variant: 0, isSelf: false, hasGraph: false },
      ]);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pill = canvas.getByRole("button");
    await expect(pill).not.toBeDisabled();
    await userEvent.click(pill);
    // The dropdown is rendered into the same DOM subtree (no portal).
    await expect(canvas.getByRole("menu")).toBeInTheDocument();
    await expect(canvas.getByText("Bass")).toBeInTheDocument();
    await expect(canvas.getByText("Lead Synth")).toBeInTheDocument();
    // Self ("Drums") is NOT offered as a mirror target.
    await expect(canvas.queryByText("Drums")).toBeNull();
  },
  parameters: {
    docs: {
      description: {
        story:
          "Three Element instances share the host process. Clicking the pill opens a dropdown of the OTHER two (self is excluded). Each row shows a has-graph dot + the instance id.",
      },
    },
  },
};

// Mirror active — the pill reflects the active mirror + offers Close.
export const MirrorActive: Story = {
  decorators: [
    (Story) => {
      seed(
        [
          { id: 1, name: "Drums", variant: 0, isSelf: true, hasGraph: true },
          { id: 2, name: "Bass", variant: 1, isSelf: false, hasGraph: true },
        ],
        2,
      );
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button"));
    await expect(canvas.getByText("Close mirror")).toBeInTheDocument();
  },
  parameters: {
    docs: {
      description: {
        story:
          "When a peer is being mirrored the pill highlights and the dropdown gains a 'Close mirror' item. The active row is marked checked.",
      },
    },
  },
};
