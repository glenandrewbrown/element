/**
 * Tests for F-201 — Scene Activation Bridge Contract.
 *
 * The "scene divergence" bug class: `useAppStore.activeScene` (UI index)
 * and `usePerformStore.scenes[*].active` (engine truth) used to drift
 * because the Toolbar prev/next button updated the UI store without
 * triggering the bridge call.
 *
 * This contract test pins the chain end-to-end:
 *
 *   useAppStore.setScene(i)
 *      └─→ usePerformStore.activateScene(i)
 *           └─→ nativePerformSetActiveScene(i)
 *                └─→ invokeElementNative("elementPerformSetActiveScene", [i])
 *
 * If any link of that chain is removed (regressing F-201), one of the
 * assertions below will fail.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the JUCE backend BEFORE importing any store that references it.
vi.mock("../../bridge/juceBackend", () => ({
  invokeElementNative: vi.fn(async () => true),
}));

import { invokeElementNative } from "../../bridge/juceBackend";
import { useAppStore } from "../useAppStore";
import { usePerformStore } from "../usePerformStore";

const mockInvoke = invokeElementNative as unknown as ReturnType<typeof vi.fn>;

describe("F-201 scene activation bridge contract", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(true);

    // Seed a few scenes in the perform store so activateScene has work to do.
    usePerformStore.setState({
      scenes: [
        { id: "s0", index: 0, name: "Scene 1", active: true, hasCapture: false },
        { id: "s1", index: 1, name: "Scene 2", active: false, hasCapture: false },
        { id: "s2", index: 2, name: "Scene 3", active: false, hasCapture: false },
      ],
    });

    useAppStore.setState({ activeScene: 0 });
  });

  afterEach(() => {
    mockInvoke.mockReset();
  });

  it("useAppStore.setScene updates the UI index", () => {
    useAppStore.getState().setScene(2);
    expect(useAppStore.getState().activeScene).toBe(2);
  });

  it("useAppStore.setScene also flips usePerformStore.scenes[*].active", () => {
    useAppStore.getState().setScene(1);
    const scenes = usePerformStore.getState().scenes;
    expect(scenes[0].active).toBe(false);
    expect(scenes[1].active).toBe(true);
    expect(scenes[2].active).toBe(false);
  });

  it("useAppStore.setScene reaches the bridge (elementPerformSetActiveScene)", () => {
    useAppStore.getState().setScene(2);
    expect(mockInvoke).toHaveBeenCalledWith(
      "elementPerformSetActiveScene",
      [2],
    );
  });

  it("usePerformStore.activateScene reaches the bridge directly", () => {
    usePerformStore.getState().activateScene(1);
    expect(mockInvoke).toHaveBeenCalledWith(
      "elementPerformSetActiveScene",
      [1],
    );
  });

  it("Toolbar prev/next semantics: setScene(N) hits the bridge with N", () => {
    // Replicates the Toolbar's `(activeSceneIdx + 1) % sceneCount` math —
    // the Toolbar component itself isn't mounted here, but the same
    // setScene invocation is the load-bearing chain.
    const sceneCount = 3;
    const start = useAppStore.getState().activeScene;

    // Next
    const nextIdx = (start + 1) % sceneCount;
    useAppStore.getState().setScene(nextIdx);
    expect(mockInvoke).toHaveBeenLastCalledWith(
      "elementPerformSetActiveScene",
      [nextIdx],
    );

    // Prev (from the new active index)
    const cur = useAppStore.getState().activeScene;
    const prevIdx = (cur - 1 + sceneCount) % sceneCount;
    useAppStore.getState().setScene(prevIdx);
    expect(mockInvoke).toHaveBeenLastCalledWith(
      "elementPerformSetActiveScene",
      [prevIdx],
    );

    // Two button presses → two bridge calls.
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});
