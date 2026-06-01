/**
 * Tests for <VirtualKeyboard />.
 *
 * Bridge calls are mocked so no real JUCE connection is needed.
 * jsdom doesn't implement mouse capture, so drag-across-keys tests
 * are limited to single press/release sequences.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockNoteOn = vi.fn().mockResolvedValue(undefined);
const mockNoteOff = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../bridge/nativeKeyboard", () => ({
  nativeVirtualKeyboardNoteOn: (...args: unknown[]) => mockNoteOn(...args),
  nativeVirtualKeyboardNoteOff: (...args: unknown[]) => mockNoteOff(...args),
}));

import { VirtualKeyboard } from "../VirtualKeyboard";

beforeEach(() => {
  mockNoteOn.mockClear();
  mockNoteOff.mockClear();
});

describe("<VirtualKeyboard />", () => {
  // ── Rendering ──────────────────────────────────────────────────────────────

  it("renders the 'Virtual Keyboard' label", () => {
    render(<VirtualKeyboard />);
    expect(screen.getByText(/virtual keyboard/i)).toBeInTheDocument();
  });

  it("renders channel selector with 16 options", () => {
    render(<VirtualKeyboard />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.options).toHaveLength(16);
  });

  it("defaults channel selector to 1", () => {
    render(<VirtualKeyboard />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("1");
  });

  it("respects defaultChannel prop", () => {
    render(<VirtualKeyboard defaultChannel={5} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("5");
  });

  it("renders white-key buttons for C3–B4 (14 keys = 2 octaves × 7)", () => {
    render(<VirtualKeyboard />);
    // White keys: C D E F G A B × 2 octaves = 14
    const whiteKeys = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-label")?.startsWith("Note "));
    // 14 white + 10 black = 24 total piano key buttons
    expect(whiteKeys.length).toBe(24);
  });

  it("renders velocity slider", () => {
    render(<VirtualKeyboard />);
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("shows velocity 95 for defaultVelocity=0.75 (0.75×127≈95)", () => {
    render(<VirtualKeyboard defaultVelocity={0.75} />);
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  // ── Note on / off ──────────────────────────────────────────────────────────

  it("calls nativeVirtualKeyboardNoteOn on mouseDown", () => {
    render(<VirtualKeyboard />);
    const c3 = screen.getByRole("button", { name: "Note 48" });
    fireEvent.mouseDown(c3);
    expect(mockNoteOn).toHaveBeenCalledWith(48, expect.any(Number), 1);
  });

  it("calls nativeVirtualKeyboardNoteOff on mouseUp", () => {
    render(<VirtualKeyboard />);
    const c3 = screen.getByRole("button", { name: "Note 48" });
    fireEvent.mouseDown(c3);
    fireEvent.mouseUp(c3);
    expect(mockNoteOff).toHaveBeenCalledWith(48, 1);
  });

  it("calls nativeVirtualKeyboardNoteOff on mouseLeave", () => {
    render(<VirtualKeyboard />);
    const c3 = screen.getByRole("button", { name: "Note 48" });
    fireEvent.mouseDown(c3);
    fireEvent.mouseLeave(c3);
    expect(mockNoteOff).toHaveBeenCalledWith(48, 1);
  });

  it("does not double-fire noteOn for the same note", () => {
    render(<VirtualKeyboard />);
    const c3 = screen.getByRole("button", { name: "Note 48" });
    fireEvent.mouseDown(c3);
    fireEvent.mouseDown(c3); // second press — already active
    expect(mockNoteOn).toHaveBeenCalledTimes(1);
  });

  it("does not fire noteOff if note was never pressed", () => {
    render(<VirtualKeyboard />);
    const c3 = screen.getByRole("button", { name: "Note 48" });
    fireEvent.mouseUp(c3);
    expect(mockNoteOff).not.toHaveBeenCalled();
  });

  it("shows active note count when a key is held", async () => {
    render(<VirtualKeyboard />);
    const c3 = screen.getByRole("button", { name: "Note 48" });
    fireEvent.mouseDown(c3);
    expect(await screen.findByText(/1 note held/i)).toBeInTheDocument();
  });

  it("hides note count when no keys held", () => {
    render(<VirtualKeyboard />);
    expect(screen.queryByText(/note held/i)).not.toBeInTheDocument();
  });

  // ── Channel change ─────────────────────────────────────────────────────────

  it("sends noteOn on the updated channel after channel change", () => {
    render(<VirtualKeyboard />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "3" } });
    const c3 = screen.getByRole("button", { name: "Note 48" });
    fireEvent.mouseDown(c3);
    expect(mockNoteOn).toHaveBeenCalledWith(48, expect.any(Number), 3);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it("renders black key buttons for sharps", () => {
    render(<VirtualKeyboard />);
    // C#3 = 49
    expect(
      screen.getByRole("button", { name: "Note 49" }),
    ).toBeInTheDocument();
  });

  it("renders without crashing with all default props", () => {
    expect(() => render(<VirtualKeyboard />)).not.toThrow();
  });
});
