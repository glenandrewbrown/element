import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "./EmptyState";

const meta = {
  title: "Neu/EmptyState",
  component: EmptyState,
  parameters: {
    layout: "centered",
    backgrounds: { default: "element-canvas" },
    docs: {
      description: {
        component:
          "EmptyState — a neumorphic \"no items\" placeholder for empty surfaces: no Blocks on a Board, no Cables/connections, no presets, no MIDI input, no search results. Renders an optional illustration, a title, an optional description, and an optional CTA, centered. Announced via `role=\"status\" aria-live=\"polite\"`. `tone` (audio/midi/cv/neutral) adds a subtle semantic glow only when asked; neutral by default. Use it to turn a blank panel into a guided next step.",
      },
    },
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
  parameters: {
    docs: {
      description: {
        story:
          "Empty Board / browser state — audio tone glow nudges the user to drag in their first Block.",
      },
    },
  },
};

export const NoConnections: Story = {
  args: {
    title: "No connections",
    description: "Wire blocks together to start routing audio.",
    size: "md",
    tone: "neutral",
  },
  parameters: {
    docs: {
      description: {
        story:
          "No Cables yet — neutral tone, prompting the user to wire Blocks together to begin routing.",
      },
    },
  },
};

export const NoMidi: Story = {
  args: {
    title: "Awaiting MIDI",
    description: "No MIDI input devices detected.",
    size: "md",
    tone: "midi",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Device-absent state — MIDI tone (teal) signals the surface is waiting on a missing input device.",
      },
    },
  },
};
