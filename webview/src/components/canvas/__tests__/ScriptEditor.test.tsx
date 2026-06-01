/**
 * ScriptEditor — coverage for the Lua source editor component (was 1.56%).
 *
 * Mocks:
 *   - nativeGraph bridge (getSource, getRuntimeState, setSource)
 *   - vi.useFakeTimers() to control the 1 Hz polling interval
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ScriptEditor } from "../ScriptEditor";

// ── Bridge mocks ─────────────────────────────────────────────────────────────

const mockGetSource = vi.fn();
const mockGetRuntimeState = vi.fn();
const mockSetSource = vi.fn();

vi.mock("../../../bridge/nativeGraph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../bridge/nativeGraph")>();
  return {
    ...actual,
    nativeScriptGetSource: (...a: unknown[]) => mockGetSource(...a),
    nativeScriptGetRuntimeState: (...a: unknown[]) => mockGetRuntimeState(...a),
    nativeScriptSetSource: (...a: unknown[]) => mockSetSource(...a),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultBridgeSetup(source = 'print("hello")', vars: unknown[] = []) {
  mockGetSource.mockResolvedValue(source);
  mockGetRuntimeState.mockResolvedValue({ ok: true, vars });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ScriptEditor", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    defaultBridgeSetup();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("shows loading state before source resolves", () => {
    mockGetSource.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ScriptEditor nodeId="node-1" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders source in textarea after load", async () => {
    defaultBridgeSetup('return 42');
    render(<ScriptEditor nodeId="node-1" />);
    await waitFor(() =>
      expect(screen.getByLabelText("Lua script source")).toHaveValue("return 42"),
    );
  });

  it("renders line numbers matching source line count", async () => {
    defaultBridgeSetup("line1\nline2\nline3");
    render(<ScriptEditor nodeId="node-1" />);
    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("does not show close button when onClose is omitted", async () => {
    render(<ScriptEditor nodeId="node-1" />);
    await waitFor(() => screen.getByLabelText("Lua script source"));
    expect(screen.queryByLabelText("Close script editor")).not.toBeInTheDocument();
  });

  it("shows close button and calls onClose when provided", async () => {
    const onClose = vi.fn();
    render(<ScriptEditor nodeId="node-1" onClose={onClose} />);
    await waitFor(() => screen.getByLabelText("Close script editor"));
    fireEvent.click(screen.getByLabelText("Close script editor"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Save & Compile button calls nativeScriptSetSource", async () => {
    mockSetSource.mockResolvedValue({ ok: true });
    render(<ScriptEditor nodeId="node-1" />);
    await waitFor(() => screen.getByText("Save & Compile"));
    await act(async () => {
      fireEvent.click(screen.getByText("Save & Compile"));
    });
    expect(mockSetSource).toHaveBeenCalledWith("node-1", 'print("hello")');
  });

  it("shows success status after successful compile", async () => {
    mockSetSource.mockResolvedValue({ ok: true });
    render(<ScriptEditor nodeId="node-1" />);
    await waitFor(() => screen.getByText("Save & Compile"));
    await act(async () => {
      fireEvent.click(screen.getByText("Save & Compile"));
    });
    await waitFor(() =>
      expect(screen.getByText("Compiled successfully.")).toBeInTheDocument(),
    );
  });

  it("shows error message after failed compile", async () => {
    mockSetSource.mockResolvedValue({ ok: false, error: "undefined variable 'x'" });
    render(<ScriptEditor nodeId="node-1" />);
    await waitFor(() => screen.getByText("Save & Compile"));
    await act(async () => {
      fireEvent.click(screen.getByText("Save & Compile"));
    });
    await waitFor(() =>
      expect(screen.getByText("undefined variable 'x'")).toBeInTheDocument(),
    );
  });

  it("falls back to generic error text when compile error has no message", async () => {
    mockSetSource.mockResolvedValue({ ok: false });
    render(<ScriptEditor nodeId="node-1" />);
    await waitFor(() => screen.getByText("Save & Compile"));
    await act(async () => {
      fireEvent.click(screen.getByText("Save & Compile"));
    });
    await waitFor(() =>
      expect(screen.getByText("Compile error.")).toBeInTheDocument(),
    );
  });

  it("Cmd+Enter triggers compile", async () => {
    mockSetSource.mockResolvedValue({ ok: true });
    render(<ScriptEditor nodeId="node-1" />);
    const textarea = await waitFor(() => screen.getByLabelText("Lua script source"));
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    });
    expect(mockSetSource).toHaveBeenCalled();
  });

  it("Ctrl+Enter triggers compile", async () => {
    mockSetSource.mockResolvedValue({ ok: true });
    render(<ScriptEditor nodeId="node-1" />);
    const textarea = await waitFor(() => screen.getByLabelText("Lua script source"));
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    });
    expect(mockSetSource).toHaveBeenCalled();
  });

  it("Tab key inserts 2 spaces at cursor", async () => {
    defaultBridgeSetup("abc");
    render(<ScriptEditor nodeId="node-1" />);
    const textarea = await waitFor(() =>
      screen.getByLabelText("Lua script source"),
    ) as HTMLTextAreaElement;
    // Position cursor at end (index 3)
    textarea.selectionStart = 3;
    textarea.selectionEnd = 3;
    fireEvent.keyDown(textarea, { key: "Tab" });
    // Source should now be "abc  " (2 spaces appended)
    await waitFor(() => expect(textarea).toHaveValue("abc  "));
  });

  it("Tab replaces selected text with 2 spaces", async () => {
    defaultBridgeSetup("abc");
    render(<ScriptEditor nodeId="node-1" />);
    const textarea = await waitFor(() =>
      screen.getByLabelText("Lua script source"),
    ) as HTMLTextAreaElement;
    textarea.selectionStart = 1;
    textarea.selectionEnd = 2; // select "b"
    fireEvent.keyDown(textarea, { key: "Tab" });
    await waitFor(() => expect(textarea).toHaveValue("a  c"));
  });

  it("shows variables strip when runtime state returns vars", async () => {
    mockGetRuntimeState.mockResolvedValue({
      ok: true,
      vars: [
        { name: "gain", value: "0.75", type: "number" },
        { name: "mode", value: "stereo", type: "string" },
      ],
    });
    render(<ScriptEditor nodeId="node-1" />);
    // Advance timers so the first poll tick fires
    await act(async () => { vi.advanceTimersByTime(0); });
    await waitFor(() => expect(screen.getByText("gain")).toBeInTheDocument());
    expect(screen.getByText("mode")).toBeInTheDocument();
  });

  it("does not show variables strip when vars list is empty", async () => {
    mockGetRuntimeState.mockResolvedValue({ ok: true, vars: [] });
    render(<ScriptEditor nodeId="node-1" />);
    await act(async () => { vi.advanceTimersByTime(0); });
    await waitFor(() => screen.getByLabelText("Lua script source"));
    expect(screen.queryByText("Variables")).not.toBeInTheDocument();
  });

  it("polling interval fires every second", async () => {
    render(<ScriptEditor nodeId="node-1" />);
    await waitFor(() => screen.getByLabelText("Lua script source"));
    const callsBefore = mockGetRuntimeState.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(mockGetRuntimeState.mock.calls.length).toBeGreaterThan(callsBefore + 1);
  });

  it("clears polling interval on unmount", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = render(<ScriptEditor nodeId="node-1" />);
    await waitFor(() => screen.getByLabelText("Lua script source"));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("re-fetches source when nodeId prop changes", async () => {
    const { rerender } = render(<ScriptEditor nodeId="node-1" />);
    await waitFor(() => screen.getByLabelText("Lua script source"));
    mockGetSource.mockResolvedValue("-- node 2 source");
    rerender(<ScriptEditor nodeId="node-2" />);
    await waitFor(() =>
      expect(screen.getByLabelText("Lua script source")).toHaveValue("-- node 2 source"),
    );
    expect(mockGetSource).toHaveBeenCalledWith("node-2");
  });

  it("clears compile result when textarea changes", async () => {
    mockSetSource.mockResolvedValue({ ok: true });
    render(<ScriptEditor nodeId="node-1" />);
    const textarea = await waitFor(() => screen.getByLabelText("Lua script source"));
    await act(async () => {
      fireEvent.click(screen.getByText("Save & Compile"));
    });
    await waitFor(() => screen.getByText("Compiled successfully."));
    // Typing in the textarea should clear the status
    fireEvent.change(textarea, { target: { value: "new source" } });
    await waitFor(() =>
      expect(screen.queryByText("Compiled successfully.")).not.toBeInTheDocument(),
    );
  });
});
