import { create } from "zustand";
import { invokeElementNative } from "../bridge/juceBackend";
import { logBridgeError } from "../bridge/bridgeError";

/**
 * Out-of-process (sandboxed) plugin lifecycle, keyed by node UUID
 * (Lane-A reliability contract, R3). The host pushes
 * `window.__elementNative.onSandboxEvent({nodeId, nodeUuid, kind, reason})`
 * ONLY for sandboxed nodes (Preferences → Plugins → Sandbox Mode, default OFF);
 * in-process nodes never emit. This store records the latest event per node so
 * a follow-up can render the Block "plugin crashed — reload" badge.
 *
 * Nothing fake: entries appear only when the host emits a real worker event.
 */
export type SandboxEventKind =
  | "crashed"
  | "restarted"
  | "loadFailed"
  | "error";

/** The payload the host pushes on `onSandboxEvent` (Lane-A contract). */
export interface SandboxEventPayload {
  nodeId: number;
  nodeUuid: string;
  kind: SandboxEventKind;
  reason: string;
}

/** Latest recorded sandbox event for a node (+ receipt timestamp). */
export interface SandboxNodeState {
  kind: SandboxEventKind;
  reason: string;
  /** `Date.now()` when the event was received in the webview. */
  ts: number;
}

interface SandboxCrashState {
  /** Keyed by nodeUuid (the id React Block components use). */
  events: Record<string, SandboxNodeState>;
  /** Record a host-pushed sandbox event. */
  applyEvent: (payload: SandboxEventPayload) => void;
  /** Clear the recorded event for a node (e.g. after a successful reload). */
  clear: (nodeUuid: string) => void;
  /**
   * Ask the host to restart the sandboxed worker for a node
   * (`elementRestartSandbox`). Resolves true if the node is sandboxed and a
   * restart was issued. On success the recorded crash event is cleared so the
   * badge dismisses; the host will then emit a fresh `restarted` event.
   */
  restart: (nodeUuid: string) => Promise<boolean>;
}

const KINDS: ReadonlySet<string> = new Set([
  "crashed",
  "restarted",
  "loadFailed",
  "error",
]);

function isSandboxEventKind(v: unknown): v is SandboxEventKind {
  return typeof v === "string" && KINDS.has(v);
}

export const useSandboxCrashStore = create<SandboxCrashState>()((set) => ({
  events: {},

  applyEvent: (payload) =>
    set((state) => {
      if (
        payload == null ||
        typeof payload.nodeUuid !== "string" ||
        payload.nodeUuid.length === 0 ||
        !isSandboxEventKind(payload.kind)
      ) {
        return state;
      }
      return {
        events: {
          ...state.events,
          [payload.nodeUuid]: {
            kind: payload.kind,
            reason:
              typeof payload.reason === "string" ? payload.reason : "",
            ts: Date.now(),
          },
        },
      };
    }),

  clear: (nodeUuid) =>
    set((state) => {
      if (!(nodeUuid in state.events)) return state;
      const next = { ...state.events };
      delete next[nodeUuid];
      return { events: next };
    }),

  restart: async (nodeUuid) => {
    try {
      const ok = await invokeElementNative("elementRestartSandbox", [nodeUuid]);
      if (ok === true) {
        // Optimistically clear the crash badge; the host emits a fresh
        // `restarted` event which re-populates if the reload itself fails.
        set((state) => {
          if (!(nodeUuid in state.events)) return state;
          const next = { ...state.events };
          delete next[nodeUuid];
          return { events: next };
        });
        return true;
      }
      return false;
    } catch (err) {
      logBridgeError("useSandboxCrashStore.restart", err);
      return false;
    }
  },
}));

// ── Selectors ──

/** Latest sandbox event for a node, or undefined if none recorded. */
export const selectSandboxEvent =
  (nodeUuid: string) =>
  (s: SandboxCrashState): SandboxNodeState | undefined =>
    s.events[nodeUuid];

/** True when a node is currently in a crashed / load-failed / error state. */
export const selectSandboxNeedsAttention =
  (nodeUuid: string) =>
  (s: SandboxCrashState): boolean => {
    const e = s.events[nodeUuid];
    return e != null && e.kind !== "restarted";
  };
