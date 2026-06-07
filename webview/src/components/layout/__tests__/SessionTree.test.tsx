/**
 * SessionTree tests — empty state, graph listing, dirty indicator, file name,
 * activate graph, outline expand/collapse, and mount-time bridge fetch.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionTree } from "../SessionTree";
import { useSessionStore } from "../../../stores/useSessionStore";
import { useHostExtrasStore } from "../../../stores/useHostExtrasStore";

// ── bridge mocks ─────────────────────────────────────────────────────────────

vi.mock("../../../bridge/nativeSession", () => ({
  nativeSessionSetActiveGraph: vi.fn(async () => undefined),
}));

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeSessionGetGraphTree: vi.fn(async () => []),
  nativeSessionRenameGraph: vi.fn(async () => true),
}));

import { nativeSessionSetActiveGraph } from "../../../bridge/nativeSession";
import {
  nativeSessionGetGraphTree,
  nativeSessionRenameGraph,
} from "../../../bridge/nativeGraph";

const mockSetActive = nativeSessionSetActiveGraph as ReturnType<typeof vi.fn>;
const mockGetTree = nativeSessionGetGraphTree as ReturnType<typeof vi.fn>;
const mockRename = nativeSessionRenameGraph as ReturnType<typeof vi.fn>;

// ── store helpers ─────────────────────────────────────────────────────────────

function resetStores() {
  mockSetActive.mockReset();
  mockGetTree.mockReset();
  mockRename.mockReset();
  mockRename.mockResolvedValue(true);
  mockGetTree.mockResolvedValue([]);
  useSessionStore.setState({
    sessionLoaded: false,
    filePath: "",
    dirty: false,
    recentFiles: [],
    graphs: [],
  });
  useHostExtrasStore.setState((s) => ({ ...s, activeGraphOutline: [] }));
}

beforeEach(resetStores);
afterEach(() => vi.restoreAllMocks());

// ── empty state ───────────────────────────────────────────────────────────────

describe("empty state", () => {
  it("shows 'No Boards in this Project.' when graphs array is empty", () => {
    render(<SessionTree />);
    expect(screen.getByText("No Boards in this Project.")).toBeInTheDocument();
  });

  it("shows '0 boards' in header when empty", () => {
    render(<SessionTree />);
    expect(screen.getByText("0 boards")).toBeInTheDocument();
  });

  it("shows 'Untitled' when filePath is empty", () => {
    render(<SessionTree />);
    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });
});

// ── file name ─────────────────────────────────────────────────────────────────

describe("file name display", () => {
  it("shows filename from filePath", () => {
    useSessionStore.setState((s) => ({
      ...s,
      filePath: "/Users/glen/Music/MyProject.elg",
    }));
    render(<SessionTree />);
    expect(screen.getByText("MyProject.elg")).toBeInTheDocument();
  });

  it("shows dirty indicator (•) when dirty=true", () => {
    useSessionStore.setState((s) => ({ ...s, dirty: true }));
    render(<SessionTree />);
    expect(screen.getByText("•")).toBeInTheDocument();
  });

  it("does not show dirty indicator when dirty=false", () => {
    useSessionStore.setState((s) => ({ ...s, dirty: false }));
    render(<SessionTree />);
    expect(screen.queryByText("•")).not.toBeInTheDocument();
  });
});

// ── graph list ────────────────────────────────────────────────────────────────

describe("graph list", () => {
  const graphs = [
    { id: "g1", name: "Main Board", index: 0, active: true },
    { id: "g2", name: "FX Board", index: 1, active: false },
  ];

  beforeEach(() => {
    useSessionStore.setState((s) => ({ ...s, graphs }));
  });

  it("renders graph names", () => {
    render(<SessionTree />);
    expect(screen.getByText("Main Board")).toBeInTheDocument();
    expect(screen.getByText("FX Board")).toBeInTheDocument();
  });

  it("shows '2 boards' count in header", () => {
    render(<SessionTree />);
    expect(screen.getByText("2 boards")).toBeInTheDocument();
  });

  it("shows '1 board' (singular) for single graph", () => {
    useSessionStore.setState((s) => ({
      ...s,
      graphs: [{ id: "g1", name: "Root", index: 0, active: true }],
    }));
    render(<SessionTree />);
    expect(screen.getByText("1 board")).toBeInTheDocument();
  });

  it("shows 'Open' button for inactive graphs", () => {
    render(<SessionTree />);
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
  });

  it("calls nativeSessionSetActiveGraph when Open button clicked", async () => {
    render(<SessionTree />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() =>
      expect(mockSetActive).toHaveBeenCalledWith(1),
    );
  });

  it("calls nativeSessionSetActiveGraph on double-click of inactive row", async () => {
    render(<SessionTree />);
    fireEvent.doubleClick(screen.getByText("FX Board").closest("div")!);
    await waitFor(() =>
      expect(mockSetActive).toHaveBeenCalledWith(1),
    );
  });

  it("does NOT call nativeSessionSetActiveGraph on double-click of active row", async () => {
    render(<SessionTree />);
    fireEvent.doubleClick(screen.getByText("Main Board").closest("div")!);
    // Give async time to settle
    await new Promise((r) => setTimeout(r, 20));
    expect(mockSetActive).not.toHaveBeenCalled();
  });
});

// ── mount-time bridge fetch ───────────────────────────────────────────────────

describe("mount-time nativeSessionGetGraphTree", () => {
  it("calls nativeSessionGetGraphTree on mount", async () => {
    render(<SessionTree />);
    await waitFor(() => expect(mockGetTree).toHaveBeenCalledOnce());
  });

  it("hydrates store when tree returns non-empty list", async () => {
    mockGetTree.mockResolvedValue([
      { id: "100", name: "Live Board", index: 0, active: true },
    ]);
    render(<SessionTree />);
    await waitFor(() =>
      expect(useSessionStore.getState().graphs).toHaveLength(1),
    );
    expect(useSessionStore.getState().graphs[0].name).toBe("Live Board");
  });

  it("does not overwrite store when tree returns empty array", async () => {
    useSessionStore.setState((s) => ({
      ...s,
      graphs: [{ id: "existing", name: "Existing", index: 0, active: true }],
    }));
    mockGetTree.mockResolvedValue([]);
    render(<SessionTree />);
    await waitFor(() => expect(mockGetTree).toHaveBeenCalledOnce());
    // Should keep the pre-existing store state
    expect(useSessionStore.getState().graphs).toHaveLength(1);
  });

  it("silently swallows bridge error (dev mode)", async () => {
    mockGetTree.mockRejectedValue(new Error("bridge not available"));
    // Should not throw
    expect(() => render(<SessionTree />)).not.toThrow();
  });
});

// ── outline expand/collapse ───────────────────────────────────────────────────

describe("outline tree", () => {
  beforeEach(() => {
    useSessionStore.setState((s) => ({
      ...s,
      graphs: [{ id: "g1", name: "Main", index: 0, active: true }],
    }));
    useHostExtrasStore.setState((s) => ({
      ...s,
      activeGraphOutline: [
        {
          id: "n1",
          name: "Synth Layer",
          isContainer: true,
          children: [{ id: "n1a", name: "Osc", isContainer: false }],
        },
      ],
    }));
  });

  it("renders outline node names", () => {
    render(<SessionTree />);
    expect(screen.getByText("Synth Layer")).toBeInTheDocument();
    expect(screen.getByText("Osc")).toBeInTheDocument();
  });

  it("collapses children when collapse button clicked", () => {
    render(<SessionTree />);
    const collapseBtn = screen.getByRole("button", { name: /collapse outline/i });
    fireEvent.click(collapseBtn);
    expect(screen.queryByText("Synth Layer")).not.toBeInTheDocument();
  });
});

// ── Board (top-level graph) in-place rename (Item 5b) ──────────────────────────

describe("board rename", () => {
  beforeEach(() => {
    useSessionStore.setState((s) => ({
      ...s,
      graphs: [{ id: "g1", name: "Main Board", index: 0, active: true }],
    }));
  });

  it("falls back to 'Board N' (not 'Graph N') when a board is unnamed", () => {
    useSessionStore.setState((s) => ({
      ...s,
      graphs: [{ id: "g1", name: "", index: 2, active: true }],
    }));
    render(<SessionTree />);
    expect(screen.getByText("Board 3")).toBeInTheDocument();
    expect(screen.queryByText("Graph 3")).not.toBeInTheDocument();
  });

  it("double-clicking the board name opens an in-place edit field", () => {
    render(<SessionTree />);
    fireEvent.doubleClick(screen.getByText("Main Board"));
    const input = screen.getByRole("textbox", { name: /rename board/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("Main Board");
  });

  it("Enter commits the board rename via nativeSessionRenameGraph(index, name)", async () => {
    render(<SessionTree />);
    fireEvent.doubleClick(screen.getByText("Main Board"));
    const input = screen.getByRole("textbox", { name: /rename board/i });
    fireEvent.change(input, { target: { value: "Drums" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(mockRename).toHaveBeenCalledWith(0, "Drums"));
    // Field closes after commit.
    expect(
      screen.queryByRole("textbox", { name: /rename board/i }),
    ).not.toBeInTheDocument();
  });

  it("Escape cancels without renaming", () => {
    render(<SessionTree />);
    fireEvent.doubleClick(screen.getByText("Main Board"));
    const input = screen.getByRole("textbox", { name: /rename board/i });
    fireEvent.change(input, { target: { value: "Nope" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(mockRename).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("textbox", { name: /rename board/i }),
    ).not.toBeInTheDocument();
  });

  it("does not commit when the name is unchanged or blank", () => {
    render(<SessionTree />);
    fireEvent.doubleClick(screen.getByText("Main Board"));
    const input = screen.getByRole("textbox", { name: /rename board/i });
    // Unchanged value.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockRename).not.toHaveBeenCalled();
  });

  it("does not re-activate the board when double-clicking the name to rename", async () => {
    render(<SessionTree />);
    // Active board double-click would normally no-op activation; the name's
    // own dblclick stops propagation so it enters edit instead.
    fireEvent.doubleClick(screen.getByText("Main Board"));
    expect(
      screen.getByRole("textbox", { name: /rename board/i }),
    ).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSetActive).not.toHaveBeenCalled();
  });
});
