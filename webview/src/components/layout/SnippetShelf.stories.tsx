import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
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

// Wrapper matching the left-nav vertical context (G-15 relocation)
function LeftNavPanel({ children }: { children: ReactNode }) {
  return (
    <div style={{ width: 240, height: 420 }} className="bg-panel">
      {children}
    </div>
  );
}

const meta = {
  title: "Layout/SnippetShelf",
  component: SnippetShelf,
  parameters: {
    layout: "fullscreen",
    design: {
      type: "link",
      url: "/docs/stitch-reference/DESIGN.md",
    },
    docs: {
      description: {
        component:
          "Left-nav panel of saved Snippets (pre-wired Block + Cable groups, a.k.a. molecules) presented as click-to-insert items, plus the always-visible PANIC button. Reads useHostExtrasStore.molecules; seed it per story. Relocated from the bottom edit-mode shelf (G-15).",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof SnippetShelf>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Populated: several snippets ──
export const WithSnippets: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The typical panel with a handful of saved chains ready to drop onto the Board — the primary insert-a-Snippet use case.",
      },
    },
  },
  decorators: [
    (Story) => {
      useHostExtrasStore.setState((s) => ({
        ...s,
        molecules: demoMolecules,
      }));
      return (
        <LeftNavPanel>
          <Story />
        </LeftNavPanel>
      );
    },
  ],
  play: async ({ canvas }) => {
    // Explanatory label clarifying what snippets are (AC: G-15)
    await expect(
      canvas.getByText(/pre-wired block \+ cable groups/i),
    ).toBeInTheDocument();
    // Each molecule renders as a named insert button
    const buttons = canvas.getAllByRole("button", { name: /insert snippet/i });
    await expect(buttons.length).toBeGreaterThan(0);
    await expect(buttons[0]).toBeEnabled();
    // PANIC button always visible
    await expect(
      canvas.getByRole("button", { name: /panic/i }),
    ).toBeInTheDocument();
  },
};

// ── Empty: no snippets saved yet ──
export const Empty: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "No Snippets saved: shows the explanatory label plus guidance on how to create one. PANIC button still visible.",
      },
    },
  },
  decorators: [
    (Story) => {
      useHostExtrasStore.setState((s) => ({ ...s, molecules: [] }));
      return (
        <LeftNavPanel>
          <Story />
        </LeftNavPanel>
      );
    },
  ],
  play: async ({ canvas }) => {
    // Explanatory label in header always present
    await expect(
      canvas.getByText(/pre-wired block \+ cable groups/i),
    ).toBeInTheDocument();
    // Empty state guidance
    await expect(canvas.getByText(/no snippets yet/i)).toBeInTheDocument();
    // PANIC always visible
    await expect(
      canvas.getByRole("button", { name: /panic/i }),
    ).toBeInTheDocument();
    // No insert buttons when list is empty
    const insertButtons = canvas.queryAllByRole("button", {
      name: /insert snippet/i,
    });
    await expect(insertButtons).toHaveLength(0);
  },
};

// ── Single snippet ──
export const SingleSnippet: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "One saved Snippet: the minimal populated state, useful for checking item sizing and action affordance.",
      },
    },
  },
  decorators: [
    (Story) => {
      useHostExtrasStore.setState((s) => ({
        ...s,
        molecules: [{ name: "My Chain", description: "Custom signal chain" }],
      }));
      return (
        <LeftNavPanel>
          <Story />
        </LeftNavPanel>
      );
    },
  ],
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/pre-wired block \+ cable groups/i),
    ).toBeInTheDocument();
    const btn = canvas.getByRole("button", {
      name: /insert snippet: my chain/i,
    });
    await expect(btn).toBeEnabled();
  },
};

// ── Many snippets — scrollable overflow ──
export const ManySnippets: Story = {
  tags: ["!manifest"],
  parameters: {
    docs: {
      description: {
        story:
          "Visual-only: 12 auto-generated Snippets to exercise vertical scroll/overflow in the left-nav context. Excluded from agent manifest.",
      },
    },
  },
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
        <LeftNavPanel>
          <Story />
        </LeftNavPanel>
      );
    },
  ],
};
