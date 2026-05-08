import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "./EmptyState";

const meta = {
  title: "Neu/EmptyState",
  component: EmptyState,
  parameters: {
    layout: "centered",
    backgrounds: { default: "element-canvas" },
  },
  tags: ["autodocs"],
  argTypes: {
    size: { control: { type: "select" }, options: ["sm", "md", "lg"] },
    tone: {
      control: { type: "select" },
      options: ["audio", "midi", "cv", "neutral"],
    },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoPlugins: Story = {
  args: {
    title: "No plug-ins yet",
    description: "Drag a plug-in from the browser to get started.",
    size: "md",
    tone: "audio",
  },
};

export const NoConnections: Story = {
  args: {
    title: "No connections",
    description: "Wire blocks together to start routing audio.",
    size: "md",
    tone: "neutral",
  },
};

export const NoMidi: Story = {
  args: {
    title: "Awaiting MIDI",
    description: "No MIDI input devices detected.",
    size: "md",
    tone: "midi",
  },
};
