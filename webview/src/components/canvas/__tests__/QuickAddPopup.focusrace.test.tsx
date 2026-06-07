/**
 * QuickAddPopup AUTOFOCUS-RACE guard (N3 / ultraqa #1, HIGH).
 *
 * Bug: on open, the first keystrokes leaked to GLOBAL handlers (useKeyboard /
 * transport / canvas shortcuts) before the search field had focus, spawning
 * stray blocks and auto-opening editors. The fix has three layers, each tested
 * here:
 *   1. SYNCHRONOUS mount focus (useLayoutEffect) — the field owns the keyboard
 *      before paint.
 *   2. Capture-phase pre-focus buffer — a printable key typed while the field
 *      is NOT focused is injected into search AND `stopPropagation`'d so no
 *      window-level (global) keydown listener ever sees it.
 *   3. The popup's onKeyDown stops propagation on every handled nav/commit key
 *      so ArrowUp/Down/Enter/Esc never bubble to global shortcuts either.
 *
 * The critical assertion is layer 2/3: the GLOBAL shortcut handler — which in
 * the real app is `useKeyboard`'s window-BUBBLE listener (useKeyboard.ts:512) —
 * must receive ZERO of the popup's first keystrokes. (GraphCanvas's
 * window-CAPTURE listener at :689 only acts on Tab/Enter/Escape AND only while
 * ghost suggestions are live, so a printable key is a no-op there regardless.)
 *
 * NOTE on capture ordering: a capture-phase `stopPropagation` cannot un-fire a
 * sibling capture listener that was registered EARLIER on the same target —
 * nothing can. The real leak target (useKeyboard) is a BUBBLE listener, and the
 * popup's capture handler runs first in the capture phase, so it reliably
 * prevents the bubble phase. The tests therefore model the global handler as a
 * bubble listener (matching the real useKeyboard) for the leak assertions.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGraphAddPlugin: vi.fn(async () => undefined),
}));
vi.mock("../../../events", () => ({
  EV_OPEN_PREFERENCES: "el:open-preferences",
}));

const PLUGIN = {
  identifier: "com.vendor.SurgeXT",
  name: "Surge XT",
  blockCategory: "instrument" as const,
  format: "VST3",
  manufacturer: "Surge Synth Team",
  category: "Synth",
  signalOut: "audio" as const,
  usageCount: 0,
  isFavorite: false,
  recentRank: -1,
};

vi.mock("../../../stores/usePluginBrowserStore", () => ({
  usePluginBrowserStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      plugins: [PLUGIN],
      favoriteIdentifiers: new Set<string>(),
      recentIdentifiers: [] as string[],
      refresh: vi.fn(async () => undefined),
      toggleFavorite: vi.fn(),
    })
  ),
}));

import { QuickAddPopup } from "../QuickAddPopup";

const onClose = vi.fn();
const defaultProps = { x: 100, y: 120, onClose };

describe("QuickAddPopup — autofocus race (ultraqa #1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Layer 1: synchronous mount focus ──────────────────────────────────────
  it("focuses the search field SYNCHRONOUSLY on mount (no rAF wait)", () => {
    render(<QuickAddPopup {...defaultProps} />);
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });

  // ── Layer 2: the FIRST pre-focus keystroke never reaches a global handler ──
  it("does NOT let the first pre-focus keystroke reach a global window handler", () => {
    // Models the REAL leak targets, each registered AFTER the popup mounts so
    // the popup's capture handler is first in propagation order (the realistic
    // case — but stopImmediatePropagation also covers later-registered capture
    // siblings):
    //   - globalBubble  → useKeyboard.ts:512 (window BUBBLE = the global shortcuts)
    //   - globalCapture → GraphCanvas.tsx:689 (window CAPTURE, registered later)
    const globalBubble = vi.fn();
    const globalCapture = vi.fn();
    try {
      render(<QuickAddPopup {...defaultProps} />);
      window.addEventListener("keydown", globalBubble, false);
      window.addEventListener("keydown", globalCapture, true);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      // Simulate the WKWebView race: focus has NOT yet landed on the field.
      input.blur();
      expect(document.activeElement).not.toBe(input);

      // First keystroke hits the window while the field is unfocused.
      fireEvent.keyDown(window, { key: "s" });

      // It was buffered into search AND focus was grabbed…
      expect(input.value).toBe("s");
      expect(document.activeElement).toBe(input);
      // …and CRUCIALLY no global handler fired → no stray block / no global
      // shortcut. stopImmediatePropagation stops the later capture sibling; the
      // capture-phase stop also kills the bubble phase entirely.
      expect(globalBubble).not.toHaveBeenCalled();
      expect(globalCapture).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", globalBubble, false);
      window.removeEventListener("keydown", globalCapture, true);
    }
  });

  // ── Layer 3: nav/commit keys don't bubble to global shortcuts ─────────────
  it("stops propagation of navigation/commit keys so they never bubble globally", () => {
    const globalBubble = vi.fn();
    window.addEventListener("keydown", globalBubble, false);
    try {
      render(<QuickAddPopup {...defaultProps} />);
      const input = screen.getByRole("textbox");
      // These are the keys that, if leaked, would trigger canvas/transport
      // shortcuts. Each is dispatched ON the focused field (real path).
      for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape"]) {
        globalBubble.mockClear();
        fireEvent.keyDown(input, { key });
        expect(globalBubble).not.toHaveBeenCalled();
      }
    } finally {
      window.removeEventListener("keydown", globalBubble, false);
    }
  });

  // ── Backspace pre-focus is also buffered + swallowed ──────────────────────
  it("buffers + swallows a pre-focus Backspace (does not reach the global handler)", () => {
    // Global handler modelled as the real useKeyboard bubble listener,
    // registered after mount.
    const globalBubble = vi.fn();
    try {
      render(<QuickAddPopup {...defaultProps} />);
      window.addEventListener("keydown", globalBubble, false);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      input.blur();
      fireEvent.keyDown(window, { key: "s" });
      globalBubble.mockClear();
      input.blur();
      fireEvent.keyDown(window, { key: "Backspace" });
      expect(input.value).toBe("");
      expect(globalBubble).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", globalBubble, false);
    }
  });

  // ── Real chords are NOT swallowed (so ⌘-shortcuts still work) ──────────────
  it("lets real ⌘/⌃/⌥ chords pass through (does not buffer them)", () => {
    const globalCapture = vi.fn();
    window.addEventListener("keydown", globalCapture, true);
    try {
      render(<QuickAddPopup {...defaultProps} />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      input.blur();
      fireEvent.keyDown(window, { key: "z", metaKey: true });
      fireEvent.keyDown(window, { key: "s", ctrlKey: true });
      // Chords are left for the global handler; nothing buffered.
      expect(input.value).toBe("");
      expect(globalCapture).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener("keydown", globalCapture, true);
    }
  });
});
