import type { Meta, StoryObj } from "@storybook/react-vite";
import { Breadcrumb } from "./Breadcrumb";
import { useGraphStore } from "../../stores/useGraphStore";

// Breadcrumb reads breadcrumbStack from useGraphStore.
// Seed via decorator; component renders null at depth ≤ 1.

const meta = {
  title: "Layout/Breadcrumb",
  component: Breadcrumb,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Breadcrumb trail for the current depth inside nested Boards (Containers/Portals). Clicking an earlier crumb pops back up to that level. Renders nothing at the root (depth ≤ 1), so it can live permanently above the canvas. Driven by the graph store's breadcrumb stack.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Breadcrumb>;

export default meta;
type Story = StoryObj<typeof meta>;

function seedBreadcrumbs(stack: string[]) {
  useGraphStore.setState((s) => ({ ...s, breadcrumbStack: stack }));
}

// Root only — renders nothing (depth ≤ 1).
export const RootOnly: Story = {
  decorators: [
    (Story) => {
      seedBreadcrumbs(["Root"]);
      return (
        <div className="bg-canvas w-full">
          <div className="text-text-dim text-[10px] px-4 py-2">
            (Breadcrumb renders nothing at root — depth ≤ 1)
          </div>
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "At the root Board the breadcrumb is intentionally absent (depth ≤ 1). Documents the no-render guard so it is not mistaken for a bug.",
      },
    },
  },
};

// Two levels: Root → Container A.
export const TwoLevels: Story = {
  decorators: [
    (Story) => {
      seedBreadcrumbs(["Root", "Container A"]);
      return (
        <div className="bg-canvas w-full">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "First level of nesting (Root → Container A) — the minimum case where the breadcrumb appears, with the trailing crumb shown as the current, non-clickable level.",
      },
    },
  },
};

// Three levels: Root → Container A → Nested B.
export const ThreeLevels: Story = {
  decorators: [
    (Story) => {
      seedBreadcrumbs(["Root", "Container A", "Nested B"]);
      return (
        <div className="bg-canvas w-full">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Typical mid-depth path with two clickable ancestors and one current level — the everyday navigation case.",
      },
    },
  },
};

// Deep nesting: five levels to test truncation and chevron spacing.
export const DeepNesting: Story = {
  decorators: [
    (Story) => {
      seedBreadcrumbs([
        "Root",
        "Instruments",
        "Polysynth Rack",
        "Voice Container",
        "Filter Stage",
      ]);
      return (
        <div className="bg-canvas w-full">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Five-level deep nesting — stress-tests chevron spacing and horizontal density when the user has dived several Containers down.",
      },
    },
  },
};

// Long crumb names: tests truncation behaviour.
export const LongNames: Story = {
  decorators: [
    (Story) => {
      seedBreadcrumbs([
        "Main Project Root Board",
        "Very Long Container Name That Tests Overflow",
        "Active Level",
      ]);
      return (
        <div className="bg-canvas w-full">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Long crumb labels — verifies truncation/overflow behaviour when users name Containers verbosely.",
      },
    },
  },
};
