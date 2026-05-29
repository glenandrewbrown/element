import type { Meta, StoryObj } from "@storybook/react-vite";
import { AboutModal } from "./AboutModal";

// AboutModal is fully self-contained: it fetches info via nativeAppGetAbout and
// nativeAppCheckForUpdates which no-op / return undefined without a JUCE backend.
// The component gracefully shows fallback text ("Element", "—", "GPL-3.0-or-later")
// so no store seeding is required — just render with an onClose callback.

const meta = {
  title: "Layout/AboutModal",
  component: AboutModal,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Neumorphic About Element modal with a Check-for-updates button. Shows the Project's build version and licence, and triggers the host's native updater (fire-and-forget — the result appears in a separate native window). Tracks idle / checking / requested / error states. Dismissed via Close or ESC.",
      },
    },
  },
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
  parameters: {
    docs: {
      description: {
        story:
          "Default open state: the Check-for-updates button is enabled and no status banner is shown. This is what the user sees on opening About.",
      },
    },
  },
};

// Variant: same open state with a no-op close handler, shown in fullscreen context
// so the overlay backdrop is visible.
export const WithBackdrop: Story = {
  args: {
    onClose: () => {},
  },
  parameters: {
    docs: {
      description: {
        story:
          "Same idle modal rendered over a full-viewport canvas so the dimmed backdrop overlay is visible — confirms the modal reads as a focused, blocking layer.",
      },
    },
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
