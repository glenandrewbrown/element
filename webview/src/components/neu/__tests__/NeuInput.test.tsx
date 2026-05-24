/**
 * Tests for <NeuInput /> — text input primitive with forwardRef + onChange.
 */

import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NeuInput } from "../NeuInput";

describe("<NeuInput />", () => {
  it("renders a text input with the given placeholder", () => {
    render(<NeuInput placeholder="Search blocks" />);
    const input = screen.getByPlaceholderText("Search blocks");
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).type).toBe("text");
  });

  it("reflects the provided value (controlled)", () => {
    render(<NeuInput value="hello" onChange={() => {}} />);
    const input = screen.getByDisplayValue("hello");
    expect(input).toBeInTheDocument();
  });

  it("fires onChange with the new string value", async () => {
    const onChange = vi.fn();
    render(<NeuInput placeholder="x" onChange={onChange} />);
    const input = screen.getByPlaceholderText("x");
    await userEvent.type(input, "ab");
    // userEvent types one char at a time
    expect(onChange).toHaveBeenCalledTimes(2);
    // Uncontrolled input — each native onChange fires with the cumulative value.
    expect(onChange).toHaveBeenNthCalledWith(1, "a");
    expect(onChange).toHaveBeenNthCalledWith(2, "ab");
  });

  it("does not throw when typing without an onChange handler", async () => {
    render(<NeuInput placeholder="x" />);
    const input = screen.getByPlaceholderText("x");
    await expect(userEvent.type(input, "z")).resolves.not.toThrow();
  });

  it("forwards refs to the underlying input element", () => {
    const ref = createRef<HTMLInputElement>();
    render(<NeuInput ref={ref} placeholder="x" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.placeholder).toBe("x");
  });

  it("merges caller-provided className with base styles", () => {
    render(<NeuInput placeholder="x" className="custom-cls" />);
    const input = screen.getByPlaceholderText("x");
    expect(input.className).toContain("custom-cls");
    expect(input.className).toContain("bg-pressed");
  });
});
