import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "./Skeleton";

const meta = {
  title: "Neu/Skeleton",
  component: Skeleton,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Skeleton — a neumorphic loading placeholder for content that is still resolving (plugin lists, Block cards, panels). Renders one of three variants (`block`, `text`, `circle`) on the recessed pressed surface with a subtle shimmer, so it reads as scaffolding rather than raised content. Announced via `role=\"status\"`. Compose multiple Skeletons to mirror the shape of the real content while it loads.",
      },
    },
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
  parameters: {
    docs: {
      description: {
        story: "Block variant — a rounded rectangle placeholder for a thumbnail, card, or panel region.",
      },
    },
  },
};

export const TextVariant: Story = {
  args: {
    variant: "text",
    width: 160,
  },
  parameters: {
    docs: {
      description: {
        story: "Text variant — a single-line placeholder for a label or paragraph line.",
      },
    },
  },
};

export const CircleVariant: Story = {
  args: {
    variant: "circle",
    size: 40,
  },
  parameters: {
    docs: {
      description: {
        story: "Circle variant — for round placeholders such as an avatar or Block icon.",
      },
    },
  },
};

export const VariantMatrix: Story = {
  tags: ["!manifest"],
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
  parameters: {
    layout: "centered",
    docs: {
      description: {
        story:
          "Composition pattern: Skeletons arranged to mirror a Block card (avatar, title lines, thumbnail, body, badges) while it loads.",
      },
    },
  },
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
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story:
          "Composition pattern: repeated row Skeletons standing in for the plugin browser list during an async scan.",
      },
    },
  },
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
