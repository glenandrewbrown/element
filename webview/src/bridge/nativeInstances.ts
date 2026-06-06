// U11 — Multi-instance bridge wrappers.
//
// Calls the C++ `elementGetInstances` / `elementGetInstanceSnapshot` handlers
// registered in `src/ui/element_webview_host.cpp`. "Instance" = an Element
// PluginProcessor living in the same host OS process (true when a DAW loads 2+
// Element plugin instances). The instance list is the literal set of live
// PluginProcessor objects on the C++ side — populated in the ctor, erased in
// the dtor — so it is exactly the currently-alive instances.
//
// NOTHING fake: in the standalone app / single-instance host the list is empty
// (or just self) and the bridge returns `null` in pure dev (no `__JUCE__`). A
// dead / scan-only mirror target returns `{ unavailable:true }`. We never
// fabricate peer instances or mirrored graph data.
import { invokeElementNative } from "./juceBackend";
import { logBridgeError } from "./bridgeError";

/** One live Element plugin instance in this host process. */
export interface InstanceInfo {
  /** Stable per-instance id (monotonic, > 0). */
  id: number;
  /** Live display name (loaded project/session name, or honest fallback). */
  name: string;
  /** PluginProcessor::Variant — 0=Instrument, 1=Effect, 2=MidiEffect. */
  variant: number;
  /** True for THIS webview's own instance (−1 selfId → all false, honest). */
  isSelf: boolean;
  /** True when the instance has a real loaded graph (false for scan-only). */
  hasGraph: boolean;
}

export interface InstancesResult {
  /** Live instances in this host OS process. Empty == honest standalone. */
  instances: InstanceInfo[];
  /** Id of this webview's own instance, or −1 when not a plugin instance. */
  selfId: number;
}

/**
 * Raw peer graph snapshot — the SAME shape `buildActiveGraphJson()` /
 * `elementGetGraphState` produce (schema:2, session, graphs, breadcrumbs,
 * blocks, cables, engine…). We keep this intentionally loose (the full type is
 * the un-exported `EngineSnapshot` in useJuceBridge.ts); MirrorPanel only reads
 * a handful of honest summary fields. `unavailable` flags a dead/scan-only peer.
 */
export interface GraphSnapshotRaw {
  schema?: number;
  schemaVersion?: number;
  unavailable?: boolean;
  session?: { name?: string };
  breadcrumbs?: string[];
  blocks?: Array<{
    id?: string;
    name?: string;
    category?: string;
    isContainer?: boolean;
  }>;
  cables?: unknown[];
  engine?: { isPlaying?: boolean };
  [key: string]: unknown;
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseObjectOrString(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as Record<string, unknown>;
  return null;
}

/**
 * Fetch the list of live Element instances. Returns `null` in pure dev (no
 * `__JUCE__` bridge) so the caller keeps its honest empty/single state — NOT a
 * silent failure (we only log on a genuine parse failure, not on null).
 */
export async function nativeGetInstances(): Promise<InstancesResult | null> {
  let raw: unknown;
  try {
    raw = await invokeElementNative("elementGetInstances", []);
  } catch (err) {
    logBridgeError("nativeGetInstances.invoke", err);
    return null;
  }
  // `raw == null` is the dev-mode no-bridge fallback — don't log it.
  if (raw == null) return null;
  // §2.3 sentinel: host returns "~" when the instance list is unchanged since
  // the last reply. Treat as "no change" → return null so the store's
  // idle-tick diff-skip keeps the consumer render count at zero. Do NOT log.
  if (raw === "~") return null;

  const parsed = parseObjectOrString(raw);
  if (parsed == null) {
    logBridgeError("nativeGetInstances.parse", raw);
    return null;
  }

  const arr = Array.isArray(parsed.instances) ? parsed.instances : [];
  const instances: InstanceInfo[] = arr.map((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    return {
      id: num(o.id),
      name: str(o.name),
      variant: num(o.variant),
      isSelf: bool(o.isSelf),
      hasGraph: bool(o.hasGraph),
    };
  });

  return {
    instances,
    selfId: num(parsed.selfId, -1),
  };
}

/**
 * Fetch a read-only graph snapshot of a peer instance by id. Returns `null` in
 * pure dev (no bridge). A dead / scan-only target resolves to a snapshot with
 * `unavailable: true` and no graphs — the caller renders the honest "Instance
 * unavailable" empty state rather than any stale/fake graph.
 */
export async function nativeGetInstanceSnapshot(
  targetId: number,
): Promise<GraphSnapshotRaw | null> {
  let raw: unknown;
  try {
    raw = await invokeElementNative("elementGetInstanceSnapshot", [targetId]);
  } catch (err) {
    logBridgeError("nativeGetInstanceSnapshot.invoke", err);
    return null;
  }
  if (raw == null) return null;

  const parsed = parseObjectOrString(raw);
  if (parsed == null) {
    logBridgeError("nativeGetInstanceSnapshot.parse", raw);
    return null;
  }
  return parsed as GraphSnapshotRaw;
}
