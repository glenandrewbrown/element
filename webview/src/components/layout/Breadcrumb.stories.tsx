import type { Meta, StoryObj } from "@storybook/react-vite";
import { Breadcrumb } from "./Breadcrumb";
import { useGraphStore } from "../../stores/useGraphStore";

// Breadcrumb reads breadcrumbStack from useGraphStore.
// Seed via decorator; component renders null at depth ≤ 1.

const meta = {
  title: "Layout/Breadcrumb",
  component: Breadcrumb,
  parameters: { layout: "fullscreen" },
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
};
