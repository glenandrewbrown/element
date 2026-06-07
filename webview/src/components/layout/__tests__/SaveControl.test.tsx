/**
 * SaveControl tests (4b — E6 named-save flow + G3 non-modal save-pulse).
 *
 * - Save on a NEVER-NAMED project opens an INLINE name field (no OS dialog) and
 *   commits via nativeSessionSaveNamed; Save on a named project is silent
 *   (nativeSessionSave). "As…" always goes through nativeSessionSaveAs.
 * - A non-modal "Saved ✓" pulse appears when session.savedAtMs INCREASES.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SaveControl } from "../SaveControl";
import { useSessionStore } from "../../../stores/useSessionStore";

const saveNamed = vi.fn(async (_name: string) => true);
const save = vi.fn(async () => undefined);
const saveAs = vi.fn(async () => undefined);
const open = vi.fn(async () => true);
const newSession = vi.fn(async () => undefined);

vi.mock("../../../bridge/nativeSession", () => ({
  nativeSessionNew: () => newSession(),
  nativeSessionOpen: () => open(),
  nativeSessionSave: () => save(),
  nativeSessionSaveAs: () => saveAs(),
  nativeSessionSaveNamed: (name: string) => saveNamed(name),
}));

function setSession(p: Partial<{ filePath: string; dirty: boolean; savedAtMs: number }>) {
  useSessionStore.setState((s) => ({ ...s, ...p }));
}

beforeEach(() => {
  saveNamed.mockClear();
  save.mockClear();
  saveAs.mockClear();
  open.mockClear();
  newSession.mockClear();
  setSession({ filePath: "", dirty: false, savedAtMs: 0 });
});

describe("named-save flow (E6)", () => {
  it("Save on a never-named project opens an inline name field, not a chooser", () => {
    setSession({ filePath: "" });
    render(<SaveControl />);
    fireEvent.click(screen.getByTitle(/name it first/i));
    // Inline field appears; no silent save / chooser was invoked.
    expect(screen.getByLabelText("Project name")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    expect(saveAs).not.toHaveBeenCalled();
  });

  it("committing the inline name calls nativeSessionSaveNamed with the trimmed name", () => {
    setSession({ filePath: "" });
    render(<SaveControl />);
    fireEvent.click(screen.getByTitle(/name it first/i));
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "  My Song  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(saveNamed).toHaveBeenCalledWith("My Song");
  });

  it("Escape cancels the inline name field without saving", () => {
    setSession({ filePath: "" });
    render(<SaveControl />);
    fireEvent.click(screen.getByTitle(/name it first/i));
    const input = screen.getByLabelText("Project name");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByLabelText("Project name")).not.toBeInTheDocument();
    expect(saveNamed).not.toHaveBeenCalled();
  });

  it("an empty inline name does NOT call the native save", () => {
    setSession({ filePath: "" });
    render(<SaveControl />);
    fireEvent.click(screen.getByTitle(/name it first/i));
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(saveNamed).not.toHaveBeenCalled();
  });

  it("Save on a NAMED project saves silently (no inline field, no chooser)", () => {
    setSession({ filePath: "/Sessions/Mine.els" });
    render(<SaveControl />);
    fireEvent.click(screen.getByTitle("Save Project"));
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Project name")).not.toBeInTheDocument();
  });

  it("inline name field traps keys so they never leak to global shortcuts", () => {
    setSession({ filePath: "" });
    render(<SaveControl />);
    fireEvent.click(screen.getByTitle(/name it first/i));
    const input = screen.getByLabelText("Project name");
    const ev = new KeyboardEvent("keydown", { key: "a", bubbles: true });
    const stop = vi.spyOn(ev, "stopPropagation");
    input.dispatchEvent(ev);
    expect(stop).toHaveBeenCalled();
  });

  it("'As…' always uses the explicit save-as native", () => {
    setSession({ filePath: "" });
    render(<SaveControl />);
    fireEvent.click(screen.getByTitle("Save Project As…"));
    expect(saveAs).toHaveBeenCalledTimes(1);
  });
});

describe("save-pulse (G3)", () => {
  it("does NOT pulse on the initial savedAtMs (hydration)", () => {
    setSession({ savedAtMs: 1000 });
    render(<SaveControl />);
    // The pulse text is absent on the first observed savedAtMs (hydration).
    expect(screen.queryByText("Saved ✓")).not.toBeInTheDocument();
  });

  it("pulses when savedAtMs increases after mount", () => {
    setSession({ savedAtMs: 1000 });
    render(<SaveControl />);
    act(() => setSession({ savedAtMs: 2000 }));
    expect(screen.getByText("Saved ✓")).toBeInTheDocument();
  });
});
