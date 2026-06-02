import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Store mocks ───────────────────────────────────────────────────────────────

const mockToggleMinimap = vi.fn();
const mockSelectNode = vi.fn();
const mockSetNodes = vi.fn();
const mockFitView = vi.fn();
const mockZoomIn = vi.fn();
const mockZoomOut = vi.fn();
const mockNativeCommentAdd = vi.fn();
const mockNativePasteNodes = vi.fn();
const mockNativeSetCanvasOptions = vi.fn();

let storeState = {
  nodes: [{ id: "n1" }, { id: "n2" }],
  minimapVisible: false,
  toggleMinimap: mockToggleMinimap,
  selectNode: mockSelectNode,
};

let hostExtrasState = {
  canvas: { snapToGrid: false, gridSize: 16 },
};

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    setNodes: mockSetNodes,
    fitView: mockFitView,
    zoomIn: mockZoomIn,
    zoomOut: mockZoomOut,
  }),
}));

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((sel: (s: unknown) => unknown) => sel(storeState)),
}));

vi.mock("../../../stores/useHostExtrasStore", () => ({
  useHostExtrasStore: vi.fn((sel: (s: unknown) => unknown) => sel(hostExtrasState)),
}));

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGraphCommentAdd: (...a: unknown[]) => mockNativeCommentAdd(...a),
  nativeGraphPasteNodes: () => mockNativePasteNodes(),
  nativeGraphSetCanvasOptions: (...a: unknown[]) => mockNativeSetCanvasOptions(...a),
}));

vi.mock("../../neu", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

import { CanvasContextMenu } from "../CanvasContextMenu";

const defaultProps = {
  position: { x: 200, y: 150 },
  flowPosition: { x: 400, y: 300 },
  onAddBlock: vi.fn(),
  onClose: vi.fn(),
};

describe("CanvasContextMenu — renders", () => {
  beforeEach(() => {
    storeState = {
      nodes: [{ id: "n1" }, { id: "n2" }],
      minimapVisible: false,
      toggleMinimap: mockToggleMinimap,
      selectNode: mockSelectNode,
    };
    hostExtrasState = { canvas: { snapToGrid: false, gridSize: 16 } };
    vi.clearAllMocks();
  });

  it("shows block count in header", () => {
    render(<CanvasContextMenu {...defaultProps} />);
    expect(screen.getByText("2 blocks")).toBeInTheDocument();
  });

  it("shows singular 'block' for 1 node", () => {
    storeState = { ...storeState, nodes: [{ id: "n1" }] };
    render(<CanvasContextMenu {...defaultProps} />);
    expect(screen.getByText("1 block")).toBeInTheDocument();
  });

  it("shows '0 blocks' with empty board", () => {
    storeState = { ...storeState, nodes: [] };
    render(<CanvasContextMenu {...defaultProps} />);
    expect(screen.getByText("0 blocks")).toBeInTheDocument();
  });

  it("renders all expected menu items", () => {
    render(<CanvasContextMenu {...defaultProps} />);
    expect(screen.getByText("Add Block…")).toBeInTheDocument();
    expect(screen.getByText("Add Comment Box")).toBeInTheDocument();
    expect(screen.getByText("Paste")).toBeInTheDocument();
    expect(screen.getByText("Select All Blocks")).toBeInTheDocument();
    expect(screen.getByText("Fit to View")).toBeInTheDocument();
    expect(screen.getByText("Zoom In")).toBeInTheDocument();
    expect(screen.getByText("Zoom Out")).toBeInTheDocument();
    expect(screen.getByText("Snap to Grid")).toBeInTheDocument();
    expect(screen.getByText("Minimap")).toBeInTheDocument();
    expect(screen.getByText("Auto-Layout…")).toBeInTheDocument();
  });

  it("has role=menu with aria-label", () => {
    render(<CanvasContextMenu {...defaultProps} />);
    expect(screen.getByRole("menu")).toHaveAttribute("aria-label", "Canvas menu");
  });
});

describe("CanvasContextMenu — Add Block", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls onAddBlock on click", () => {
    const onAddBlock = vi.fn();
    render(<CanvasContextMenu {...defaultProps} onAddBlock={onAddBlock} />);
    fireEvent.click(screen.getByText("Add Block…"));
    expect(onAddBlock).toHaveBeenCalled();
  });
});

