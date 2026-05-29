import type { Meta, StoryObj } from "@storybook/react-vite";
import { SnippetShelf } from "./SnippetShelf";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";

// ── Store seeding ──
// SnippetShelf reads from useHostExtrasStore (molecules). No bridge calls
// at mount — pure render from store state.

const demoMolecules = [
  { name: "Sidechain Comp", description: "Classic sidechain compression chain" },
  { name: "Reverb Send", description: "Stereo reverb send with pre-delay" },
  { name: "Mid/Side", description: "M/S encoder + processor + decoder" },
  { name: "Drum Bus", description: "Kick + snare parallel compression" },
  { name: "Vocal Chain", description: "EQ → comp → de-esser" },
];

const meta = {
  title: "Layout/SnippetShelf",
  component: SnippetShelf,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof SnippetShelf>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Populated: several snippets ──
export const WithSnippets: Story = {
  decorators: [
    (Story) => {
      useHostExtrasStore.setState((s) => ({
        ...s,
        molecules: demoMolecules,
      }));
      return (
        <div style={{ width: 900, height: 48 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};

// ── Empty: no snippets saved yet ──
export const Empty: Story = {
  decorators: [
    (Story) => {
      useHostExtrasStore.setState((s) => ({ ...s, molecules: [] }));
      return (
        <div style={{ width: 900, height: 48 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};

// ── Single snippet ──
export const SingleSnippet: Story = {
  decorators: [
    (Story) => {
      useHostExtrasStore.setState((s) => ({
        ...s,
        molecules: [{ name: "My Chain", description: "Custom signal chain" }],
      }));
      return (
        <div style={{ width: 900, height: 48 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};

// ── Many snippets — scrollable overflow ──
export const ManySnippets: Story = {
  decorators: [
    (Story) => {
      useHostExtrasStore.setState((s) => ({
        ...s,
        molecules: Array.from({ length: 12 }, (_, i) => ({
          name: `Snippet ${i + 1}`,
          description: `Auto-generated snippet ${i + 1}`,
        })),
      }));
      return (
        <div style={{ width: 900, height: 48 }} className="bg-panel">
          <Story />
        </div>
      );
    },
  ],
};
