/**
 * T5 — InlineFace + InlineChooserRow behaviour:
 *   • opChooser writes nativeNodeSetIntMode + renders from d.intMode
 *   • stepper advances/wraps the mode
 *   • Blender CV-swap: a connected Value/CV port renders the param-port chip
 *     instead of the editable widget.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const setIntMode = vi.fn((_nodeId: string, _mode: number) => Promise.resolve(true));
const setParam = vi.fn(
  (_nodeId: string, _idx: number, _v: number) => Promise.resolve(true),
);
vi.mock("../../../bridge/nativeGraph", () => ({
  nativeNodeSetIntMode: (nodeId: string, mode: number) =>
    setIntMode(nodeId, mode),
  nativeSetNodeParameter: (nodeId: string, idx: number, v: number) =>
    setParam(nodeId, idx, v),
}));

import type { BlockData } from "../../../data/types";
import { InlineFace } from "../inline/InlineFace";
import type { InlineFaceSpec } from "../inlineParams";
import { getInlineFaceSpec } from "../inlineParams";

function makeData(overrides: Partial<BlockData> = {}): BlockData {
  return {
    id: "node-1",
    name: "Comparator",
    category: "modulator",
    format: "INT",
    identifier: "element.compare",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 0,
    latencyMs: 0,
    bypassed: false,
    error: false,
    isMacroTagged: false,
    ...overrides,
  };
}

describe("InlineFace opChooser (compare)", () => {
  beforeEach(() => {
    setIntMode.mockClear();
  });

  it("renders the current op from d.intMode (engine truth)", () => {
    const spec = getInlineFaceSpec("element.compare")!;
    render(<InlineFace d={makeData({ intMode: 2 })} spec={spec} meta={[]} />);
    // intMode 2 → "<"
    expect(screen.getByTestId("inline-chooser")).toHaveAttribute(
      "data-value",
      "2",
    );
    expect(screen.getByText("<")).toBeInTheDocument();
  });

  it("clicking next advances the op and writes nativeNodeSetIntMode", () => {
    const spec = getInlineFaceSpec("element.compare")!;
    render(<InlineFace d={makeData({ intMode: 0 })} spec={spec} meta={[]} />);
    fireEvent.click(screen.getByLabelText("Next"));
    expect(setIntMode).toHaveBeenCalledWith("node-1", 1);
  });

  it("next wraps from the last op back to the first", () => {
    const spec = getInlineFaceSpec("element.compare")!;
    render(<InlineFace d={makeData({ intMode: 5 })} spec={spec} meta={[]} />);
    fireEvent.click(screen.getByLabelText("Next"));
    expect(setIntMode).toHaveBeenCalledWith("node-1", 0);
  });

  it("prev steps back and wraps from the first to the last", () => {
    const spec = getInlineFaceSpec("element.compare")!;
    render(<InlineFace d={makeData({ intMode: 0 })} spec={spec} meta={[]} />);
    fireEvent.click(screen.getByLabelText("Previous"));
    expect(setIntMode).toHaveBeenCalledWith("node-1", 5);
  });

  it("opening the popover and choosing an option writes that value", () => {
    const spec = getInlineFaceSpec("element.logic")!;
    render(
      <InlineFace
        d={makeData({ identifier: "element.logic", intMode: 0 })}
        spec={spec}
        meta={[]}
      />,
    );
    // open
    fireEvent.click(screen.getByRole("button", { name: /Mode/ }));
    const xor = screen.getByRole("option", { name: "XOR" });
    fireEvent.click(xor);
    expect(setIntMode).toHaveBeenCalledWith("node-1", 2);
  });
});

describe("InlineFace Blender CV-swap", () => {
  const knobSpec: InlineFaceSpec = {
    entries: [
      { kind: "knob", paramIndex: 0, expectName: "Gain", portId: "cv-gain" },
    ],
  };

  it("renders the editable knob when the param port is NOT connected", () => {
    const d = makeData({
      identifier: "element.fake",
      ports: [
        {
          id: "cv-gain",
          type: "value",
          direction: "input",
          label: "Gain",
          connected: false,
        },
      ],
    });
    render(
      <InlineFace
        d={d}
        spec={knobSpec}
        meta={[{ index: 0, name: "Gain", value: 0.5, defaultValue: 0.5 }]}
      />,
    );
    expect(screen.getByTestId("inline-knob")).toBeInTheDocument();
    expect(screen.queryByTestId("inline-portchip")).not.toBeInTheDocument();
  });

  it("renders the param-port chip when that Value/CV port IS connected", () => {
    const d = makeData({
      identifier: "element.fake",
      ports: [
        {
          id: "cv-gain",
          type: "value",
          direction: "input",
          label: "Gain",
          connected: true,
        },
      ],
    });
    render(
      <InlineFace
        d={d}
        spec={knobSpec}
        meta={[{ index: 0, name: "Gain", value: 0.5, defaultValue: 0.5 }]}
      />,
    );
    expect(screen.getByTestId("inline-portchip")).toBeInTheDocument();
    expect(screen.queryByTestId("inline-knob")).not.toBeInTheDocument();
  });
});
