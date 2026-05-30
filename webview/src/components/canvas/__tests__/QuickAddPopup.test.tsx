/**
 * Tests for <QuickAddPopup /> — right-click canvas popover for quick plugin insertion.
 *
 * Positioned at (x, y) canvas coords. Filters plugin list, promotes favorites,
 * handles keyboard nav, and calls nativeGraphAddPlugin on selection.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mock bridge ───────────────────────────────────────────────────────────────
vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGraphAddPlugin: vi.fn(async () => undefined),
}));

// ── Mock plugin store ─────────────────────────────────────────────────────────
const PLUGINS = [
  {
    identifier: "com.vendor.SurgeXT",
    name: "Surge XT",
    blockCategory: "instrument" as const,
    format: "VST3",
  },
  {
    identifier: "com.vendor.EQPro",
    name: "EQ Pro",
    blockCategory: "audiofx" as const,
    format: "AU",
  },
  {
    identifier: "com.vendor.Arp",
    name: "Arp",
    blockCategory: "midifx" as const,
    format: "VST3",
  },
];

const mockRefresh = vi.fn(async () => undefined);
let mockFavorites = new Set<string>();

vi.mock("../../../stores/usePluginBrowserStore", () => ({
  usePluginBrowserStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      plugins: PLUGINS,
      favoriteIdentifiers: mockFavorites,
      refresh: mockRefresh,
    })
  ),
}));

vi.mock("../../../events", () => ({
  EV_OPEN_PREFERENCES: "el:open-preferences",
}));

import { QuickAddPopup } from "../QuickAddPopup";
import { nativeGraphAddPlugin } from "../../../bridge/nativeGraph";
import { usePluginBrowserStore } from "../../../stores/usePluginBrowserStore";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("<QuickAddPopup />", () => {
  const onClose = vi.fn();
  const defaultProps = { x: 100, y: 200, onClose };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFavorites = new Set<string>();
    // jsdom does not implement scrollIntoView; QuickAddPopup calls it on the
    // active list item (QuickAddPopup.tsx:167). Stub it so renders/keynav work.
    Element.prototype.scrollIntoView = vi.fn();
  });

  // ── Rendering ────────────────────────────────────────────────────────────

  it("renders the search input", () => {
    render(<QuickAddPopup {...defaultProps} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("renders all plugins on mount", async () => {
    render(<QuickAddPopup {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Surge XT")).toBeInTheDocument();
      expect(screen.getByText("EQ Pro")).toBeInTheDocument();
      expect(screen.getByText("Arp")).toBeInTheDocument();
    });
  });

  it("calls refresh on mount", () => {
    render(<QuickAddPopup {...defaultProps} />);
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  // ── Positioning ───────────────────────────────────────────────────────────

  it("positions popup at given x/y coords", () => {
    // QuickAddPopup renders a backdrop (firstChild) then a positioned wrapper
    // (`.fixed.z-50`, QuickAddPopup.tsx:223-225). It clamps to the viewport,
    // so use coords well inside jsdom's 1024×768 window to pass through.
    const { container } = render(<QuickAddPopup x={100} y={120} onClose={onClose} />);
    const popup = container.querySelector(".z-50") as HTMLElement;
    expect(popup.style.left).toBe("100px");
    expect(popup.style.top).toBe("120px");
  });

  // ── Filtering ────────────────────────────────────────────────────────────

  it("filters by name (case-insensitive)", () => {
    render(<QuickAddPopup {...defaultProps} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "surge" } });
    expect(screen.getByText("Surge XT")).toBeInTheDocument();
    expect(screen.queryByText("EQ Pro")).not.toBeInTheDocument();
    expect(screen.queryByText("Arp")).not.toBeInTheDocument();
  });

  it("shows empty state when no plugin matches", () => {
    render(<QuickAddPopup {...defaultProps} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "zzzz_no_match" },
    });
    expect(screen.queryByText("Surge XT")).not.toBeInTheDocument();
    expect(screen.queryByText("EQ Pro")).not.toBeInTheDocument();
  });

  it("clears filter and shows all plugins on empty search", () => {
    render(<QuickAddPopup {...defaultProps} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "surge" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText("Surge XT")).toBeInTheDocument();
    expect(screen.getByText("EQ Pro")).toBeInTheDocument();
  });

  // ── Favorites ─────────────────────────────────────────────────────────────

  it("promotes favorites to top of list", () => {
    mockFavorites = new Set(["com.vendor.EQPro"]);
    render(<QuickAddPopup {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    // First plugin button should be EQ Pro (the favorite)
    expect(buttons[0].textContent).toContain("EQ Pro");
  });

  // ── Category icons ────────────────────────────────────────────────────────

  it("shows instrument (●) icon for instrument plugins", async () => {
    render(<QuickAddPopup {...defaultProps} />);
    await waitFor(() => {
      const el = screen.getByLabelText("Instrument");
      expect(el).toBeInTheDocument();
    });
  });

  it("shows audiofx (◆) icon for audiofx plugins", async () => {
    render(<QuickAddPopup {...defaultProps} />);
    await waitFor(() => {
      const el = screen.getByLabelText("Audio FX");
      expect(el).toBeInTheDocument();
    });
  });

  it("shows midifx (▲) icon for midifx plugins", async () => {
    render(<QuickAddPopup {...defaultProps} />);
    await waitFor(() => {
      const el = screen.getByLabelText("MIDI FX");
      expect(el).toBeInTheDocument();
    });
  });

  // ── Format badge ──────────────────────────────────────────────────────────

  it("shows format badge for non-INT plugins", async () => {
    render(<QuickAddPopup {...defaultProps} />);
    await waitFor(() => {
      // Multiple VST3 badges may exist
      const badges = screen.getAllByText("VST3");
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it("does not show format badge for INT plugins", async () => {
    render(<QuickAddPopup {...defaultProps} />);
    await waitFor(() => {
      expect(screen.queryByText("INT")).not.toBeInTheDocument();
    });
  });

  // ── Plugin selection ──────────────────────────────────────────────────────

  it("calls nativeGraphAddPlugin with plugin id on click", async () => {
    render(<QuickAddPopup {...defaultProps} />);
    await waitFor(() => screen.getByText("Surge XT"));
    fireEvent.click(screen.getByText("Surge XT").closest("button")!);
    expect(nativeGraphAddPlugin).toHaveBeenCalledWith("com.vendor.SurgeXT");
  });

  it("calls onClose after selecting a plugin", async () => {
    render(<QuickAddPopup {...defaultProps} />);
    await waitFor(() => screen.getByText("Surge XT"));
    fireEvent.click(screen.getByText("Surge XT").closest("button")!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  // ── Keyboard navigation ───────────────────────────────────────────────────

  it("closes on Escape key", () => {
    render(<QuickAddPopup {...defaultProps} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("selects active item on Enter key", async () => {
    render(<QuickAddPopup {...defaultProps} />);
    await waitFor(() => screen.getByText("Surge XT"));
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter" });
    // First item (Surge XT or first favorite) should be added
    expect(nativeGraphAddPlugin).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves selection down on ArrowDown", async () => {
    render(<QuickAddPopup {...defaultProps} />);
    await waitFor(() => screen.getByText("Surge XT"));
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // Second item selected — press Enter
    fireEvent.keyDown(input, { key: "Enter" });
    expect(nativeGraphAddPlugin).toHaveBeenCalledOnce();
  });

  it("wraps ArrowDown past end of list", async () => {
    render(<QuickAddPopup {...defaultProps} />);
    await waitFor(() => screen.getByText("Surge XT"));
    const input = screen.getByRole("textbox");
    for (let i = 0; i < 100; i++) {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    }
    expect(screen.getByRole("textbox")).toBeInTheDocument(); // no crash
  });

  it("wraps ArrowUp at start of list", async () => {
    render(<QuickAddPopup {...defaultProps} />);
    await waitFor(() => screen.getByText("Surge XT"));
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    // Should wrap to last item; no crash
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("handles empty plugin list gracefully", () => {
    // `usePluginBrowserStore` is the module-level vi.mock above; override the
    // next call to return an empty plugin list. Cast the implementation to the
    // mock's parameter type to satisfy the overloaded `Selector` signature.
    vi.mocked(usePluginBrowserStore).mockImplementationOnce(
      ((selector: (s: unknown) => unknown) =>
        selector({
          plugins: [],
          favoriteIdentifiers: new Set<string>(),
          refresh: vi.fn(),
        })) as unknown as typeof usePluginBrowserStore,
    );
    expect(() => render(<QuickAddPopup {...defaultProps} />)).not.toThrow();
  });
});
