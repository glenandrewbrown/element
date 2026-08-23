/**
 * F-9: AboutModal tests.
 *
 * Three required state-machine snapshots:
 *   - idle (initial render)
 *   - checking (in-flight click)
 *   - requested (after the bridge resolves) + error (after the bridge throws)
 *
 * The bridge module is mocked at the import boundary so the modal can be
 * driven through its lifecycle without a real WebView2 bridge.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AboutModal } from "../AboutModal";

// ── Mocked bridge ───────────────────────────────────────────────────────────

vi.mock("../../../bridge/nativeApp", () => {
  const nativeAppGetAbout = vi.fn();
  const nativeAppCheckForUpdates = vi.fn();
  return { nativeAppGetAbout, nativeAppCheckForUpdates };
});

import {
  nativeAppGetAbout,
  nativeAppCheckForUpdates,
} from "../../../bridge/nativeApp";

beforeEach(() => {
  vi.clearAllMocks();
  (nativeAppGetAbout as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    name: "Element",
    version: "2.2.0.16",
    copyright: "Copyright 2026 Glen Andrew Brown",
  });
});

describe("<AboutModal />", () => {
  it("renders with role=dialog + aria-modal in the idle state", async () => {
    render(<AboutModal onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("About Element");
    // Status banner is hidden in idle.
    expect(screen.queryByTestId("about-status-banner")).toBeNull();
  });

  it("loads version + copyright from the bridge on mount", async () => {
    render(<AboutModal onClose={() => {}} />);
    await screen.findByText("Version 2.2.0.16");
    expect(screen.getByText(/Copyright 2026/)).toBeInTheDocument();
  });

  it("transitions idle -> checking -> requested on a successful check", async () => {
    let resolveCheck!: (v: void) => void;
    (
      nativeAppCheckForUpdates as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolveCheck = r;
        }),
    );
    render(<AboutModal onClose={() => {}} />);
    // Wait for the about info to load so the snapshot is deterministic.
    await screen.findByText("Version 2.2.0.16");

    // idle: button enabled, label "Check for updates"
    const btn = screen.getByTestId("about-check-button");
    expect(btn).not.toBeDisabled();
    expect(btn.textContent).toBe("Check for updates");

    // click -> checking
    fireEvent.click(btn);
    const banner = await screen.findByTestId("about-status-banner");
    expect(banner.getAttribute("data-status")).toBe("checking");
    expect(banner.getAttribute("aria-live")).toBe("polite");
    expect(banner.textContent).toContain("Checking");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toBe("Checking…");

    // resolve -> requested
    resolveCheck();
    await vi.waitFor(() => {
      const post = screen.getByTestId("about-status-banner");
      expect(post.getAttribute("data-status")).toBe("requested");
      expect(post.textContent).toContain("Update check requested");
    });
    expect(screen.getByTestId("about-check-button")).not.toBeDisabled();
  });

  it("renders an error banner when the bridge rejects", async () => {
    (
      nativeAppCheckForUpdates as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error("offline"));
    render(<AboutModal onClose={() => {}} />);
    await screen.findByText("Version 2.2.0.16");
    fireEvent.click(screen.getByTestId("about-check-button"));
    await vi.waitFor(() => {
      const banner = screen.getByTestId("about-status-banner");
      expect(banner.getAttribute("data-status")).toBe("error");
      expect(banner.textContent).toContain("offline");
    });
  });

  it("ESC key calls onClose", () => {
    const onClose = vi.fn();
    render(<AboutModal onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("matches the idle snapshot", async () => {
    const { container } = render(<AboutModal onClose={() => {}} />);
    await screen.findByText("Version 2.2.0.16");
    expect(container.firstChild).toMatchSnapshot();
  });

  it("matches the checking snapshot", async () => {
    let resolveCheck!: (v: void) => void;
    (
      nativeAppCheckForUpdates as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolveCheck = r;
        }),
    );
    const { container } = render(<AboutModal onClose={() => {}} />);
    await screen.findByText("Version 2.2.0.16");
    fireEvent.click(screen.getByTestId("about-check-button"));
    await screen.findByTestId("about-status-banner");
    expect(container.firstChild).toMatchSnapshot();
    // Resolve to avoid an unresolved promise warning at teardown.
    resolveCheck();
  });

  it("matches the requested snapshot", async () => {
    (
      nativeAppCheckForUpdates as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
    const { container } = render(<AboutModal onClose={() => {}} />);
    await screen.findByText("Version 2.2.0.16");
    fireEvent.click(screen.getByTestId("about-check-button"));
    await vi.waitFor(() => {
      const banner = screen.getByTestId("about-status-banner");
      expect(banner.getAttribute("data-status")).toBe("requested");
    });
    expect(container.firstChild).toMatchSnapshot();
  });
});
