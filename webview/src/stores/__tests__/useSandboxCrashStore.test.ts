/**
 * Tests for useSandboxCrashStore — out-of-process plugin crash/restart state
 * (Lane-A reliability contract, R3). Nothing fake: an entry exists only when
 * the host pushes a real `onSandboxEvent` payload; `restart()` calls the real
 * `elementRestartSandbox` native fn and clears the badge only on a true result.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bridge/juceBackend", () => ({
  invokeElementNative: vi.fn(async () => undefined),
}));

import { invokeElementNative } from "../../bridge/juceBackend";
import {
  useSandboxCrashStore,
  selectSandboxEvent,
  selectSandboxNeedsAttention,
  type SandboxEventPayload,
} from "../useSandboxCrashStore";

const mockInvoke = invokeElementNative as unknown as ReturnType<typeof vi.fn>;

function ev(over: Partial<SandboxEventPayload> = {}): SandboxEventPayload {
  return {
    nodeId: 7,
    nodeUuid: "uuid-abc",
    kind: "crashed",
    reason: "ValhallaSupermassive crashed",
    ...over,
  };
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined);
  useSandboxCrashStore.setState({ events: {} });
});

afterEach(() => {
  useSandboxCrashStore.setState({ events: {} });
});

describe("useSandboxCrashStore.applyEvent", () => {
  it("records a crash event keyed by nodeUuid with kind + reason + ts", () => {
    const before = Date.now();
    useSandboxCrashStore.getState().applyEvent(ev());
    const rec = selectSandboxEvent("uuid-abc")(useSandboxCrashStore.getState());
    expect(rec).toBeDefined();
    expect(rec?.kind).toBe("crashed");
    expect(rec?.reason).toBe("ValhallaSupermassive crashed");
    expect(rec?.ts).toBeGreaterThanOrEqual(before);
  });

  it("ignores a payload with no nodeUuid (nothing fabricated)", () => {
    useSandboxCrashStore
      .getState()
      .applyEvent(ev({ nodeUuid: "" }));
    expect(useSandboxCrashStore.getState().events).toEqual({});
  });

  it("ignores a payload with an unknown kind", () => {
    useSandboxCrashStore
      .getState()
      // @ts-expect-error — deliberately invalid kind
      .applyEvent(ev({ kind: "exploded" }));
    expect(useSandboxCrashStore.getState().events).toEqual({});
  });

  it("overwrites with the latest event for the same node", () => {
    useSandboxCrashStore.getState().applyEvent(ev({ kind: "crashed" }));
    useSandboxCrashStore
      .getState()
      .applyEvent(ev({ kind: "restarted", reason: "" }));
    const rec = selectSandboxEvent("uuid-abc")(useSandboxCrashStore.getState());
    expect(rec?.kind).toBe("restarted");
  });
});

describe("selectSandboxNeedsAttention", () => {
  it("is true for crashed / loadFailed / error, false for restarted", () => {
    const s = useSandboxCrashStore;
    s.getState().applyEvent(ev({ kind: "crashed" }));
    expect(selectSandboxNeedsAttention("uuid-abc")(s.getState())).toBe(true);

    s.getState().applyEvent(ev({ kind: "loadFailed" }));
    expect(selectSandboxNeedsAttention("uuid-abc")(s.getState())).toBe(true);

    s.getState().applyEvent(ev({ kind: "restarted", reason: "" }));
    expect(selectSandboxNeedsAttention("uuid-abc")(s.getState())).toBe(false);
  });

  it("is false for a node with no recorded event", () => {
    expect(
      selectSandboxNeedsAttention("nope")(useSandboxCrashStore.getState()),
    ).toBe(false);
  });
});

describe("useSandboxCrashStore.restart", () => {
  it("calls elementRestartSandbox(uuid) and clears the badge on true", async () => {
    useSandboxCrashStore.getState().applyEvent(ev({ kind: "crashed" }));
    mockInvoke.mockResolvedValueOnce(true);

    const ok = await useSandboxCrashStore.getState().restart("uuid-abc");

    expect(ok).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("elementRestartSandbox", [
      "uuid-abc",
    ]);
    expect(
      selectSandboxEvent("uuid-abc")(useSandboxCrashStore.getState()),
    ).toBeUndefined();
  });

  it("keeps the badge when the host returns false (restart not issued)", async () => {
    useSandboxCrashStore.getState().applyEvent(ev({ kind: "crashed" }));
    mockInvoke.mockResolvedValueOnce(false);

    const ok = await useSandboxCrashStore.getState().restart("uuid-abc");

    expect(ok).toBe(false);
    expect(
      selectSandboxEvent("uuid-abc")(useSandboxCrashStore.getState()),
    ).toBeDefined();
  });

  it("returns false and keeps the badge when the bridge throws", async () => {
    useSandboxCrashStore.getState().applyEvent(ev({ kind: "crashed" }));
    mockInvoke.mockRejectedValueOnce(new Error("bridge down"));

    const ok = await useSandboxCrashStore.getState().restart("uuid-abc");

    expect(ok).toBe(false);
    expect(
      selectSandboxEvent("uuid-abc")(useSandboxCrashStore.getState()),
    ).toBeDefined();
  });
});

describe("useSandboxCrashStore.clear", () => {
  it("removes a node's recorded event", () => {
    useSandboxCrashStore.getState().applyEvent(ev());
    useSandboxCrashStore.getState().clear("uuid-abc");
    expect(
      selectSandboxEvent("uuid-abc")(useSandboxCrashStore.getState()),
    ).toBeUndefined();
  });
});
