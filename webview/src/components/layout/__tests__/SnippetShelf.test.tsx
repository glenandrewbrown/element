/**
 * Tests for <SnippetShelf /> — bottom snippet/molecule shelf + PANIC button.
 *
 * Mocks: useHostExtrasStore, nativeMoleculeInsert, nativeTransportPanic.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

// ── Mock bridge ──────────────────────────────────────────────────────────────

const mockMoleculeInsert = vi.fn().mockResolvedValue(1);
const mockMoleculeSave = vi.fn().mockResolvedValue(true);
const mockTransportPanic = vi.fn().mockResolvedValue(undefined);

// T20 regression: the bridge mock MUST include nativeMoleculeSave.
// Before this fix the mock omitted it — calling it threw "not a function"
// and the entire save flow silently crashed (the shelf showed "Failed…"
// hint or nothing at all, and the NeuPromptModal confirm path was broken).
vi.mock("../../../bridge/nativeGraph", () => ({
  nativeMoleculeInsert: (...args: unknown[]) => mockMoleculeInsert(...args),
  nativeMoleculeSave: (...args: unknown[]) => mockMoleculeSave(...args),
  nativeTransportPanic: () => mockTransportPanic(),
}));

// ── Mock store ────────────────────────────────────────────────────────────────

type Molecule = { name: string; description?: string };
let mockMolecules: Molecule[] = [];

vi.mock("../../../stores/useHostExtrasStore", () => ({
  useHostExtrasStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ molecules: mockMolecules, graphOutline: [] }),
  ),
}));

import { SnippetShelf } from "../SnippetShelf";

beforeEach(() => {
  mockMolecules = [];
  mockMoleculeInsert.mockClear();
  mockMoleculeSave.mockClear();
  mockTransportPanic.mockClear();
});

describe("<SnippetShelf />", () => {
  // ── Rendering ──────────────────────────────────────────────────────────────

  it("renders the Snippets label", () => {
    render(<SnippetShelf />);
    // Exact match avoids collision with "No snippets saved…" empty hint text.
    expect(screen.getByText("Snippets")).toBeInTheDocument();
  });

  it("shows molecule count (0 when empty)", () => {
    render(<SnippetShelf />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows empty hint when no molecules", () => {
    render(<SnippetShelf />);
    expect(screen.getByText(/no snippets saved/i)).toBeInTheDocument();
  });

  it("renders molecule thumbnails", () => {
    mockMolecules = [
      { name: "Reverb Send", description: "Pre-wired reverb send chain" },
      { name: "Sidechain" },
    ];
    render(<SnippetShelf />);
    expect(screen.getByText("Reverb Send")).toBeInTheDocument();
    expect(screen.getByText("Sidechain")).toBeInTheDocument();
  });

  it("shows correct count when molecules present", () => {
    mockMolecules = [{ name: "A" }, { name: "B" }, { name: "C" }];
    render(<SnippetShelf />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders PANIC button", () => {
    render(<SnippetShelf />);
    expect(screen.getByRole("button", { name: /panic/i })).toBeInTheDocument();
  });

  // ── Interaction ────────────────────────────────────────────────────────────

  it("calls nativeMoleculeInsert with molecule name on click (viewport-centre default)", () => {
    // Insert position is now computed via snippetInsertDefault() which reads the
    // React Flow DOM transform. In jsdom there is no .react-flow__viewport element,
    // so the fallback (200, 200) is used. This is the spec-correct behaviour —
    // the old hardcoded (120, 120) was the bug this test now guards against.
    mockMolecules = [{ name: "Reverb Send" }];
    render(<SnippetShelf />);
    fireEvent.click(screen.getByText("Reverb Send"));
    const [name, x, y] = mockMoleculeInsert.mock.calls[0] as [string, number, number];
    expect(name).toBe("Reverb Send");
    // Must NOT be the old hardcoded value
    expect(x).not.toBe(120);
    expect(y).not.toBe(120);
    // Fallback in test env (no RF DOM) is 200, 200
    expect(x).toBe(200);
    expect(y).toBe(200);
  });

  it("calls nativeTransportPanic on PANIC click", () => {
    render(<SnippetShelf />);
    fireEvent.click(screen.getByRole("button", { name: /panic/i }));
    expect(mockTransportPanic).toHaveBeenCalledOnce();
  });

  it("inserts correct molecule when multiple exist (not the old hardcoded coords)", () => {
    mockMolecules = [{ name: "A" }, { name: "B" }];
    render(<SnippetShelf />);
    fireEvent.click(screen.getByText("B"));
    expect(mockMoleculeInsert).toHaveBeenCalledTimes(1);
    const [name, x, y] = mockMoleculeInsert.mock.calls[0] as [string, number, number];
    expect(name).toBe("B");
    // Must NOT be the old hardcoded (120,120) — insert uses viewport-centre default
    expect(x).not.toBe(120);
    expect(y).not.toBe(120);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it("renders without crashing with empty molecules list", () => {
    expect(() => render(<SnippetShelf />)).not.toThrow();
  });

  it("uses molecule name as title when no description", () => {
    mockMolecules = [{ name: "NoDesc" }];
    render(<SnippetShelf />);
    const btn = screen.getByTitle("NoDesc");
    expect(btn).toBeInTheDocument();
  });

  it("uses description as title when provided", () => {
    mockMolecules = [{ name: "Chain", description: "A pre-wired chain" }];
    render(<SnippetShelf />);
    expect(screen.getByTitle("A pre-wired chain")).toBeInTheDocument();
  });

  it("molecule name truncated in button but accessible via title", () => {
    const longName = "A Very Long Snippet Name That Should Truncate";
    mockMolecules = [{ name: longName }];
    render(<SnippetShelf />);
    expect(screen.getByTitle(longName)).toBeInTheDocument();
  });

  // ── T20 regression: nativeMoleculeSave must be wired + callable ──────────────
  // Root cause: the bridge mock previously omitted nativeMoleculeSave, so
  // clicking "Save as Snippet" → opening the NeuPromptModal → confirming
  // threw "nativeMoleculeSave is not a function" and the whole save path
  // crashed silently. This test exercises the full save flow end-to-end.

  it("T20: Save-as-Snippet button opens NeuPromptModal (modal title present)", async () => {
    // Provide selected nodes via the real useGraphStore — we set state directly.
    const { useGraphStore } = await import("../../../stores/useGraphStore");
    // Add a fake selected node so the button is enabled and ids.length > 0.
    act(() => {
      useGraphStore.setState((s) => ({
        ...s,
        nodes: [
          {
            id: "node-a",
            selected: true,
            name: "Test Block",
            category: "instrument",
            format: "AU",
            bypassed: false,
            muted: false,
            muteInput: false,
            ports: [],
            position: { x: 0, y: 0 },
            type: "block",
            data: {},
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ],
      }));
    });
    render(<SnippetShelf />);
    const saveBtn = screen.getByRole("button", { name: /save as snippet/i });
    fireEvent.click(saveBtn);
    // NeuPromptModal should now be visible (title in heading).
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toBeInTheDocument(),
    );
  });

  it("T20: confirming NeuPromptModal calls nativeMoleculeSave with name + ids", async () => {
    const { useGraphStore } = await import("../../../stores/useGraphStore");
    act(() => {
      useGraphStore.setState((s) => ({
        ...s,
        nodes: [
          {
            id: "node-b",
            selected: true,
            name: "My Block",
            category: "audiofx",
            format: "VST3",
            bypassed: false,
            muted: false,
            muteInput: false,
            ports: [],
            position: { x: 10, y: 10 },
            type: "block",
            data: {},
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ],
      }));
    });
    render(<SnippetShelf />);
    fireEvent.click(screen.getByRole("button", { name: /save as snippet/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    // Type a name and confirm.
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "My Snippet" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(mockMoleculeSave).toHaveBeenCalledWith("My Snippet", ["node-b"]),
    );
  });
});
