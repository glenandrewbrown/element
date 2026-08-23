/**
 * Tests for bridge/nativeApp.ts.
 *
 * Covers nativeAppGetAbout (happy + malformed shape) and
 * nativeAppCheckForUpdates (fire-and-forget, no return value).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BridgePresets,
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../test/mockJuceBridge";
import { nativeAppCheckForUpdates, nativeAppGetAbout } from "../nativeApp";

describe("nativeAppGetAbout", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("happy path: returns parsed AboutInfo from host", async () => {
    bridge.mock.mockResolvedValueOnce(BridgePresets.aboutInfo);
    const info = await nativeAppGetAbout();
    expect(info).toEqual({
      name: "Element",
      version: "0.0.0",
      copyright: "© Test",
    });
    expect(bridge.mock).toHaveBeenCalledWith("elementAppGetAbout", []);
  });

  it("returns null when host returns null", async () => {
    bridge.mock.mockResolvedValueOnce(null);
    expect(await nativeAppGetAbout()).toBeNull();
  });

  it("returns null when host returns a string (malformed shape)", async () => {
    bridge.mock.mockResolvedValueOnce("not-an-object");
    expect(await nativeAppGetAbout()).toBeNull();
  });

  it("returns null when host returns a number (malformed shape)", async () => {
    bridge.mock.mockResolvedValueOnce(42);
    expect(await nativeAppGetAbout()).toBeNull();
  });

  it("fills missing fields with fallback strings", async () => {
    bridge.mock.mockResolvedValueOnce({});
    const info = await nativeAppGetAbout();
    expect(info).toEqual({ name: "Element", version: "", copyright: "" });
  });
});

describe("nativeAppCheckForUpdates", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
  });

  afterEach(() => {
    bridge.uninstall();
  });

  it("fire-and-forget: resolves without returning a value", async () => {
    bridge.mock.mockResolvedValueOnce(undefined);
    const result = await nativeAppCheckForUpdates();
    expect(result).toBeUndefined();
    expect(bridge.mock).toHaveBeenCalledWith(
      "elementAppCheckForUpdates",
      [],
    );
  });
});
