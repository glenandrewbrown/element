/**
 * Tests for NeuPromptModal (W-1, Phase F-block 1).
 *
 * Covers:
 *   - Default render snapshot
 *   - role="dialog" + aria-modal + aria-labelledby contract
 *   - Initial focus on the input with default value selected
 *   - ESC dismisses (calls onCancel)
 *   - ENTER on the input confirms with the trimmed value
 *   - Confirm button disabled when value is empty / whitespace-only
 *   - Cancel button calls onCancel
 *   - Closed (open=false) renders nothing
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NeuPromptModal } from "../NeuPromptModal";

const noop = () => {};

describe("<NeuPromptModal />", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(
      <NeuPromptModal
        open={false}
        title="Save preset"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog with aria-modal + aria-labelledby tied to title", () => {
    render(
      <NeuPromptModal
        open
        title="Save preset"
        description="Helper text"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)?.textContent).toBe("Save preset");
    expect(dialog).toHaveTextContent("Helper text");
  });

  it("focuses the input on open and pre-selects defaultValue", async () => {
    render(
      <NeuPromptModal
        open
        title="Rename"
        defaultValue="MyPreset"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    // The useLayoutEffect sets focus on next tick — wait one rAF.
    await new Promise((r) => setTimeout(r, 10));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("MyPreset");
  });

  it("ENTER on the input confirms with the trimmed value", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <NeuPromptModal
        open
        title="Save preset"
        onConfirm={onConfirm}
        onCancel={noop}
      />,
    );
    const input = screen.getByRole("textbox");
    await user.type(input, "  Lead 01  {Enter}");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("Lead 01");
  });

  it("ESC dismisses (calls onCancel)", async () => {
    const onCancel = vi.fn();
    render(
      <NeuPromptModal
        open
        title="Save preset"
        onConfirm={noop}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Confirm button is disabled when value is empty or whitespace-only", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <NeuPromptModal
        open
        title="Save preset"
        confirmLabel="Save"
        onConfirm={onConfirm}
        onCancel={noop}
      />,
    );
    const confirm = screen.getByRole("button", { name: "Save" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "   "); // whitespace only
    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "x");
    expect(confirm).not.toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("x");
  });

  it("Cancel button calls onCancel", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <NeuPromptModal
        open
        title="Save preset"
        onConfirm={noop}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("matches the default snapshot", () => {
    const { container } = render(
      <NeuPromptModal
        open
        title="Save preset"
        description="Saves the current parameter values."
        placeholder="Preset name"
        confirmLabel="Save"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
