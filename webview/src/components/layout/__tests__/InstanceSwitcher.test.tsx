// Tests for InstanceSwitcher.tsx (U11).
//
// Verifies the honest single-instance disabled pill and the multi-instance
// dropdown → setMirrorTarget flow. The store is mocked as a selector-driven
// fn (same pattern as Breadcrumb.test.tsx); useShallow is a passthrough.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InstanceSwitcher } from "../InstanceSwitcher";

const mockSetMirrorTarget = vi.fn();
const mockUseInstancesStore = vi.fn();

vi.mock("../../../stores/useInstancesStore", () => ({
  useInstancesStore: (selector?: (s: any) => any) =>
    mockUseInstancesStore(selector),
  selectOtherInstances: (s: any) => s.instances.filter((i: any) => !i.isSelf),
  selectHasMultipleInstances: (s: any) => s.instances.length > 1,
  selectMirrorTargetId: (s: any) => s.mirrorTargetId,
}));

// useShallow passthrough — return the selector unchanged so the mock applies it.
vi.mock("zustand/react/shallow", () => ({
  useShallow: (fn: any) => fn,
}));

interface Inst {
  id: number;
  name: string;
  variant: number;
  isSelf: boolean;
  hasGraph: boolean;
}

function setupStore(instances: Inst[], mirrorTargetId: number | null = null) {
  const state = {
    instances,
    mirrorTargetId,
    setMirrorTarget: mockSetMirrorTarget,
  };
  mockUseInstancesStore.mockImplementation((selector?: (s: any) => any) =>
    selector ? selector(state) : state,
  );
}

const self: Inst = {
  id: 1,
  name: "Project A",
  variant: 0,
  isSelf: true,
  hasGraph: true,
};
const peer: Inst = {
  id: 2,
  name: "Project B",
  variant: 1,
  isSelf: false,
  hasGraph: false,
};

describe("InstanceSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetMirrorTarget.mockReset();
  });

  it("single instance → renders a disabled 1× pill, no dropdown", () => {
    setupStore([self]);
    render(<InstanceSwitcher />);
    const pill = screen.getByRole("button");
    expect(pill).toBeDisabled();
    expect(pill).toHaveTextContent("1×");
    expect(pill.getAttribute("title")).toContain("Only this Element instance");
    // No menu is rendered.
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("zero instances (no bridge) → still the honest disabled 1× pill", () => {
    setupStore([]);
    render(<InstanceSwitcher />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("multiple instances → opens a dropdown listing OTHER instances", () => {
    setupStore([self, peer]);
    render(<InstanceSwitcher />);
    // Pill shows the total instance count (2×), enabled.
    const pill = screen.getByRole("button");
    expect(pill).not.toBeDisabled();
    expect(pill).toHaveTextContent("2×");
    fireEvent.click(pill);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    // Only the peer (not self) is listed.
    expect(screen.getByText("Project B")).toBeInTheDocument();
    expect(screen.queryByText("Project A")).toBeNull();
  });

  it("clicking a peer calls setMirrorTarget(id)", () => {
    setupStore([self, peer]);
    render(<InstanceSwitcher />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Project B"));
    expect(mockSetMirrorTarget).toHaveBeenCalledWith(2);
  });

  it("when mirroring, a Close mirror item calls setMirrorTarget(null)", () => {
    setupStore([self, peer], 2);
    render(<InstanceSwitcher />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Close mirror"));
    expect(mockSetMirrorTarget).toHaveBeenCalledWith(null);
  });
});
