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

const mockNavigate = vi.fn();

let breadcrumbs: string[] = [];

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({ navigateToBreadcrumb: mockNavigate })
  ),
  selectBreadcrumbs: (_s: { navigateToBreadcrumb: unknown }) => breadcrumbs,
}));

vi.mock("../../neu", () => ({
  Icon: ({ name, "aria-label": al }: { name: string; "aria-label"?: string }) => (
    <span data-testid={`icon-${name}`} aria-label={al} />
  ),
}));

import { NestedChrome } from "../NestedChrome";

describe("NestedChrome — root level (depth 0)", () => {
  beforeEach(() => {
    breadcrumbs = ["Project"];
    vi.clearAllMocks();
  });

  it("renders nothing at root depth", () => {
    const { container } = render(<NestedChrome />);
    expect(container.firstChild).toBeNull();
  });
});

describe("NestedChrome — depth 1 (one level in)", () => {
  beforeEach(() => {
    breadcrumbs = ["Project", "SubBoard"];
    vi.clearAllMocks();
  });

  it("renders the nested chrome overlay", () => {
    render(<NestedChrome />);
    // Banner text should name current board
    expect(screen.getByText("SubBoard")).toBeInTheDocument();
  });

  it("shows parent name in 'inside' label", () => {
    render(<NestedChrome />);
    expect(screen.getByText("Project")).toBeInTheDocument();
  });

  it("shows LEVEL 1 chip", () => {
    render(<NestedChrome />);
    expect(screen.getByText("LEVEL 1")).toBeInTheDocument();
  });

  it("shows 'inside' connector text", () => {
    render(<NestedChrome />);
    expect(screen.getByText("inside")).toBeInTheDocument();
  });

  it("EXIT button calls navigateToBreadcrumb with parent index", () => {
    render(<NestedChrome />);
    fireEvent.click(screen.getByRole("button", { name: /Exit nested Board/i }));
    // depth=1, exitToIndex = breadcrumbs.length - 2 = 0
    expect(mockNavigate).toHaveBeenCalledWith(0);
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

describe("NestedChrome — depth 2", () => {
  beforeEach(() => {
    breadcrumbs = ["Project", "Container A", "Deep Board"];
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

  it("EXIT navigates to index 1 (one level up)", () => {
    render(<NestedChrome />);
    fireEvent.click(screen.getByRole("button", { name: /Exit nested Board/i }));
    expect(mockNavigate).toHaveBeenCalledWith(1);
  });

  it("renders two depth rungs", () => {
    const { container } = render(<NestedChrome />);
    const rungs = container.querySelectorAll(".w-\\[5px\\].h-\\[5px\\]");
    expect(rungs).toHaveLength(2);
  });
});

describe("NestedChrome — Layers icon accessibility", () => {
  beforeEach(() => {
    breadcrumbs = ["Project", "Board"];
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
    breadcrumbs = ["Project", "Board"];
    render(<NestedChrome />);
    expect(screen.getByLabelText("Nested 1 level deep")).toBeInTheDocument();
  });

  it("uses 'levels' (plural) at depth 2", () => {
    breadcrumbs = ["Project", "A", "B"];
    render(<NestedChrome />);
    expect(screen.getByLabelText("Nested 2 levels deep")).toBeInTheDocument();
  });
});
