/**
 * Tests for bridge/nativeKeyboard.ts.
 *
 * Covers nativeVirtualKeyboardNoteOn and nativeVirtualKeyboardNoteOff —
 * happy path (true), failure (false), and strict-equality non-boolean guard.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import {
  nativeVirtualKeyboardNoteOff,
  nativeVirtualKeyboardNoteOn,
} from "../nativeKeyboard";

describe("nativeVirtualKeyboardNoteOn", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns true when host returns true", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    const result = await nativeVirtualKeyboardNoteOn(60, 0.8, 1);
    expect(result).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith(
      "elementVirtualKeyboardNoteOn",
      [60, 0.8, 1],
    );
  });

  it("returns false when host returns false", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeVirtualKeyboardNoteOn(60, 0.8, 1)).toBe(false);
  });

  it("strict equality: non-boolean host response → false", async () => {
    bridge.mock.mockResolvedValueOnce(1);
    expect(await nativeVirtualKeyboardNoteOn(60, 0.8, 1)).toBe(false);
  });
});

describe("nativeVirtualKeyboardNoteOff", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns true when host returns true", async () => {
    bridge.mock.mockResolvedValueOnce(true);
    const result = await nativeVirtualKeyboardNoteOff(60, 1);
    expect(result).toBe(true);
    expect(bridge.mock).toHaveBeenCalledWith(
      "elementVirtualKeyboardNoteOff",
      [60, 1],
    );
  });

  it("returns false when host returns false", async () => {
    bridge.mock.mockResolvedValueOnce(false);
    expect(await nativeVirtualKeyboardNoteOff(60, 1)).toBe(false);
  });

  it("strict equality: non-boolean host response → false", async () => {
    bridge.mock.mockResolvedValueOnce("ok");
    expect(await nativeVirtualKeyboardNoteOff(60, 1)).toBe(false);
  });
});
