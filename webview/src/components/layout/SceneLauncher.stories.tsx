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
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SceneLauncher>;

export default meta;
type Story = StoryObj<typeof meta>;

const framed = (
  <div style={{ height: 480 }} className="bg-canvas">
    <SceneLauncher />
  </div>
);

export const Populated: Story = {
  decorators: [
    (Story) => {
      seed(demoScenes, 0);
      return <Story />;
    },
  ],
  render: () => framed,
};

export const Empty: Story = {
  decorators: [
    (Story) => {
      seed([], 0);
      return <Story />;
    },
  ],
  render: () => framed,
};

export const SingleScene: Story = {
  decorators: [
    (Story) => {
      seed([{ id: "s1", name: "Main", index: 0, active: true, hasCapture: true }], 0);
      return <Story />;
    },
  ],
  render: () => framed,
};
