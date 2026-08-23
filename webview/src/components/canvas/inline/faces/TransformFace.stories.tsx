import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import type { BlockData, InlineParamRow } from "../../../../data/types";
import { TransformFace } from "./TransformFace";
import {
  TransformFaceStacked,
  TransformFaceInline,
} from "./TransformFaceVariants";

// ── Minimal BlockData mock ──────────────────────────────────────────────────
// BlockData carries many fields, but its `[key: string]: unknown` index signature
// lets us cast a partial with just the fields the face reads (id + inlineParams)
// plus the handful TS demands. The face only ever touches `d.id` + `d.inlineParams`.
function makeBlock(inlineParams: InlineParamRow[]): BlockData {
  return {
    id: "transform-demo",
    name: "Transform",
    category: "midifx",
    format: "INT",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 0,
    latencyMs: 0,
    bypassed: false,
    error: false,
    isMacroTagged: false,
    inlineParams,
  } as BlockData;
}

const TRANSPOSE: InlineParamRow[] = [
  { key: "semitones", label: "Semitones", value: 5, min: -48, max: 48, step: 1 },
];

const VELOCITY_AMP: InlineParamRow[] = [
  { key: "scale", label: "Scale", value: 1.0, min: 0, max: 2, step: 0.01 },
  { key: "power", label: "Power", value: 1.0, min: 0.25, max: 4, step: 0.01 },
];

// A face on the dark Block chassis. Writes go to the native bridge (a harmless
// no-op in Storybook); the dial's optimistic override keeps drags live regardless.
function Frame({
  Face,
  params,
  width = 200,
}: {
  Face: React.FC<{ d: BlockData }>;
  params: InlineParamRow[];
  width?: number;
}) {
  const [d] = useState(() => makeBlock(params));
  return (
    <div
      style={{
        width,
        padding: 14,
        borderRadius: 10,
        background: "linear-gradient(180deg, #252529 0%, #1f1f23 100%)",
        boxShadow:
          "-5px -5px 16px rgba(255,255,255,0.05), 6px 6px 22px rgba(0,0,0,0.7)",
      }}
    >
      <Face d={d} />
    </div>
  );
}

const meta = {
  title: "Canvas/Inline/Faces/TransformFace",
  component: TransformFace,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "PRIMARY on-block control face for the Transform MIDI-FX archetype (pizmidi-native). Adapts to the live node: 1 param (midiTranspose → semitones) renders a centred hero dial; 2 params (midiVelocityAmp → scale + power) render a balanced dial pair. RAW-units throughout — drag to edit (Shift = fine), ⌘/Ctrl-click to type a RAW value, double-click to reset. Empty inlineParams → renders nothing (honest). Accent = MIDI teal #2BC4C4; the readout text always carries the value (colour-blind safe). Variants below (Stacked faders / Inline chips) are alternate layouts for the same contract.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof TransformFace>;

export default meta;
type Story = StoryObj<typeof TransformFace>;

// ── PRIMARY: midiTranspose (1 control) ──────────────────────────────────────
export const Transpose: Story = {
  render: () => <Frame Face={TransformFace} params={TRANSPOSE} width={150} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("Semitones")).toBeInTheDocument();
    // RAW readout in semitone units (value 5 → "+5 st"), NOT a percentage.
    await expect(body.getByText("+5 st")).toBeInTheDocument();
    await expect(body.getByTestId("transform-dial")).toBeInTheDocument();
  },
};

// ── PRIMARY: midiVelocityAmp (2 controls) ───────────────────────────────────
export const VelocityAmp: Story = {
  render: () => <Frame Face={TransformFace} params={VELOCITY_AMP} width={200} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("Scale")).toBeInTheDocument();
    await expect(body.getByText("Power")).toBeInTheDocument();
    // Both raw readouts present in unity-gain units (1.00×), NOT 50 / percent.
    const readouts = body.getAllByText("1.00×");
    await expect(readouts.length).toBe(2);
    await expect(body.getAllByTestId("transform-dial").length).toBe(2);
  },
};

// ── RAW type-in lands a raw value, not a percentage ─────────────────────────
// The type-in is opened in production via ⌘/Ctrl-click (useParamGesture's
// onTypeRequest); on the dial it is ALSO reachable via keyboard Enter (the same
// branch), which is the deterministic affordance to drive in the headless
// runner. Either entry seeds + commits the value in RAW units.
export const RawTypeIn: Story = {
  render: () => <Frame Face={TransformFace} params={TRANSPOSE} width={150} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const knob = within(body.getByTestId("transform-dial")).getByRole("slider");
    knob.focus();
    // Enter opens the RAW numeric input (seeded with the current value).
    await userEvent.keyboard("{Enter}");
    const input = await body.findByLabelText("Semitones value");
    await expect(input).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "12");
    await userEvent.keyboard("{Enter}");
    // Committed as RAW 12 → "+12 st" (a percentage path would show ~"+0 st").
    await expect(body.getByText("+12 st")).toBeInTheDocument();
  },
};

// ── ALTERNATE LAYOUT 1: stacked fader rows ──────────────────────────────────
export const VariantStacked: Story = {
  render: () => <Frame Face={TransformFaceStacked} params={VELOCITY_AMP} width={190} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("Scale")).toBeInTheDocument();
    await expect(body.getByText("Power")).toBeInTheDocument();
    await expect(body.getAllByTestId("transform-fader-row").length).toBe(2);
    await expect(body.getAllByText("1.00×").length).toBe(2);
  },
};

export const VariantStackedTranspose: Story = {
  render: () => <Frame Face={TransformFaceStacked} params={TRANSPOSE} width={170} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("Semitones")).toBeInTheDocument();
    await expect(body.getByText("+5 st")).toBeInTheDocument();
    await expect(body.getByTestId("transform-fader-row")).toBeInTheDocument();
  },
};

// ── ALTERNATE LAYOUT 2: inline value chips ──────────────────────────────────
export const VariantInline: Story = {
  render: () => <Frame Face={TransformFaceInline} params={VELOCITY_AMP} width={160} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("Scale")).toBeInTheDocument();
    await expect(body.getByText("Power")).toBeInTheDocument();
    await expect(body.getAllByTestId("transform-chip-row").length).toBe(2);
    await expect(body.getAllByText("1.00×").length).toBe(2);
  },
};

export const VariantInlineTranspose: Story = {
  render: () => <Frame Face={TransformFaceInline} params={TRANSPOSE} width={140} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("Semitones")).toBeInTheDocument();
    await expect(body.getByText("+5 st")).toBeInTheDocument();
  },
};

// ── Honest empty: no inlineParams → renders nothing ─────────────────────────
export const EmptyRendersNothing: Story = {
  render: () => <Frame Face={TransformFace} params={[]} width={150} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.queryByTestId("transform-face")).not.toBeInTheDocument();
    await expect(body.queryByTestId("transform-dial")).not.toBeInTheDocument();
  },
};
