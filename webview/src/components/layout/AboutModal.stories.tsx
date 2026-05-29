import type { Meta, StoryObj } from "@storybook/react-vite";
import { AboutModal } from "./AboutModal";

// AboutModal is fully self-contained: it fetches info via nativeAppGetAbout and
// nativeAppCheckForUpdates which no-op / return undefined without a JUCE backend.
// The component gracefully shows fallback text ("Element", "—", "GPL-3.0-or-later")
// so no store seeding is required — just render with an onClose callback.

const meta = {
  title: "Layout/AboutModal",
  component: AboutModal,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    onClose: { action: "closed" },
  },
} satisfies Meta<typeof AboutModal>;

export default meta;
type Story = StoryObj<typeof meta>;

// Primary: modal open with default (idle) state.
// Bridge returns undefined so version shows "—" and copyright shows "GPL-3.0-or-later".
export const Idle: Story = {
  args: {
    onClose: () => {},
  },
};

// Variant: same open state with a no-op close handler, shown in fullscreen context
// so the overlay backdrop is visible.
export const WithBackdrop: Story = {
  args: {
    onClose: () => {},
  },
  render: (args) => (
    <div
      style={{ width: "100vw", height: "100vh" }}
      className="bg-canvas"
    >
      <AboutModal {...args} />
    </div>
  ),
};
