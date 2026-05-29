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
  parameters: { layout: "fullscreen" },
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
  render: (args) => framed(<VirtualKeyboard {...args} />),
};

export const FullVelocity: Story = {
  args: { defaultChannel: 1, defaultVelocity: 1 },
  render: (args) => framed(<VirtualKeyboard {...args} />),
};

export const SoftVelocity: Story = {
  args: { defaultChannel: 10, defaultVelocity: 0.2 },
  render: (args) => framed(<VirtualKeyboard {...args} />),
};
