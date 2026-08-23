import type { Meta, StoryObj } from "@storybook/react-vite";
import { SceneLauncher } from "./SceneLauncher";
import { usePerformStore } from "../../stores/usePerformStore";
import { useAppStore } from "../../stores/useAppStore";
import type { SceneData } from "../../data/types";

// ── Store seeding ──
// SceneLauncher reads scenes + active scene from usePerformStore and routes
// activation through useAppStore.setScene. Native bridge calls no-op without a
// JUCE backend (juceBackend returns undefined), so seeding state is enough.

function seed(scenes: SceneData[], activeScene = 0) {
  usePerformStore.setState({ scenes });
  useAppStore.setState({ activeScene });
}

const demoScenes: SceneData[] = [
  { id: "s1", name: "Intro", index: 0, active: true, hasCapture: true },
  { id: "s2", name: "Verse", index: 1, active: false, hasCapture: true },
  { id: "s3", name: "Drop", index: 2, active: false, hasCapture: false },
  { id: "s4", name: "Bridge", index: 3, active: false, hasCapture: true },
  { id: "s5", name: "Outro", index: 4, active: false, hasCapture: false },
];

const meta = {
  title: "Layout/SceneLauncher",
  component: SceneLauncher,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Perform-mode launch-pad grid of Scenes (parameter snapshots of the Project). Click a slot to switch parameter states with no plugin reload; capture/rename/delete inline. Reads scenes from usePerformStore and the active index from useAppStore; activation uses optimistic-update-with-rollback. Seed both stores per story.",
      },
    },
  },
} satisfies Meta<typeof SceneLauncher>;

export default meta;
type Story = StoryObj<typeof meta>;

const framed = (
  <div style={{ height: 480 }} className="bg-canvas">
    <SceneLauncher />
  </div>
);

export const Populated: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A set list of five Scenes with the first active: shows the active-slot highlight, the logic-coloured 'has capture' dots, and the Slot/Ready/Active labelling used on stage.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed(demoScenes, 0);
      return <Story />;
    },
  ],
  render: () => framed,
};

export const Empty: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "No Scenes yet: shows the centred 'No scenes — press Add' empty state before the performer has captured any snapshots.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed([], 0);
      return <Story />;
    },
  ],
  render: () => framed,
};

export const SingleScene: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A single captured Scene: verifies the singular 'scene' label and the one-slot grid layout.",
      },
    },
  },
  decorators: [
    (Story) => {
      seed([{ id: "s1", name: "Main", index: 0, active: true, hasCapture: true }], 0);
      return <Story />;
    },
  ],
  render: () => framed,
};
