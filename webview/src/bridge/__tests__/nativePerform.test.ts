/**
 * Tests for bridge/nativePerform.ts.
 *
 * Covers all five scene management wrappers: SetActiveScene, AddScene,
 * CaptureScene, DeleteScene, RenameScene — happy + failure + strict-equality.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BridgePresets,
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import {
  nativePerformAddScene,
  nativePerformCaptureScene,
  nativePerformDeleteScene,
  nativePerformRenameScene,
  nativePerformSetActiveScene,
} from "../nativePerform";

describe("nativePerformSetActiveScene", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns true and passes index to host", async () => {
    bridge.mock.mockResolvedValueOnce(BridgePresets.boolOk);
    expect(await nativePerformSetActiveScene(2)).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith(
      "elementPerformSetActiveScene",
      [2],
    );
  });

  it("error path: returns false when host returns false", async () => {
    bridge.mock.mockResolvedValueOnce(BridgePresets.boolFail);
    expect(await nativePerformSetActiveScene(2)).toBe(false);
  });

  it("strict equality: non-boolean host response → false", async () => {
    bridge.mock.mockResolvedValueOnce(1);
    expect(await nativePerformSetActiveScene(0)).toBe(false);
  });
});

describe("nativePerformAddScene", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns true and passes name to host", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativePerformAddScene("My Scene")).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementPerformAddScene", [
      "My Scene",
    ]);
  });

  it("error path: returns false when host returns false", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativePerformAddScene("Bad")).toBe(false);
  });
});

describe("nativePerformCaptureScene", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns true, called with no args", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativePerformCaptureScene()).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementPerformCaptureScene", []);
  });

  it("error path: returns false when host returns false", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativePerformCaptureScene()).toBe(false);
  });
});

describe("nativePerformDeleteScene", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns true and passes index to host", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativePerformDeleteScene(1)).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementPerformDeleteScene", [1]);
  });

  it("error path: returns false when host returns false", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativePerformDeleteScene(1)).toBe(false);
  });
});

describe("nativePerformRenameScene", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns true and passes index + name to host", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    expect(await nativePerformRenameScene(0, "Main")).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith("elementPerformRenameScene", [
      0,
      "Main",
    ]);
  });

  it("error path: returns false when host rejects empty name", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativePerformRenameScene(0, "")).toBe(false);
  });

  it("strict equality: non-boolean host response → false", async () => {
    bridge.mock.mockResolvedValueOnce("ok");
    expect(await nativePerformRenameScene(0, "Scene")).toBe(false);
  });
});
