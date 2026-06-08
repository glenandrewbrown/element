/**
 * ToolPalette.search-focus.test.tsx — Task 3.C: the `focusBrowserSearch` store
 * nonce drives keyboard focus into the real search <input> (no DOM query).
 *
 * The brief's explicit verification: "search-focus nonce drives
 * document.activeElement". Cmd+F / open-browser bump the nonce in useAppStore;
 * ToolPalette subscribes and focuses its <input>. We drive the REAL useAppStore
 * here (only the data stores are mocked) and assert document.activeElement
 * becomes the search box.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useAppStore } from "../../../stores/useAppStore";

// ── Data-store mocks (same shape as ToolPalette.test.tsx) — useAppStore is REAL ──

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGraphAddPlugin: vi.fn(async () => undefined),
  nativeMoleculeInsert: vi.fn(async () => undefined),
}));

vi.mock("../../../bridge/nativeSession", () => ({
  nativeSessionExportGraph: vi.fn(async () => undefined),
  nativeSessionImportGraph: vi.fn(async () => undefined),
  nativeSessionListFiles: vi.fn(async () => []),
  nativeSessionOpenPath: vi.fn(async () => undefined),
  nativeSessionRecover: vi.fn(async () => true),
  nativeSessionSetActiveGraph: vi.fn(async () => undefined),
}));

const mockPluginBrowserState = {
  plugins: [{ identifier: "surge.vst3", name: "Surge XT", blockCategory: "instrument" }],
  favoriteIdentifiers: new Set<string>(),
  recentIdentifiers: [] as string[],
  refresh: vi.fn(async () => undefined),
};
vi.mock("../../../stores/usePluginBrowserStore", () => ({
  usePluginBrowserStore: (sel: (s: typeof mockPluginBrowserState) => unknown) =>
    sel(mockPluginBrowserState),
}));

vi.mock("../../../stores/useSessionStore", () => ({
  useSessionStore: (sel: (s: { recentFiles: string[]; graphs: unknown[] }) => unknown) =>
    sel({ recentFiles: [], graphs: [] }),
}));

vi.mock("../../../stores/useHostExtrasStore", () => ({
  useHostExtrasStore: (
    sel: (s: { molecules: unknown[]; activeGraphOutline: unknown[] }) => unknown,
  ) => sel({ molecules: [], activeGraphOutline: [] }),
}));

vi.mock("../../../stores/usePerformStore", () => ({
  usePerformStore: (sel: (s: { liveHealth: { cpu: number } }) => unknown) =>
    sel({ liveHealth: { cpu: 0 } }),
}));

import { ToolPalette } from "../ToolPalette";

describe("<ToolPalette /> — focusBrowserSearch nonce → document.activeElement", () => {
  beforeEach(() => {
    useAppStore.setState({ focusBrowserSearch: 0 });
  });

  it("focuses the search input when the nonce is bumped (not on first mount)", () => {
    render(<ToolPalette />);
    const input = screen.getByPlaceholderText(/search plugins/i);

    // First mount must NOT auto-steal focus.
    expect(document.activeElement).not.toBe(input);

    // A Cmd+F / open-browser bump drives focus to the real input.
    act(() => {
      useAppStore.getState().requestFocusBrowserSearch();
    });
    expect(document.activeElement).toBe(input);
  });

  it("re-focuses on a subsequent bump (each Cmd+F re-focuses)", () => {
    render(<ToolPalette />);
    const input = screen.getByPlaceholderText(/search plugins/i);

    act(() => {
      useAppStore.getState().requestFocusBrowserSearch();
    });
    expect(document.activeElement).toBe(input);

    // Blur, then bump again — focus must return.
    (input as HTMLElement).blur();
    expect(document.activeElement).not.toBe(input);
    act(() => {
      useAppStore.getState().requestFocusBrowserSearch();
    });
    expect(document.activeElement).toBe(input);
  });
});
