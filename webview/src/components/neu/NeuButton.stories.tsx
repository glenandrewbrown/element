import type { Meta, StoryObj } from "@storybook/react-vite";
import { NeuButton } from "./NeuButton";

const meta = {
  title: "Neu/Button",
  component: NeuButton,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "NeuButton — the workhorse neumorphic action button of the Element chassis. Extrudes from the surface at rest and presses INTO it on click. `variant=\"default\"` is a neutral command button; `variant=\"active\"` adds the teal logic accent + status dot to signal an engaged toggle (e.g. snap-to-grid on); `variant=\"panic\"` is the always-visible red emergency control (all-notes-off). Use for any command/action in toolbars, panels, and dashboards.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "active", "panic"],
    },
    size: {
      control: { type: "select" },
      options: ["sm", "md"],
    },
    onClick: { action: "clicked" },
  },
} satisfies Meta<typeof NeuButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "Default",
    variant: "default",
    size: "md",
  },
  parameters: {
    docs: {
      description: {
        story:
          "The baseline command button — neutral extruded surface for any standard action.",
      },
    },
  },
};

export const Active: Story = {
  args: {
    children: "Active",
    variant: "active",
    size: "md",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Engaged-toggle state: teal logic accent + status dot signal that a mode is ON without swapping the button out.",
      },
    },
  },
};

export const Panic: Story = {
  args: {
    children: "PANIC",
    variant: "panic",
    size: "md",
  },
  parameters: {
    docs: {
      description: {
        story:
          "The emergency MIDI-panic control — red, always-visible, sends Note Off to all outputs. Reserve `panic` for this.",
      },
    },
  },
};

export const Small: Story = {
  args: {
    children: "Small",
    variant: "default",
    size: "sm",
  },
  parameters: {
    docs: {
      description: {
        story: "Dense `sm` size for packed toolbars where vertical space is tight.",
      },
    },
  },
};

export const VariantMatrix: Story = {
  tags: ["!manifest"],
  args: { children: "x" },
  render: () => (
    <div className="flex flex-col gap-3 p-6">
      <div className="flex items-center gap-2">
        <NeuButton variant="default" size="sm">
          Default sm
        </NeuButton>
        <NeuButton variant="active" size="sm">
          Active sm
        </NeuButton>
        <NeuButton variant="panic" size="sm">
          Panic sm
        </NeuButton>
      </div>
      <div className="flex items-center gap-2">
        <NeuButton variant="default" size="md">
          Default md
        </NeuButton>
        <NeuButton variant="active" size="md">
          Active md
        </NeuButton>
        <NeuButton variant="panic" size="md">
          Panic md
        </NeuButton>
      </div>
    </div>
  ),
};
