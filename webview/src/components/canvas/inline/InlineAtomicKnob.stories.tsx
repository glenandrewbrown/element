import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { InlineAtomicKnob } from "./InlineAtomicKnob";
import type { InlineParamRow } from "../../../data/types";

function Demo({ initial }: { initial: InlineParamRow }) {
  const [row, setRow] = useState(initial);
  return (
    <div style={{ width: 120, padding: 24, background: "#222226" }}>
      <InlineAtomicKnob
        nodeId="demo"
        row={row}
        onWrite={(_key, value) => setRow((r) => ({ ...r, value }))}
      />
    </div>
  );
}

const meta = {
  title: "Canvas/Inline/InlineAtomicKnob",
  component: InlineAtomicKnob,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof InlineAtomicKnob>;
export default meta;
type Story = StoryObj<typeof InlineAtomicKnob>;

export const Semitones: Story = {
  render: () => (
    <Demo initial={{ key: "semitones", label: "Semitones", value: 0, min: -48, max: 48, step: 1 }} />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("Semitones")).toBeInTheDocument();
  },
};
