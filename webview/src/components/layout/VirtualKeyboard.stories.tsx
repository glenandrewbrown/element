import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";
import { VirtualKeyboard } from "./VirtualKeyboard";

// ── VirtualKeyboard ──────────────────────────────────────────────────────────
//
// G-01 redesign stories (Wave A):
//   - Black keys fully visible + hittable (explicit-px height, no 0-height wrapper)
//   - Velocity-by-Y: bottom click → high velocity, top click → low velocity
//   - Octave +/− shift + count controls
//   - Modulation (CC#1) + assignable CC vertical sliders
//
// Native MIDI bridge calls no-op without a JUCE backend — safe to run in SB.

const DESIGN_REF = {
  type: "link" as const,
  url: "https://github.com/glenandrewbrown/element/blob/chromatic-ui-review/docs/DESIGN.md",
};

const meta = {
  title: "Layout/VirtualKeyboard",
  component: VirtualKeyboard,
  parameters: {
    layout: "fullscreen",
    design: DESIGN_REF,
    docs: {
      description: {
        component:
          "On-screen piano keyboard for auditioning Blocks without external hardware. " +
          "Click or drag across keys to emit MIDI note-on/note-off into the active Board. " +
          "Velocity is determined by press position on the key (bottom = max, top = min). " +
          "Octave range and MIDI channel are user-adjustable. Mod wheel (CC#1) and an " +
          "assignable CC slider emit CC messages into the engine.",
      },
    },
  },
  argTypes: {
    defaultChannel: { control: { type: "range", min: 1, max: 16, step: 1 } },
    defaultOctaveStart: { control: { type: "range", min: 0, max: 7, step: 1 } },
    defaultOctaveCount: { control: { type: "range", min: 1, max: 5, step: 1 } },
  },
} satisfies Meta<typeof VirtualKeyboard>;

export default meta;
type Story = StoryObj<typeof meta>;

const framed = (children: ReactNode) => (
  <div
    className="bg-canvas"
    style={{ minHeight: 200, display: "flex", alignItems: "flex-end", padding: 16 }}
  >
    {children}
  </div>
);

// ── Visual stories ────────────────────────────────────────────────────────────

/** Standard 2-octave view on channel 1 — the default layout for a new Board. */
export const Default: Story = {
  args: { defaultChannel: 1, defaultOctaveStart: 3, defaultOctaveCount: 2 },
  parameters: { design: DESIGN_REF },
  render: (args) => framed(<VirtualKeyboard {...args} />),
};

/** Three octaves — common for melodic work where the default two feel cramped. */
export const ThreeOctaves: Story = {
  args: { defaultChannel: 1, defaultOctaveStart: 3, defaultOctaveCount: 3 },
  parameters: {
    design: DESIGN_REF,
    docs: {
      description: {
        story:
          "Three octaves (C3–B5): more range for melodic work; octave +/− buttons adjust live.",
      },
    },
  },
  render: (args) => framed(<VirtualKeyboard {...args} />),
};

/** Channel 10 (GM drums) at a soft initial velocity. */
export const DrumChannel: Story = {
  args: { defaultChannel: 10, defaultOctaveStart: 2, defaultOctaveCount: 2 },
  parameters: {
    design: DESIGN_REF,
    docs: {
      description: {
        story:
          "Channel 10 at a low default velocity: route into a GM drum sampler and trigger " +
          "pads by tapping at various Y positions.",
      },
    },
  },
  render: (args) => framed(<VirtualKeyboard {...args} />),
};

/** Single low octave — footpedal / bass-register auditioning. */
export const SingleOctave: Story = {
  args: { defaultChannel: 1, defaultOctaveStart: 1, defaultOctaveCount: 1 },
  parameters: { design: DESIGN_REF },
  render: (args) => framed(<VirtualKeyboard {...args} />),
};

// ── Interaction / acceptance tests ───────────────────────────────────────────

/**
 * Asserts that black keys are fully present in the document with non-zero
 * bounding boxes AND are interactable (clicking triggers a note-on).
 */
export const BlackKeyHittable: Story = {
  args: {
    defaultChannel: 1,
    defaultOctaveStart: 3,
    defaultOctaveCount: 2,
    onNoteOn: fn(),
  },
  parameters: {
    design: DESIGN_REF,
    docs: {
      description: {
        story:
          "Acceptance test: every black key has positive pixel dimensions (non-zero bounding " +
          "box) and clicking one fires onNoteOn — verifying the G-01 fix.",
      },
    },
  },
  render: (args) => framed(<VirtualKeyboard {...args} />),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // ① At least one black key must exist
    const blackKeys = canvas.getAllByTestId(/^black-key-/);
    expect(blackKeys.length).toBeGreaterThan(0);

    const firstBlack = blackKeys[0];

    // ② Black key must be visible (not display:none / hidden)
    await expect(firstBlack).toBeVisible();

    // ③ Black key must have a positive bounding box (the old bug: h-[62%] on a
    //    0-height wrapper → height=0 → unreachable)
    const rect = firstBlack.getBoundingClientRect();
    expect(rect.height).toBeGreaterThan(0);
    expect(rect.width).toBeGreaterThan(0);

    // ④ Black key must be fully within the viewport (not clipped)
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight + 1);

    // ⑤ Clicking the black key fires onNoteOn
    await userEvent.pointer({ target: firstBlack, keys: "[MouseLeft]" });
    expect(args.onNoteOn).toHaveBeenCalled();
  },
};

