/**
 * Tests for <SnippetShelf /> — bottom snippet/molecule shelf + PANIC button.
 *
 * Mocks: useHostExtrasStore, nativeMoleculeInsert, nativeTransportPanic.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mock bridge ──────────────────────────────────────────────────────────────

const mockMoleculeInsert = vi.fn().mockResolvedValue(undefined);
const mockTransportPanic = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeMoleculeInsert: (...args: unknown[]) => mockMoleculeInsert(...args),
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

  it("calls nativeMoleculeInsert with molecule name on click", () => {
    mockMolecules = [{ name: "Reverb Send" }];
    render(<SnippetShelf />);
    fireEvent.click(screen.getByText("Reverb Send"));
    expect(mockMoleculeInsert).toHaveBeenCalledWith("Reverb Send", 120, 120);
  });

  it("calls nativeTransportPanic on PANIC click", () => {
    render(<SnippetShelf />);
    fireEvent.click(screen.getByRole("button", { name: /panic/i }));
    expect(mockTransportPanic).toHaveBeenCalledOnce();
  });

  it("inserts correct molecule when multiple exist", () => {
    mockMolecules = [{ name: "A" }, { name: "B" }];
    render(<SnippetShelf />);
    fireEvent.click(screen.getByText("B"));
    expect(mockMoleculeInsert).toHaveBeenCalledWith("B", 120, 120);
    expect(mockMoleculeInsert).toHaveBeenCalledTimes(1);
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
});
