import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockToggleBypass = vi.fn();
const mockToggleMute = vi.fn();
const mockToggleMuteInput = vi.fn();
const mockAlignSelectedNodes = vi.fn();
const mockDistributeSelectedNodes = vi.fn();
const mockNativeDuplicate = vi.fn();
const mockNativeRemove = vi.fn();
const mockNativeRename = vi.fn();

const baseNode = {
  id: "node-1",
  name: "Surge XT",
  bypassed: false,
  muted: false,
  muteInput: false,
};

let storeNodes = [baseNode];
let mockGetNodes: () => unknown[] = () => [{ id: "node-1", selected: true, type: "block" }];

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({ getNodes: () => mockGetNodes() }),
}));

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({
      nodes: storeNodes,
      toggleBypass: mockToggleBypass,
      toggleMute: mockToggleMute,
      toggleMuteInput: mockToggleMuteInput,
      alignSelectedNodes: mockAlignSelectedNodes,
      distributeSelectedNodes: mockDistributeSelectedNodes,
    })
  ),
}));

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGraphDuplicateNodes: (...a: unknown[]) => mockNativeDuplicate(...a),
  nativeGraphRemoveNode: (...a: unknown[]) => mockNativeRemove(...a),
  nativeGraphRenameNode: (...a: unknown[]) => mockNativeRename(...a),
}));

