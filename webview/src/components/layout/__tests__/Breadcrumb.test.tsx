// Tests for Breadcrumb.tsx — Task 5.3: always-visible breadcrumb
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Breadcrumb } from "../Breadcrumb";

// Provide selectBreadcrumbs as a real selector so the component receives actual data.
// useGraphStore is mocked as a fn whose implementation we swap per-test.
// Crumb clicks are ENGINE-driven (the dive-desync fix): the component calls
// exitToBreadcrumb(i) (which loops nativeExitContainer) instead of mutating the
// stack optimistically, so we assert on that action.
const mockExitToBreadcrumb = vi.fn();
const mockUseGraphStore = vi.fn();

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: (selector: (s: any) => any) => mockUseGraphStore(selector),
  selectBreadcrumbs: (s: any) => s.breadcrumbs,
}));

function setupStore(breadcrumbs: string[]) {
  const state = { breadcrumbs, exitToBreadcrumb: mockExitToBreadcrumb };
  mockUseGraphStore.mockImplementation((selector: (s: any) => any) => selector(state));
}

describe("Breadcrumb — Task 5.3 always-visible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExitToBreadcrumb.mockReset();
  });

  // ── Root-level always-visible ───────────────────────────────────────────────

  it("renders a nav at root level (breadcrumbs.length === 1) showing 'Board'", () => {
    setupStore(["Main Project"]);  // engine name is ignored — root always shows "Board"
    render(<Breadcrumb />);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByText("Board")).toBeInTheDocument();
  });

  it("renders a fallback 'Board' crumb when store is empty (pre-hydration)", () => {
    setupStore([]);
    render(<Breadcrumb />);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByText("Board")).toBeInTheDocument();
  });

  it("root-level single crumb is NOT clickable (no exitToBreadcrumb call)", () => {
    setupStore(["Main Project"]);
    render(<Breadcrumb />);
    fireEvent.click(screen.getByText("Board"));
    expect(mockExitToBreadcrumb).not.toHaveBeenCalled();
  });

  it("root-level 'Board' crumb has aria-current=page", () => {
    setupStore(["Main Project"]);
    render(<Breadcrumb />);
    const btn = screen.getByText("Board");
    expect(btn).toHaveAttribute("aria-current", "page");
  });

  // ── Nested navigation ───────────────────────────────────────────────────────

  it("renders nav when breadcrumbs length > 1 — root always shows 'Board'", () => {
    setupStore(["Main Project", "Container A"]);
    render(<Breadcrumb />);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    // root entry is always "Board" regardless of engine-provided name
    expect(screen.getByText("Board")).toBeInTheDocument();
    expect(screen.getByText("Container A")).toBeInTheDocument();
  });

  it("last crumb has cursor-default class", () => {
    setupStore(["Session", "Container A", "Nested B"]);
    render(<Breadcrumb />);
    const lastBtn = screen.getByText("Nested B");
    expect(lastBtn.className).toContain("cursor-default");
  });

  it("non-last crumbs have cursor-pointer class — root shows as 'Board'", () => {
    setupStore(["Session", "Container A", "Nested B"]);
    render(<Breadcrumb />);
    // Root crumb is always "Board", not the engine-provided session name
    const rootBtn = screen.getByText("Board");
    expect(rootBtn.className).toContain("cursor-pointer");
  });

  it("clicking a non-last crumb calls exitToBreadcrumb with its index", () => {
    setupStore(["Session", "Container A", "Nested B"]);
    render(<Breadcrumb />);
    // Root "Board" crumb is at index 0
    fireEvent.click(screen.getByText("Board"));
    expect(mockExitToBreadcrumb).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByText("Container A"));
    expect(mockExitToBreadcrumb).toHaveBeenCalledWith(1);
  });

  it("clicking the last crumb does NOT trigger an exit", () => {
    setupStore(["Session", "Nested B"]);
    render(<Breadcrumb />);
    fireEvent.click(screen.getByText("Nested B"));
    expect(mockExitToBreadcrumb).not.toHaveBeenCalled();
  });

  it("renders n-1 chevron SVGs for n crumbs (nested)", () => {
    setupStore(["Session", "A", "B"]);
    render(<Breadcrumb />);
    // 2 chevrons for 3 crumbs
    const svgs = document.querySelectorAll("svg");
    expect(svgs.length).toBe(2);
  });

  it("two crumbs: only first crumb index=0 is navigable", () => {
    setupStore(["Session", "Child"]);
    render(<Breadcrumb />);
    // Root crumb renders as "Board"
    fireEvent.click(screen.getByText("Board"));
    expect(mockExitToBreadcrumb).toHaveBeenCalledWith(0);
    expect(mockExitToBreadcrumb).toHaveBeenCalledTimes(1);
  });
});
