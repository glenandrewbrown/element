import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockCloseTab = vi.fn();
const mockSelectNode = vi.fn();

let openTabs: string[] = [];
let selectedNodeId: string | null = null;
let nodes: Array<{ id: string; name: string }> = [];

vi.mock("../../../stores/useAppStore", () => ({
  useAppStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({ openBlockTabs: openTabs, closeBlockTab: mockCloseTab })
  ),
}));

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({ selectedNodeId, selectNode: mockSelectNode, nodes })
  ),
}));

vi.mock("../../neu", () => ({
  Icon: ({ name, "aria-label": label }: { name: string; "aria-label"?: string }) => (
    <span data-testid={`icon-${name}`} aria-label={label} />
  ),
}));

import { BlockTabStrip } from "../BlockTabStrip";

describe("BlockTabStrip — empty state", () => {
  beforeEach(() => {
    openTabs = [];
    selectedNodeId = null;
    nodes = [];
    vi.clearAllMocks();
  });

  it("renders nothing when no tabs open", () => {
    const { container } = render(<BlockTabStrip />);
    expect(container.firstChild).toBeNull();
  });
});

describe("BlockTabStrip — with tabs", () => {
  beforeEach(() => {
    openTabs = ["block-1", "block-2"];
    selectedNodeId = "block-1";
    nodes = [
      { id: "block-1", name: "Surge XT" },
      { id: "block-2", name: "Reverb X" },
    ];
    vi.clearAllMocks();
  });

  it("renders a tab for each open block", () => {
    render(<BlockTabStrip />);
    expect(screen.getByText("Surge XT")).toBeInTheDocument();
    expect(screen.getByText("Reverb X")).toBeInTheDocument();
  });

  it("falls back to id when node not found in store", () => {
    nodes = [{ id: "block-1", name: "Surge XT" }];
    render(<BlockTabStrip />);
    expect(screen.getByText("block-2")).toBeInTheDocument();
  });

  it("clicking a tab calls selectNode", () => {
    render(<BlockTabStrip />);
    fireEvent.click(screen.getByText("Surge XT"));
    expect(mockSelectNode).toHaveBeenCalledWith("block-1");
  });

  it("clicking close button calls closeBlockTab", () => {
    render(<BlockTabStrip />);
    const closeBtn = screen.getAllByTitle(/Close/)[0];
    fireEvent.click(closeBtn);
    expect(mockCloseTab).toHaveBeenCalledWith("block-1");
  });

  it("close button click does not propagate to tab click", () => {
    render(<BlockTabStrip />);
    const closeBtn = screen.getAllByTitle(/Close/)[0];
    fireEvent.click(closeBtn);
    expect(mockSelectNode).not.toHaveBeenCalled();
  });

  it("active tab gets the expected active style class", () => {
    render(<BlockTabStrip />);
    const activeTab = screen.getByText("Surge XT").closest("div");
    expect(activeTab?.className).toContain("text-accent-blue");
  });

  it("inactive tab does not get active style class", () => {
    render(<BlockTabStrip />);
    const inactiveTab = screen.getByText("Reverb X").closest("div");
    expect(inactiveTab?.className).not.toContain("text-accent-blue");
  });
});
