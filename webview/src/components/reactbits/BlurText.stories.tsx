import type { Meta, StoryObj } from "@storybook/react-vite";
import BlurText from "./BlurText";

/**
 * React Bits BlurText — a motion text-reveal primitive, reskinned to Element
 * tokens (text-primary on canvas). React Bits motion/text/background primitives
 * are token-agnostic and SAFE in the locked neumorphic system; the pre-styled
 * `components/*` (GlassIcons, SpotlightCard) are NOT — those violate no-glass.
 */
const meta: Meta<typeof BlurText> = {
  title: "ReactBits/BlurText",
  component: BlurText,
  parameters: { backgrounds: { default: "element-canvas" } },
  decorators: [
    (Story) => (
      <div style={{ color: "#E5E5EA", fontSize: 28, fontWeight: 600, padding: 24 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof BlurText>;

export const Default: Story = {
  args: { text: "Element — the instrument", delay: 120, animateBy: "words", direction: "top" },
};

export const ByLetters: Story = {
  args: { text: "Neumorphic", delay: 40, animateBy: "letters", direction: "bottom" },
};
