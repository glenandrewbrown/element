import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { VirtualKeyboard } from "./VirtualKeyboard";

// ── VirtualKeyboard ──
// Store-free: the component takes only `defaultChannel` / `defaultVelocity`
// props and tracks active notes in internal state. The octave range
// (C3–B4, 2 octaves) is hardcoded in the component, not a prop, so stories
// vary only the initial channel and velocity. Native MIDI bridge calls
// (nativeVirtualKeyboardNoteOn/Off) no-op without a JUCE backend.

const meta = {
  title: "Layout/VirtualKeyboard",
  component: VirtualKeyboard,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "On-screen two-octave (C3-B4) piano for auditioning Blocks without external hardware — click or drag across keys to emit MIDI note-on/note-off into the active Board. Store-free: only the initial channel and velocity are configurable via props; the note range is fixed. Native MIDI bridge calls no-op without a JUCE backend.",
      },
    },
  },
  argTypes: {
    defaultChannel: { control: { type: "range", min: 1, max: 16, step: 1 } },
    defaultVelocity: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
  },
} satisfies Meta<typeof VirtualKeyboard>;

export default meta;
type Story = StoryObj<typeof meta>;

const framed = (children: ReactNode) => (
  <div className="bg-canvas p-4 flex items-end" style={{ minHeight: 160 }}>
    {children}
  </div>
);

export const Default: Story = {
  args: { defaultChannel: 1, defaultVelocity: 0.75 },
  parameters: {
    docs: {
      description: {
        story:
          "Channel 1 at a moderate 0.75 velocity — the standard default for quickly auditioning a Block.",
      },
    },
  },
  render: (args) => framed(<VirtualKeyboard {...args} />),
};

export const FullVelocity: Story = {
  args: { defaultChannel: 1, defaultVelocity: 1 },
  parameters: {
    docs: {
      description: {
        story:
          "Velocity pinned to 1.0 (127): test how a Block responds at maximum dynamics, e.g. velocity-mapped filter or amp.",
      },
    },
  },
  render: (args) => framed(<VirtualKeyboard {...args} />),
};

export const SoftVelocity: Story = {
  args: { defaultChannel: 10, defaultVelocity: 0.2 },
  parameters: {
    docs: {
      description: {
        story:
          "Soft 0.2 velocity on channel 10 (the GM drum channel): demonstrates routing notes to a specific MIDI channel at low dynamics.",
      },
    },
  },
  render: (args) => framed(<VirtualKeyboard {...args} />),
};
