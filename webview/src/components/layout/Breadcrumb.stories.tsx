import type { Meta, StoryObj } from "@storybook/react-vite";
import { Breadcrumb } from "./Breadcrumb";
import { useGraphStore } from "../../stores/useGraphStore";

// Breadcrumb reads breadcrumbStack from useGraphStore.
// Seed via decorator. Always renders — shows a root crumb at depth ≤ 1.

const meta = {
  title: "Layout/Breadcrumb",
  component: Breadcrumb,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Breadcrumb trail for the current depth inside nested Boards (Containers/Portals). Always visible — at the root Board it shows a single non-clickable location indicator. Clicking an ancestor crumb pops back to that level. Driven by the graph store's breadcrumb stack.",
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

// Root only — always shows "Board" regardless of the engine-provided session name.
export const RootOnly: Story = {
  decorators: [
    (Story) => {
      // The engine typically pushes the session/project name as the first crumb,
      // but the component always replaces index 0 with "Board" — this is a canvas
      // nav tool, not a session title display.
      seedBreadcrumbs(["My Project"]);
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
          "At the root Board the breadcrumb always shows 'Board' as a single non-clickable location indicator, regardless of what the engine pushes as the session name. No back navigation — there is nowhere above to go.",
      },
    },
  },
};

// Root with empty store (pre-hydration fallback) — also shows 'Board'.
export const RootEmptyStore: Story = {
  decorators: [
    (Story) => {
      seedBreadcrumbs([]);
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
          "Pre-hydration state where the store has an empty breadcrumb stack. The component normalises to a single 'Board' crumb so the bar is never empty.",
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
          "First level of nesting (Root → Container A) — the minimum case where the breadcrumb shows an ancestor crumb, with the trailing crumb shown as the current, non-clickable level.",
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
