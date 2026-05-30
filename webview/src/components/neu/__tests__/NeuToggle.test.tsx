/**
 * Tests for <NeuToggle /> — boolean switch primitive with semantic colours.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NeuToggle } from "../NeuToggle";

describe("<NeuToggle />", () => {
  it("renders a switch with aria-checked reflecting the active prop", () => {
    render(<NeuToggle active={true} onChange={() => {}} />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("renders aria-checked=false when inactive", () => {
    render(<NeuToggle active={false} onChange={() => {}} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("calls onChange with the negated value on click (off -> on)", async () => {
    const onChange = vi.fn();
    render(<NeuToggle active={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("calls onChange with the negated value on click (on -> off)", async () => {
    const onChange = vi.fn();
    render(<NeuToggle active={true} onChange={onChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("applies the blue (accent-blue) track + glow when active", () => {
    render(<NeuToggle active={true} onChange={() => {}} color="blue" />);
    const sw = screen.getByRole("switch");
    expect(sw.className).toContain("bg-accent-blue");
    expect(sw.className).toContain("shadow-[0_0_8px_rgba(74,144,217,0.5)]");
  });

  it("applies the orange (accent-orange) palette when active", () => {
    render(<NeuToggle active={true} onChange={() => {}} color="orange" />);
    const sw = screen.getByRole("switch");
    expect(sw.className).toContain("bg-accent-orange");
  });

  it("applies the teal (accent-teal) palette when active", () => {
    render(<NeuToggle active={true} onChange={() => {}} color="teal" />);
    expect(screen.getByRole("switch").className).toContain("bg-accent-teal");
  });

  it("uses inset (pressed) styles when inactive — no glow", () => {
    render(<NeuToggle active={false} onChange={() => {}} color="blue" />);
    const sw = screen.getByRole("switch");
    expect(sw.className).toContain("bg-pressed");
    expect(sw.className).toContain("neu-inset");
    expect(sw.className).not.toContain("bg-accent-blue");
  });

  it("merges caller-provided className", () => {
    render(
      <NeuToggle active={false} onChange={() => {}} className="ml-4" />,
    );
    expect(screen.getByRole("switch").className).toContain("ml-4");
  });
});