describe("CanvasContextMenu — Add Comment Box", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls nativeGraphCommentAdd centred on flowPosition and closes", () => {
    const onClose = vi.fn();
    render(<CanvasContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Add Comment Box"));
    // Centre offset: flowPosition.x - 120, flowPosition.y - 80
    expect(mockNativeCommentAdd).toHaveBeenCalledWith(280, 220);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("CanvasContextMenu — Paste", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls nativeGraphPasteNodes and closes", () => {
    const onClose = vi.fn();
    render(<CanvasContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Paste"));
    expect(mockNativePasteNodes).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("CanvasContextMenu — Select All Blocks", () => {
  beforeEach(() => {
    storeState = {
      nodes: [{ id: "n1" }, { id: "n2" }],
      minimapVisible: false,
      toggleMinimap: mockToggleMinimap,
      selectNode: mockSelectNode,
    };
    vi.clearAllMocks();
  });

  it("disabled when no blocks on board", () => {
    storeState = { ...storeState, nodes: [] };
    render(<CanvasContextMenu {...defaultProps} />);
    const btn = screen.getByText("Select All Blocks").closest("button");
    expect(btn).toBeDisabled();
  });

  it("calls setNodes + selectNode and closes when blocks present", () => {
    mockSetNodes.mockImplementation((fn: (nds: unknown[]) => unknown[]) => {
      fn([
        { id: "n1", type: "block", selected: false },
        { id: "n2", type: "block", selected: false },
      ]);
    });
    const onClose = vi.fn();
    render(<CanvasContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Select All Blocks"));
    expect(mockSetNodes).toHaveBeenCalled();
    expect(mockSelectNode).toHaveBeenCalledWith("n1");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("CanvasContextMenu — View actions", () => {
  beforeEach(() => {
    storeState = {
      nodes: [{ id: "n1" }],
      minimapVisible: false,
      toggleMinimap: mockToggleMinimap,
      selectNode: mockSelectNode,
    };
    vi.clearAllMocks();
  });

  it("Fit to View calls fitView and closes", () => {
    const onClose = vi.fn();
    render(<CanvasContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Fit to View"));
    expect(mockFitView).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("Fit to View disabled with no blocks", () => {
    storeState = { ...storeState, nodes: [] };
    render(<CanvasContextMenu {...defaultProps} />);
    const btn = screen.getByText("Fit to View").closest("button");
    expect(btn).toBeDisabled();
  });

  it("Zoom In calls zoomIn and closes", () => {
    const onClose = vi.fn();
    render(<CanvasContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Zoom In"));
    expect(mockZoomIn).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("Zoom Out calls zoomOut and closes", () => {
    const onClose = vi.fn();
    render(<CanvasContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Zoom Out"));
    expect(mockZoomOut).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("CanvasContextMenu — Canvas toggles", () => {
  beforeEach(() => {
    storeState = {
      nodes: [{ id: "n1" }],
      minimapVisible: false,
      toggleMinimap: mockToggleMinimap,
      selectNode: mockSelectNode,
    };
    hostExtrasState = { canvas: { snapToGrid: false, gridSize: 16 } };
    vi.clearAllMocks();
  });

  it("Snap to Grid calls nativeGraphSetCanvasOptions toggling snapToGrid and closes", () => {
    const onClose = vi.fn();
    render(<CanvasContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Snap to Grid"));
    expect(mockNativeSetCanvasOptions).toHaveBeenCalledWith(true, 16);
    expect(onClose).toHaveBeenCalled();
  });

  it("Snap to Grid turns off when currently enabled", () => {
    hostExtrasState = { canvas: { snapToGrid: true, gridSize: 32 } };
    const onClose = vi.fn();
    render(<CanvasContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Snap to Grid"));
    expect(mockNativeSetCanvasOptions).toHaveBeenCalledWith(false, 32);
  });

  it("Minimap calls toggleMinimap and closes", () => {
    const onClose = vi.fn();
    render(<CanvasContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Minimap"));
    expect(mockToggleMinimap).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("Auto-Layout… is disabled", () => {
    render(<CanvasContextMenu {...defaultProps} />);
    const btn = screen.getByText("Auto-Layout…").closest("button");
    expect(btn).toBeDisabled();
  });
});

describe("CanvasContextMenu — keyboard + outside-click dismiss", () => {
  beforeEach(() => {
    storeState = {
      nodes: [],
      minimapVisible: false,
      toggleMinimap: mockToggleMinimap,
      selectNode: mockSelectNode,
    };
    vi.clearAllMocks();
  });

  it("Escape key calls onClose", () => {
    const onClose = vi.fn();
    render(<CanvasContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("mousedown outside menu calls onClose", () => {
    const onClose = vi.fn();
    render(<CanvasContextMenu {...defaultProps} onClose={onClose} />);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });
});
