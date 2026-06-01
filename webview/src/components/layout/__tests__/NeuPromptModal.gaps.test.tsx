/**
 * NeuPromptModal — gap coverage (branches at 63%).
 *
 * The existing NeuPromptModal.test.tsx covers: open=false, aria-modal,
 * initial focus+defaultValue, ENTER confirm.
 *
 * This file covers:
 *   - ESC key calls onCancel
 *   - Cancel button click calls onCancel
 *   - Confirm button disabled when value is empty / whitespace-only
 *   - Confirm button NOT disabled when value has content
 *   - Clicking Confirm when value is non-empty calls onConfirm with trimmed value
 *   - Clicking Confirm when value is empty/whitespace does nothing
 *   - Tab focus trap: forward cycle (input → cancel → confirm → input)
 *   - Shift+Tab focus trap: backward cycle
 *   - Custom confirmLabel / cancelLabel props
 *   - description rendered only when provided
 *   - defaultValue reset on re-open (open→close→open with new defaultValue)
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NeuPromptModal } from "../NeuPromptModal";

const noop = () => {};

describe("<NeuPromptModal /> (gaps)", () => {
  // ── ESC dismissal ────────────────────────────────────────────────────────────

  it("ESC key calls onCancel", () => {
    const onCancel = vi.fn();
    render(
      <NeuPromptModal open title="Rename" onConfirm={noop} onCancel={onCancel} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("ESC key does not call onCancel when modal is closed", () => {
    const onCancel = vi.fn();
    render(
      <NeuPromptModal
        open={false}
        title="Rename"
        onConfirm={noop}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });

  // ── Cancel button ─────────────────────────────────────────────────────────────

  it("Cancel button click calls onCancel", () => {
    const onCancel = vi.fn();
    render(
      <NeuPromptModal open title="Rename" onConfirm={noop} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // ── Confirm disabled state ────────────────────────────────────────────────────

  it("Confirm button is disabled when value is empty string", () => {
    render(
      <NeuPromptModal
        open
        title="Rename"
        defaultValue=""
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    const confirmBtn = screen.getByRole("button", { name: /ok/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("Confirm button is disabled when value is whitespace-only", () => {
    render(
      <NeuPromptModal
        open
        title="Rename"
        defaultValue="   "
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    const confirmBtn = screen.getByRole("button", { name: /ok/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("Confirm button is enabled when value has non-whitespace content", () => {
    render(
      <NeuPromptModal
        open
        title="Rename"
        defaultValue="My Preset"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    const confirmBtn = screen.getByRole("button", { name: /ok/i });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("Confirm button becomes enabled after typing non-empty content", () => {
    render(
      <NeuPromptModal
        open
        title="Rename"
        defaultValue=""
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Hello" } });
    expect(screen.getByRole("button", { name: /ok/i })).not.toBeDisabled();
  });

  it("Confirm button becomes disabled again when input cleared", () => {
    render(
      <NeuPromptModal
        open
        title="Rename"
        defaultValue="Init"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByRole("button", { name: /ok/i })).toBeDisabled();
  });

  // ── Confirm button click ──────────────────────────────────────────────────────

  it("Confirm button click calls onConfirm with trimmed value", () => {
    const onConfirm = vi.fn();
    render(
      <NeuPromptModal
        open
        title="Rename"
        defaultValue="  My Track  "
        onConfirm={onConfirm}
        onCancel={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ok/i }));
    expect(onConfirm).toHaveBeenCalledWith("My Track");
  });

  it("Confirm button click with empty value does not call onConfirm", () => {
    const onConfirm = vi.fn();
    render(
      <NeuPromptModal
        open
        title="Rename"
        defaultValue=""
        onConfirm={onConfirm}
        onCancel={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ok/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // ── Tab focus trap ───────────────────────────────────────────────────────────

  it("Tab cycles focus from input to cancel to confirm and back", () => {
    render(
      <NeuPromptModal
        open
        title="Trap test"
        defaultValue="v"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    const input = screen.getByRole("textbox");
    input.focus();
    expect(document.activeElement).toBe(input);

    // Tab from input → cancel
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /cancel/i }),
    );

    // Tab from cancel → confirm
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /ok/i }),
    );

    // Tab from confirm → wraps to input
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(input);
  });

  it("Shift+Tab cycles backward from input to confirm", () => {
    render(
      <NeuPromptModal
        open
        title="Trap test"
        defaultValue="v"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    const input = screen.getByRole("textbox");
    input.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /ok/i }),
    );
  });

  // ── Custom labels ─────────────────────────────────────────────────────────────

  it("renders custom confirmLabel and cancelLabel", () => {
    render(
      <NeuPromptModal
        open
        title="Delete"
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep/i })).toBeInTheDocument();
  });

  // ── Description prop ─────────────────────────────────────────────────────────

  it("renders description text when provided", () => {
    render(
      <NeuPromptModal
        open
        title="Rename"
        description="Enter a new name for this Block."
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(
      screen.getByText("Enter a new name for this Block."),
    ).toBeInTheDocument();
  });

  it("does not render description element when not provided", () => {
    const { container } = render(
      <NeuPromptModal open title="Rename" onConfirm={noop} onCancel={noop} />,
    );
    // No <p> tag should be in the dialog content
    expect(container.querySelector("p")).not.toBeInTheDocument();
  });

  // ── defaultValue reset on re-open ─────────────────────────────────────────────

  it("resets input to new defaultValue when modal re-opens", () => {
    const { rerender } = render(
      <NeuPromptModal
        open
        title="Rename"
        defaultValue="First"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("First");

    // Close modal
    rerender(
      <NeuPromptModal
        open={false}
        title="Rename"
        defaultValue="Second"
        onConfirm={noop}
        onCancel={noop}
      />,
    );

    // Re-open with new defaultValue
    rerender(
      <NeuPromptModal
        open
        title="Rename"
        defaultValue="Second"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Second");
  });

  // ── Placeholder ───────────────────────────────────────────────────────────────

  it("renders placeholder text on the input", () => {
    render(
      <NeuPromptModal
        open
        title="Rename"
        placeholder="Enter name…"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(screen.getByPlaceholderText("Enter name…")).toBeInTheDocument();
  });
});