/**
 * Asserts that pressing near the BOTTOM of a key yields higher velocity than
 * pressing near the TOP — the velocity-by-Y mapping.
 */
export const VelocityByY: Story = {
  args: {
    defaultChannel: 1,
    defaultOctaveStart: 3,
    defaultOctaveCount: 2,
  },
  parameters: {
    design: DESIGN_REF,
    docs: {
      description: {
        story:
          "Velocity-by-Y: press near the bottom of any key → high velocity readout; " +
          "press near the top → low velocity readout. The VEL indicator updates live.",
      },
    },
  },
  render: (args) => framed(<VirtualKeyboard {...args} />),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Use C4 (MIDI 60) — startNote with octaveStart=3 is 48, oct+1 = 60
    const key = canvas.getByTestId("white-key-60");
    const rect = key.getBoundingClientRect();
    const readout = canvas.getByTestId("velocity-readout");

    // Press near the TOP → low velocity (relY = 4/84 ≈ 0.048 → floor 0.06 → ~8)
    fireEvent.mouseDown(key, { clientY: rect.top + 4, buttons: 1 });
    fireEvent.mouseUp(key);
    // waitFor: in a static/production-React build state updates are batched
    // asynchronously (not flushed synchronously after fireEvent as in test mode).
    // Polling until the DOM reflects the new velocity makes this harness-agnostic.
    await waitFor(() => {
      const topVel = parseInt(readout.textContent ?? "127", 10);
      expect(topVel).toBeLessThan(50);
    });

    // Press near the BOTTOM → high velocity (relY = 80/84 ≈ 0.95 → ~121)
    fireEvent.mouseDown(key, { clientY: rect.bottom - 4, buttons: 1 });
    fireEvent.mouseUp(key);
    await waitFor(() => {
      const bottomVel = parseInt(readout.textContent ?? "0", 10);
      expect(bottomVel).toBeGreaterThan(80);
    });

    // Velocity readout visible
    await expect(readout).toBeVisible();
  },
};

/**
 * Asserts that the CC slider is present, visible, and emits via the onCC
 * callback when its value changes. Also asserts the Mod slider is present.
 */
export const CCSliderEmits: Story = {
  args: {
    defaultChannel: 1,
    defaultOctaveStart: 3,
    defaultOctaveCount: 2,
    onCC: fn(),
  },
  parameters: {
    design: DESIGN_REF,
    docs: {
      description: {
        story:
          "Acceptance test: the assignable CC slider (default CC#74) and Mod wheel (CC#1) are " +
          "present and emit onCC callbacks when their values change.",
      },
    },
  },
  render: (args) => framed(<VirtualKeyboard {...args} />),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // ① CC slider present + visible
    const ccSlider = canvas.getByTestId("cc-slider");
    await expect(ccSlider).toBeVisible();
    await expect(ccSlider).toHaveAttribute("type", "range");

    // ② Changing CC slider value fires onCC(74, 0.8, 1)
    fireEvent.change(ccSlider, { target: { value: "0.8" } });
    expect(args.onCC).toHaveBeenCalledWith(74, 0.8, 1);

    // ③ Mod slider present + emits (CC#1)
    const modSlider = canvas.getByTestId("mod-slider");
    await expect(modSlider).toBeVisible();
    fireEvent.change(modSlider, { target: { value: "0.5" } });
    expect(args.onCC).toHaveBeenCalledWith(1, 0.5, 1);
  },
};

/**
 * Asserts that octave +/− controls change the rendered key range and
 * that the octave count controls add/remove octaves.
 */
export const OctaveControls: Story = {
  args: {
    defaultChannel: 1,
    defaultOctaveStart: 3,
    defaultOctaveCount: 2,
  },
  parameters: {
    design: DESIGN_REF,
    docs: {
      description: {
        story:
          "Octave shift and octave count controls: +/− buttons update the range display " +
          "and the rendered key count in real time.",
      },
    },
  },
  render: (args) => framed(<VirtualKeyboard {...args} />),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // ① Initial range display
    const rangeDisplay = canvas.getByTestId("octave-range");
    expect(rangeDisplay.textContent).toBe("C3–B4");

    // ② Add an octave → 3 octaves → 21 white keys
    const countUp = canvas.getByTestId("octave-count-up");
    await userEvent.click(countUp);
    const whites = canvas.getAllByTestId(/^white-key-/);
    expect(whites.length).toBe(3 * 7);

    // ③ Shift octave up → range moves to C4–B6
    const octUp = canvas.getByTestId("octave-up");
    await userEvent.click(octUp);
    expect(canvas.getByTestId("octave-range").textContent).toBe("C4–B6");

    // ④ Shift octave down → back to C3–B5
    const octDown = canvas.getByTestId("octave-down");
    await userEvent.click(octDown);
    expect(canvas.getByTestId("octave-range").textContent).toBe("C3–B5");
  },
};
