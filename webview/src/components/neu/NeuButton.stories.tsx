import type { Meta, StoryObj } from "@storybook/react-vite";
import { NeuButton } from "./NeuButton";

const meta = {
  title: "Neu/Button",
  component: NeuButton,
  parameters: {
    layout: "centered",
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
};

export const Active: Story = {
  args: {
    children: "Active",
    variant: "active",
    size: "md",
  },
};

export const Panic: Story = {
  args: {
    children: "PANIC",
    variant: "panic",
    size: "md",
  },
};

export const Small: Story = {
  args: {
    children: "Small",
    variant: "default",
    size: "sm",
  },
};

export const VariantMatrix: Story = {
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
