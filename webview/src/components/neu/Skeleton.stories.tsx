import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "./Skeleton";

const meta = {
  title: "Neu/Skeleton",
  component: Skeleton,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["block", "text", "circle"],
    },
    width: { control: "text" },
    height: { control: "text" },
    size: { control: { type: "range", min: 16, max: 80, step: 4 } },
  },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    variant: "block",
    width: 200,
    height: 40,
  },
};

export const TextVariant: Story = {
  args: {
    variant: "text",
    width: 160,
  },
};

export const CircleVariant: Story = {
  args: {
    variant: "circle",
    size: 40,
  },
};

export const VariantMatrix: Story = {
  args: {},
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-col gap-6 p-6 w-72">
      <div className="flex flex-col gap-2">
        <span className="text-text-secondary text-[10px] uppercase tracking-wide">Block</span>
        <Skeleton variant="block" width="100%" height={48} />
        <Skeleton variant="block" width="100%" height={24} />
        <Skeleton variant="block" width="60%" height={16} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-text-secondary text-[10px] uppercase tracking-wide">Text</span>
        <Skeleton variant="text" width="90%" />
        <Skeleton variant="text" width="75%" />
        <Skeleton variant="text" width="50%" />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-text-secondary text-[10px] uppercase tracking-wide">Circle</span>
        <div className="flex items-center gap-3">
          <Skeleton variant="circle" size={24} />
          <Skeleton variant="circle" size={32} />
          <Skeleton variant="circle" size={40} />
          <Skeleton variant="circle" size={56} />
        </div>
      </div>
    </div>
  ),
};

export const CardSkeleton: Story = {
  args: {},
  parameters: { layout: "centered" },
  render: () => (
    <div
      className="flex flex-col gap-3 p-4 rounded"
      style={{
        background: "#252529",
        boxShadow: "-4px -4px 10px rgba(255,255,255,0.04), 4px 4px 10px rgba(0,0,0,0.4)",
        width: 280,
      }}
    >
      {/* Header row: avatar + title lines */}
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" size={36} />
        <div className="flex flex-col gap-1.5 flex-1">
          <Skeleton variant="text" width="70%" />
          <Skeleton variant="text" width="45%" />
        </div>
      </div>

      {/* Thumbnail block */}
      <Skeleton variant="block" width="100%" height={80} />

      {/* Body text lines */}
      <div className="flex flex-col gap-1.5">
        <Skeleton variant="text" width="100%" />
        <Skeleton variant="text" width="85%" />
        <Skeleton variant="text" width="60%" />
      </div>

      {/* Badge row */}
      <div className="flex items-center gap-2">
        <Skeleton variant="block" width={44} height={18} />
        <Skeleton variant="block" width={36} height={18} />
        <Skeleton variant="block" width={52} height={18} />
      </div>
    </div>
  ),
};

export const PluginListSkeleton: Story = {
  args: {},
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-col gap-px w-72">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-3 py-2"
          style={{ background: "#252529" }}
        >
          <Skeleton variant="circle" size={24} />
          <div className="flex flex-col gap-1 flex-1">
            <Skeleton variant="text" width="65%" />
            <Skeleton variant="text" width="40%" />
          </div>
          <Skeleton variant="block" width={36} height={16} />
        </div>
      ))}
    </div>
  ),
};
