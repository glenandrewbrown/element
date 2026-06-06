/**
 * Tests for <ParamConfigPopover /> — per-block parameter-presence editor.
 *
 * G1: the per-param control is the square recessed LED toggle (role="switch")
 * — lit amber dot = shown, dark = hidden — replacing the old iOS-style track
 * switch. The store's optimistic `hiddenParams` update is what we observe
 * (the native bridge no-ops in jsdom, same as Storybook).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ParamConfigPopover } from "../ParamConfigPopover";
import { useGraphStore } from "../../../stores/useGraphStore";
import type { BlockData, Port } from "../../../data/types";

const NODE_ID = "n1";

const PARAM_PORTS: Port[] = [
  { id: "in-l", type: "audio", direction: "input", label: "In L", connected: true },
  { id: "p-mix", type: "value", direction: "input", label: "Mix", connected: false },
  { id: "p-fb", type: "value", direction: "input", label: "Feedback", connected: true },
  { id: "p-density", type: "value", direction: "input", label: "Density", connected: false },
];

function makeNode(over: Partial<BlockData> = {}): BlockData {
  return {
    id: NODE_ID,
    name: "ValhallaDelay",
    category: "audiofx",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: PARAM_PORTS,
    cpuLoad: 0,
    latencyMs: 0,
    bypassed: false,
    error: false,
    isMacroTagged: false,
    hiddenParams: [],
    ...over,
  } as BlockData;
}

beforeEach(() => {
  useGraphStore.setState({ nodes: [makeNode()] });
});

describe("<ParamConfigPopover /> — G1 LED toggles", () => {
  it("renders one role=switch per VALUE port only (audio ports excluded)", () => {
    render(<ParamConfigPopover nodeId={NODE_ID} accent="#E8A838" />);
    expect(screen.getAllByRole("switch")).toHaveLength(3);
    expect(screen.queryByText("In L")).not.toBeInTheDocument();
  });

  it("switch state mirrors hiddenParams (aria-checked)", () => {
    useGraphStore.setState({
      nodes: [makeNode({ hiddenParams: ["p-density"] })],
    });
    render(<ParamConfigPopover nodeId={NODE_ID} accent="#E8A838" />);
    const densityRow = screen.getByText("Density").closest("div")!;
    expect(within(densityRow).getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    const mixRow = screen.getByText("Mix").closest("div")!;
    expect(within(mixRow).getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("clicking a lit switch hides the param (optimistic store update)", async () => {
    render(<ParamConfigPopover nodeId={NODE_ID} accent="#E8A838" />);
    const mixRow = screen.getByText("Mix").closest("div")!;
    fireEvent.click(within(mixRow).getByRole("switch"));
    await waitFor(() =>
      expect(
        useGraphStore.getState().nodes.find((n) => n.id === NODE_ID)
          ?.hiddenParams,
      ).toContain("p-mix"),
    );
  });

  it("switches carry an accessible Show/Hide name", () => {
    useGraphStore.setState({
      nodes: [makeNode({ hiddenParams: ["p-density"] })],
    });
    render(<ParamConfigPopover nodeId={NODE_ID} accent="#E8A838" />);
    expect(
      screen.getByRole("switch", { name: "Hide Mix" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Show Density" }),
    ).toBeInTheDocument();
  });

  it("Hide all hides every param port", async () => {
    render(<ParamConfigPopover nodeId={NODE_ID} accent="#E8A838" />);
    fireEvent.click(screen.getByRole("button", { name: /hide all/i }));
    await waitFor(() =>
      expect(
        useGraphStore.getState().nodes.find((n) => n.id === NODE_ID)
          ?.hiddenParams,
      ).toEqual(expect.arrayContaining(["p-mix", "p-fb", "p-density"])),
    );
  });
});
