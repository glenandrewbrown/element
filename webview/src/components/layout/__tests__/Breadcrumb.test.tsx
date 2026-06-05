// Tests for Breadcrumb.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Breadcrumb } from "../Breadcrumb";

// Provide selectBreadcrumbs as a real selector so the component receives actual data.
// useGraphStore is mocked as a fn whose implementation we swap per-test.
// Crumb clicks are now ENGINE-driven (the dive-desync fix): the component calls
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

describe("Breadcrumb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExitToBreadcrumb.mockReset();
  });

  it("renders null when breadcrumbs length is 1 (root only)", () => {
    setupStore(["Root"]);
    const { container } = render(<Breadcrumb />);
    expect(container.firstChild).toBeNull();
  });

  it("renders null when breadcrumbs is empty", () => {
    setupStore([]);
    const { container } = render(<Breadcrumb />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nav when breadcrumbs length > 1", () => {
    setupStore(["Root", "Container A"]);
    render(<Breadcrumb />);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByText("Root")).toBeInTheDocument();
    expect(screen.getByText("Container A")).toBeInTheDocument();
  });

  it("last crumb has cursor-default class", () => {
    setupStore(["Root", "Container A", "Nested B"]);
    render(<Breadcrumb />);
    const lastBtn = screen.getByText("Nested B");
    expect(lastBtn.className).toContain("cursor-default");
  });

  it("non-last crumbs have cursor-pointer class", () => {
    setupStore(["Root", "Container A", "Nested B"]);
    render(<Breadcrumb />);
    const rootBtn = screen.getByText("Root");
    expect(rootBtn.className).toContain("cursor-pointer");
  });

  it("clicking a non-last crumb calls exitToBreadcrumb with its index", () => {
    setupStore(["Root", "Container A", "Nested B"]);
    render(<Breadcrumb />);
    fireEvent.click(screen.getByText("Root"));
    expect(mockExitToBreadcrumb).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByText("Container A"));
    expect(mockExitToBreadcrumb).toHaveBeenCalledWith(1);
  });

  it("clicking the last crumb does NOT trigger an exit", () => {
    setupStore(["Root", "Nested B"]);
    render(<Breadcrumb />);
    fireEvent.click(screen.getByText("Nested B"));
    expect(mockExitToBreadcrumb).not.toHaveBeenCalled();
  });

  it("renders n-1 chevron SVGs for n crumbs", () => {
    setupStore(["Root", "A", "B"]);
    render(<Breadcrumb />);
    // 2 chevrons for 3 crumbs
    const svgs = document.querySelectorAll("svg");
    expect(svgs.length).toBe(2);
  });

  it("two crumbs: only first crumb index=0 is navigable", () => {
    setupStore(["Root", "Child"]);
    render(<Breadcrumb />);
    fireEvent.click(screen.getByText("Root"));
    expect(mockExitToBreadcrumb).toHaveBeenCalledWith(0);
    expect(mockExitToBreadcrumb).toHaveBeenCalledTimes(1);
  });
});
