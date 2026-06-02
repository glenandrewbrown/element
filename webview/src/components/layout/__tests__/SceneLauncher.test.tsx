/**
 * SceneLauncher — coverage skeleton (was 0%).
 *
 * Covers: scene grid rendering, activate on click, add scene, capture scene,
 * delete scene, inline rename flow, rename submit/cancel/blur.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAppStore } from "../../../stores/useAppStore";
import { usePerformStore } from "../../../stores/usePerformStore";
import { SceneLauncher } from "../SceneLauncher";

// ── Bridge mocks ──────────────────────────────────────────────────────────────

const mockAddScene = vi.fn();
const mockCaptureScene = vi.fn();
const mockDeleteScene = vi.fn();
const mockRenameScene = vi.fn();
const mockSetActiveScene = vi.fn();

vi.mock("../../../bridge/nativePerform", () => ({
  nativePerformAddScene: (...a: unknown[]) => mockAddScene(...a),
  nativePerformCaptureScene: (...a: unknown[]) => mockCaptureScene(...a),
  nativePerformDeleteScene: (...a: unknown[]) => mockDeleteScene(...a),
  nativePerformRenameScene: (...a: unknown[]) => mockRenameScene(...a),
  nativePerformSetActiveScene: (...a: unknown[]) => mockSetActiveScene(...a),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

import type { SceneData } from "../../../data/types";

const SCENES: SceneData[] = [
  { id: "s1", name: "Scene 1", index: 0, active: true },
  { id: "s2", name: "Scene 2", index: 1, active: false },
  { id: "s3", name: "Scene 3", index: 2, active: false },
];

function resetStores(scenes: SceneData[] = SCENES) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  usePerformStore.setState({ scenes, activeScene: 0 } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAppStore.setState({ activeScene: 0 } as any);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// QUARANTINE: SceneLauncher is a shelved feature (decision D3, 2026-05-30).
// Scene/Preset system removed from UI (hide-UI, keep-code). Restore when revived.
describe.skip("SceneLauncher — rendering", () => {
  beforeEach(() => {
    resetStores();
    mockAddScene.mockResolvedValue(undefined);
    mockCaptureScene.mockResolvedValue(undefined);
    mockDeleteScene.mockResolvedValue(undefined);
    mockRenameScene.mockResolvedValue(undefined);
    mockSetActiveScene.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it("renders all scene cards", () => {
    render(<SceneLauncher />);
    expect(screen.getByText("Scene 1")).toBeInTheDocument();
    expect(screen.getByText("Scene 2")).toBeInTheDocument();
    expect(screen.getByText("Scene 3")).toBeInTheDocument();
  });

  it("renders empty state when no scenes", () => {
    resetStores([]);
    render(<SceneLauncher />);
    expect(screen.queryByText("Scene 1")).not.toBeInTheDocument();
  });

  it("add scene button is present", () => {
    render(<SceneLauncher />);
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });
});

describe.skip("SceneLauncher — activate", () => {
  beforeEach(() => {
    resetStores();
    mockSetActiveScene.mockResolvedValue(undefined);
    mockCaptureScene.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it("clicking a scene card calls setScene", () => {
    const setScene = vi.spyOn(useAppStore.getState(), "setScene");
    render(<SceneLauncher />);
    fireEvent.click(screen.getByText("Scene 2"));
    expect(setScene).toHaveBeenCalledWith(1);
  });
});

describe.skip("SceneLauncher — add scene", () => {
  beforeEach(() => {
    resetStores();
    mockAddScene.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it("add button calls nativePerformAddScene with next name", async () => {
    render(<SceneLauncher />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /add/i }));
    });
    expect(mockAddScene).toHaveBeenCalledWith("Scene 4");
  });
});

describe.skip("SceneLauncher — delete scene", () => {
  beforeEach(() => {
    resetStores();
    mockDeleteScene.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it("delete button calls nativePerformDeleteScene with correct index", async () => {
    render(<SceneLauncher />);
    // Delete buttons are inside each card — find the one for Scene 2
    const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
    await act(async () => { fireEvent.click(deleteButtons[1]); });
    expect(mockDeleteScene).toHaveBeenCalledWith(1);
  });

  it("delete button click does not propagate to activate", async () => {
    const setScene = vi.spyOn(useAppStore.getState(), "setScene");
    render(<SceneLauncher />);
    const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
    await act(async () => { fireEvent.click(deleteButtons[0]); });
    expect(setScene).not.toHaveBeenCalled();
  });
});

describe.skip("SceneLauncher — rename flow", () => {
  beforeEach(() => {
    resetStores();
    mockRenameScene.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it("clicking rename button enters rename mode (shows input)", () => {
    render(<SceneLauncher />);
    const renameButtons = screen.getAllByRole("button", { name: /rename/i });
    fireEvent.click(renameButtons[0]);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("Enter confirms rename and calls nativePerformRenameScene", async () => {
    render(<SceneLauncher />);
    const renameButtons = screen.getAllByRole("button", { name: /rename/i });
    fireEvent.click(renameButtons[0]);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "My Scene" } });
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    expect(mockRenameScene).toHaveBeenCalledWith(0, "My Scene");
  });

  it("Escape cancels rename without calling bridge", () => {
    render(<SceneLauncher />);
    const renameButtons = screen.getAllByRole("button", { name: /rename/i });
    fireEvent.click(renameButtons[0]);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(mockRenameScene).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("blur confirms rename", async () => {
    render(<SceneLauncher />);
    const renameButtons = screen.getAllByRole("button", { name: /rename/i });
    fireEvent.click(renameButtons[0]);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Blur Name" } });
    await act(async () => { fireEvent.blur(input); });
    expect(mockRenameScene).toHaveBeenCalledWith(0, "Blur Name");
  });
});

describe.skip("SceneLauncher — capture scene", () => {
  beforeEach(() => {
    resetStores();
    mockSetActiveScene.mockResolvedValue(undefined);
    mockCaptureScene.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it("capture button fires bridge sequence: setActive then capture", async () => {
    render(<SceneLauncher />);
    const captureButtons = screen.getAllByRole("button", { name: /capture/i });
    await act(async () => { fireEvent.click(captureButtons[0]); });
    await waitFor(() => expect(mockSetActiveScene).toHaveBeenCalledWith(0));
    await waitFor(() => expect(mockCaptureScene).toHaveBeenCalled());
  });
});
