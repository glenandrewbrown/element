import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mock framer-motion so AnimatePresence/motion renders its children ─────────

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode; variants?: unknown; initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown; style?: React.CSSProperties }) => (
      <div {...(props as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
    ),
  },
}));

// ── Store mock ────────────────────────────────────────────────────────────────
// EXIT is now ENGINE-driven (the dive-desync fix): NestedChrome calls
// exitToBreadcrumb(parentIndex) (which loops nativeExitContainer) instead of
// optimistically mutating the breadcrumb, so the assertions target that action.

const mockExitToBreadcrumb = vi.fn();

let breadcrumbs: string[] = [];

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({ exitToBreadcrumb: mockExitToBreadcrumb })
  ),
  selectBreadcrumbs: (_s: { exitToBreadcrumb: unknown }) => breadcrumbs,
}));

vi.mock("../../neu", () => ({
  Icon: ({ name, "aria-label": al }: { name: string; "aria-label"?: string }) => (
    <span data-testid={`icon-${name}`} aria-label={al} />
  ),
}));

import { NestedChrome } from "../NestedChrome";

describe("NestedChrome — root level (depth 0)", () => {
  // ENGINE BREADCRUMB SHAPE: [sessionName, activeGraphName, …containers].
  // The first two entries (Project + its top-level Board) are NOT dives, so the
  // not-dived root is a TWO-element stack and the nesting depth is length − 2.
  // (Earlier these tests used a fabricated 1-element root that the host never
  // emits — that masked the "LEVEL 1 painted at the real 2-element root" bug.)
  beforeEach(() => {
    breadcrumbs = ["Project", "Main Board"];
    vi.clearAllMocks();
  });

  it("renders nothing at the (2-element) root", () => {
    const { container } = render(<NestedChrome />);
    expect(container.firstChild).toBeNull();
  });
});

describe("NestedChrome — depth 1 (one container in)", () => {
  beforeEach(() => {
    // [session, activeGraph, container1] → one level of nesting.
    breadcrumbs = ["Project", "Main Board", "SubBoard"];
    vi.clearAllMocks();
  });

  it("renders the nested chrome overlay", () => {
    render(<NestedChrome />);
    // Banner text should name current board
    expect(screen.getByText("SubBoard")).toBeInTheDocument();
  });

  it("shows parent name in 'inside' label", () => {
    render(<NestedChrome />);
    expect(screen.getByText("Main Board")).toBeInTheDocument();
  });

  it("shows LEVEL 1 chip", () => {
    render(<NestedChrome />);
    expect(screen.getByText("LEVEL 1")).toBeInTheDocument();
  });

  it("shows 'inside' connector text", () => {
    render(<NestedChrome />);
    expect(screen.getByText("inside")).toBeInTheDocument();
  });

  it("EXIT button calls exitToBreadcrumb with parent index", () => {
    render(<NestedChrome />);
    fireEvent.click(screen.getByRole("button", { name: /Exit nested Board/i }));
    // exitToIndex = breadcrumbs.length - 2 = 1 (the active-graph board).
    expect(mockExitToBreadcrumb).toHaveBeenCalledWith(1);
  });

  it("EXIT button has descriptive aria-label", () => {
    render(<NestedChrome />);
    const exitBtn = screen.getByRole("button", { name: /Exit nested Board/i });
    expect(exitBtn).toBeInTheDocument();
  });

  it("renders one depth rung (filled dot per level)", () => {
    const { container } = render(<NestedChrome />);
    // depth=1 → 1 rung in the ribbon
    const rungs = container.querySelectorAll(".w-\\[5px\\].h-\\[5px\\]");
    expect(rungs).toHaveLength(1);
  });
});

describe("NestedChrome — depth 2 (two containers in)", () => {
  beforeEach(() => {
    breadcrumbs = ["Project", "Main Board", "Container A", "Deep Board"];
    vi.clearAllMocks();
  });

  it("shows LEVEL 2", () => {
    render(<NestedChrome />);
    expect(screen.getByText("LEVEL 2")).toBeInTheDocument();
  });

  it("shows Deep Board as current board", () => {
    render(<NestedChrome />);
    expect(screen.getByText("Deep Board")).toBeInTheDocument();
  });

  it("shows Container A as parent", () => {
    render(<NestedChrome />);
    expect(screen.getByText("Container A")).toBeInTheDocument();
  });

  it("EXIT exits to the immediate parent index (one level up)", () => {
    render(<NestedChrome />);
    fireEvent.click(screen.getByRole("button", { name: /Exit nested Board/i }));
    // exitToIndex = breadcrumbs.length - 2 = 2 (Container A).
    expect(mockExitToBreadcrumb).toHaveBeenCalledWith(2);
  });

  it("renders two depth rungs", () => {
    const { container } = render(<NestedChrome />);
    const rungs = container.querySelectorAll(".w-\\[5px\\].h-\\[5px\\]");
    expect(rungs).toHaveLength(2);
  });
});

describe("NestedChrome — Layers icon accessibility", () => {
  beforeEach(() => {
    breadcrumbs = ["Project", "Main Board", "Board"];
    vi.clearAllMocks();
  });

  it("Layers icon has nested-level aria-label", () => {
    render(<NestedChrome />);
    const icon = screen.getByLabelText("Nested 1 level deep");
    expect(icon).toBeInTheDocument();
  });
});

describe("NestedChrome — depth plural text", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("uses 'level' (singular) at depth 1", () => {
    breadcrumbs = ["Project", "Main Board", "Board"];
    render(<NestedChrome />);
    expect(screen.getByLabelText("Nested 1 level deep")).toBeInTheDocument();
  });

  it("uses 'levels' (plural) at depth 2", () => {
    breadcrumbs = ["Project", "Main Board", "A", "B"];
    render(<NestedChrome />);
    expect(screen.getByLabelText("Nested 2 levels deep")).toBeInTheDocument();
  });
});
