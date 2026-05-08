/**
 * Tests for bridge/juceBackend.ts — invokeElementNative.
 *
 * Covers: dev-mode fallback (no window.__JUCE__ → returns undefined),
 * and bridge-present path (routes through backend.invokeNativeFunction).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import { invokeElementNative } from "../juceBackend";

type GlobalShape = {
  __JUCE__?: unknown;
};

describe("invokeElementNative", () => {
  describe("dev-mode: no __JUCE__ present", () => {
    let savedJuce: unknown;

    beforeEach(() => {
      const g = globalThis as unknown as GlobalShape;
      savedJuce = g.__JUCE__;
      delete g.__JUCE__;
    });

    afterEach(() => {
      const g = globalThis as unknown as GlobalShape;
      if (savedJuce === undefined) {
        delete g.__JUCE__;
      } else {
        g.__JUCE__ = savedJuce;
      }
    });

    it("returns undefined when window.__JUCE__ is absent", async () => {
      const result = await invokeElementNative("elementAnyCall", []);
      expect(result).toBeUndefined();
    });

    it("returns undefined regardless of args when no bridge", async () => {
      const result = await invokeElementNative("elementAppGetAbout", [1, 2, 3]);
      expect(result).toBeUndefined();
    });
  });

  describe("bridge-present path", () => {
    let bridge: JuceBridgeMock;

    beforeEach(() => {
      bridge = installJuceBridgeMock();
    });

    afterEach(() => {
      bridge.uninstall();
    });

    it("routes calls through backend.invokeNativeFunction", async () => {
      bridge.mock.mockResolvedValueOnce(true);
      const result = await invokeElementNative("elementPerformSetActiveScene", [
        2,
      ]);
      expect(result).toBe(true);
      expect(bridge.mock).toHaveBeenCalledWith(
        "elementPerformSetActiveScene",
        [2],
      );
    });

    it("forwards the name and args array unchanged", async () => {
      bridge.mock.mockResolvedValueOnce({ ok: true });
      await invokeElementNative("elementPresetSnapshot", ["node-1", "A"]);
      expect(bridge.mock).toHaveBeenCalledWith("elementPresetSnapshot", [
        "node-1",
        "A",
      ]);
    });

    it("defaults args to [] when not supplied", async () => {
      bridge.mock.mockResolvedValueOnce(undefined);
      await invokeElementNative("elementAppCheckForUpdates");
      expect(bridge.mock).toHaveBeenCalledWith(
        "elementAppCheckForUpdates",
        [],
      );
    });

    it("propagates the resolved value from the host", async () => {
      const payload = { name: "Element", version: "1.0", copyright: "© Test" };
      bridge.mock.mockResolvedValueOnce(payload);
      const result = await invokeElementNative("elementAppGetAbout", []);
      expect(result).toEqual(payload);
    });
  });
});