vi.mock("../../neu", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

import { NodeContextMenu } from "../NodeContextMenu";

const defaultProps = {
  nodeId: "node-1",
  position: { x: 100, y: 100 },
  onClose: vi.fn(),
};

describe("NodeContextMenu — renders nothing for unknown node", () => {
  beforeEach(() => {
    storeNodes = [];
    vi.clearAllMocks();
  });

  it("returns null when nodeId not found", () => {
    const { container } = render(<NodeContextMenu {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("NodeContextMenu — basic actions", () => {
  beforeEach(() => {
    storeNodes = [baseNode];
    mockGetNodes = () => [{ id: "node-1", selected: true, type: "block" }];
    vi.clearAllMocks();
  });

  it("shows node name in header", () => {
    render(<NodeContextMenu {...defaultProps} />);
    expect(screen.getByText("Surge XT")).toBeInTheDocument();
  });

  it("shows Bypass option", () => {
    render(<NodeContextMenu {...defaultProps} />);
    expect(screen.getByText("Bypass")).toBeInTheDocument();
  });

  it("shows Enable when node is bypassed", () => {
    storeNodes = [{ ...baseNode, bypassed: true }];
    render(<NodeContextMenu {...defaultProps} />);
    expect(screen.getByText("Enable")).toBeInTheDocument();
  });

  it("clicking Bypass calls toggleBypass and closes", () => {
    const onClose = vi.fn();
    render(<NodeContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Bypass"));
    expect(mockToggleBypass).toHaveBeenCalledWith("node-1");
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking Mute calls toggleMute and closes", () => {
    const onClose = vi.fn();
    render(<NodeContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Mute"));
    expect(mockToggleMute).toHaveBeenCalledWith("node-1");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows Unmute when node is muted", () => {
    storeNodes = [{ ...baseNode, muted: true }];
    render(<NodeContextMenu {...defaultProps} />);
    expect(screen.getByText("Unmute")).toBeInTheDocument();
  });

  it("clicking Mute Input calls toggleMuteInput", () => {
    const onClose = vi.fn();
    render(<NodeContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Mute Input"));
    expect(mockToggleMuteInput).toHaveBeenCalledWith("node-1");
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking Duplicate calls nativeGraphDuplicateNodes", () => {
    const onClose = vi.fn();
    render(<NodeContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Duplicate"));
    expect(mockNativeDuplicate).toHaveBeenCalledWith(["node-1"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking Delete calls nativeGraphRemoveNode", () => {
    const onClose = vi.fn();
    render(<NodeContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Delete"));
    expect(mockNativeRemove).toHaveBeenCalledWith("node-1");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("NodeContextMenu — rename flow", () => {
  beforeEach(() => {
    storeNodes = [baseNode];
    mockGetNodes = () => [{ id: "node-1", selected: true, type: "block" }];
    vi.clearAllMocks();
  });

  it("clicking Rename shows an input pre-filled with node name", () => {
    render(<NodeContextMenu {...defaultProps} />);
    fireEvent.click(screen.getByText("Rename"));
    const input = screen.getByDisplayValue("Surge XT");
    expect(input).toBeInTheDocument();
  });

  it("submitting rename calls nativeGraphRenameNode", () => {
    const onClose = vi.fn();
    render(<NodeContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Rename"));
    const input = screen.getByDisplayValue("Surge XT");
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockNativeRename).toHaveBeenCalledWith("node-1", "New Name");
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape from rename closes without saving", () => {
    const onClose = vi.fn();
    render(<NodeContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Rename"));
    const input = screen.getByDisplayValue("Surge XT");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(mockNativeRename).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("empty rename does not call nativeGraphRenameNode", () => {
    const onClose = vi.fn();
    render(<NodeContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Rename"));
    const input = screen.getByDisplayValue("Surge XT");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockNativeRename).not.toHaveBeenCalled();
  });
});

describe("NodeContextMenu — multi-select align/distribute", () => {
  beforeEach(() => {
    storeNodes = [baseNode];
    mockGetNodes = () => [
      { id: "node-1", selected: true, type: "block" },
      { id: "node-2", selected: true, type: "block" },
    ];
    vi.clearAllMocks();
  });

  it("shows Align section when 2+ blocks selected", () => {
    render(<NodeContextMenu {...defaultProps} />);
    expect(screen.getByText(/^Align \(\d+\)$/)).toBeInTheDocument();
  });

  it("shows Distribute section when 2+ blocks selected", () => {
    render(<NodeContextMenu {...defaultProps} />);
    expect(screen.getByText(/^Distribute$/)).toBeInTheDocument();
  });

  it("clicking Align Left calls alignSelectedNodes with 'left'", () => {
    const onClose = vi.fn();
    render(<NodeContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Align Left"));
    expect(mockAlignSelectedNodes).toHaveBeenCalledWith("left", ["node-1", "node-2"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking Align Top calls alignSelectedNodes with 'top'", () => {
    const onClose = vi.fn();
    render(<NodeContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Align Top"));
    expect(mockAlignSelectedNodes).toHaveBeenCalledWith("top", ["node-1", "node-2"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("distribute buttons disabled with only 2 nodes", () => {
    render(<NodeContextMenu {...defaultProps} />);
    const hBtn = screen.getByText("Distribute Horizontally").closest("button");
    expect(hBtn).toBeDisabled();
  });
});

describe("NodeContextMenu — distribute enabled at 3+ nodes", () => {
  beforeEach(() => {
    storeNodes = [baseNode];
    mockGetNodes = () => [
      { id: "node-1", selected: true, type: "block" },
      { id: "node-2", selected: true, type: "block" },
      { id: "node-3", selected: true, type: "block" },
    ];
    vi.clearAllMocks();
  });

  it("distribute buttons enabled with 3 nodes", () => {
    const onClose = vi.fn();
    render(<NodeContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Distribute Horizontally"));
    expect(mockDistributeSelectedNodes).toHaveBeenCalledWith(
      "horizontal",
      ["node-1", "node-2", "node-3"]
    );
  });
});

describe("NodeContextMenu — keyboard dismiss", () => {
  beforeEach(() => {
    storeNodes = [baseNode];
    mockGetNodes = () => [{ id: "node-1", selected: true, type: "block" }];
    vi.clearAllMocks();
  });

  it("Escape key calls onClose", () => {
    const onClose = vi.fn();
    render(<NodeContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
