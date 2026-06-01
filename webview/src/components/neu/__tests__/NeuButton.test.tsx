import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NeuButton } from "../NeuButton";

describe("<NeuButton />", () => {
  // ── Rendering ──────────────────────────────────────────────────────────────

  it("renders children", () => {
    render(<NeuButton>Save</NeuButton>);
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("renders as a <button> element", () => {
    render(<NeuButton>Click</NeuButton>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("applies default variant classes (no status dot)", () => {
    const { container } = render(<NeuButton>Default</NeuButton>);
    const btn = container.querySelector("button")!;
    // default: text-text-primary; no status dot span
    expect(btn.className).toContain("text-text-primary");
    expect(container.querySelectorAll("span")).toHaveLength(0);
  });

  it("active variant shows teal status dot", () => {
    const { container } = render(
      <NeuButton variant="active">Snap</NeuButton>,
    );
    const dots = container.querySelectorAll("span");
    expect(dots.length).toBeGreaterThan(0);
    // first span is the status dot
    expect(dots[0].className).toContain("bg-accent-teal");
  });

  it("panic variant shows red status dot", () => {
    const { container } = render(
      <NeuButton variant="panic">PANIC</NeuButton>,
    );
    const dots = container.querySelectorAll("span");
    expect(dots.length).toBeGreaterThan(0);
    expect(dots[0].className).toContain("bg-error");
  });

  it("applies sm size classes", () => {
    const { container } = render(<NeuButton size="sm">Small</NeuButton>);
    expect(container.querySelector("button")!.className).toContain("py-1.5");
  });

  it("applies md size classes by default", () => {
    const { container } = render(<NeuButton>Default size</NeuButton>);
    expect(container.querySelector("button")!.className).toContain("py-2");
  });

  it("merges extra className", () => {
    const { container } = render(
      <NeuButton className="w-full">Wide</NeuButton>,
    );
    expect(container.querySelector("button")!.className).toContain("w-full");
  });

  // ── Interaction ────────────────────────────────────────────────────────────

  it("fires onClick when clicked", () => {
    const onClick = vi.fn();
    render(<NeuButton onClick={onClick}>Go</NeuButton>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not throw when clicked with no onClick handler", () => {
    render(<NeuButton>No-op</NeuButton>);
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it("renders with empty string children", () => {
    render(<NeuButton>{""}</NeuButton>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders ReactNode children (icon + label)", () => {
    render(
      <NeuButton>
        <span data-testid="icon" />
        Save
      </NeuButton>,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });
});
