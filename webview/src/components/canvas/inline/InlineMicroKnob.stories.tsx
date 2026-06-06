import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { InlineMicroKnob } from "./InlineMicroKnob";

function Demo({
  initial = 0.5,
  steps,
  label = "GAIN",
}: {
  initial?: number;
  steps?: number;
  label?: string;
}) {
  const [v, setV] = useState(initial);
  return (
    <div style={{ padding: 24, background: "#252529" }}>
      <InlineMicroKnob
        value={v}
        defaultValue={0.5}
        label={label}
        steps={steps}
        onChange={setV}
      />
    </div>
  );
}

const meta = {
  title: "Canvas/Inline/InlineMicroKnob",
  component: InlineMicroKnob,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "T5 — a 22–28px on-face knob bound to one REAL host parameter (normalised 0–1). Wraps NeuKnob (xs/compact) and routes gestures through the locked `useParamGesture` spec: 3px deadzone, mid-drag re-anchored Shift fine, double-click reset, Cmd-click type-in. Ships ready for any node that exposes a validated parameter.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof InlineMicroKnob>;

export default meta;
type Story = StoryObj<typeof InlineMicroKnob>;

export const Default: Story = {
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByTestId("inline-knob")).toBeInTheDocument();
    await expect(body.getByText("GAIN")).toBeInTheDocument();
  },
};

export const Stepped: Story = {
  render: () => <Demo initial={0.25} steps={4} label="MODE" />,
};
