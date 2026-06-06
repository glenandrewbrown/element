/**
 * T5 — cached node-parameter metadata fetch for inline faces.
 *
 * `nativeGetNodeParameters(nodeId)` is a one-shot host round-trip describing a
 * node's REAL parameters (names/ranges/stepped/boolean). For inline-face
 * validation we need it once per node, cached so every Block re-render doesn't
 * re-hit the bridge. The cache is invalidated when a node disappears from the
 * live graph (topology change → the UUID may be reused by a different node).
 *
 * The live VALUES still flow through useParameterStore (15 Hz); this module only
 * caches the static metadata (shape), exactly like InspectorHub fetches it.
 */

import { useEffect, useState } from "react";
import {
  nativeGetNodeParameters,
  type NodeParameterRow,
} from "../../../bridge/nativeGraph";

/** Module-level metadata cache. Exported helpers below manage invalidation. */
const metaCache = new Map<string, NodeParameterRow[]>();
const inflight = new Map<string, Promise<NodeParameterRow[]>>();

/** Read a cached entry without fetching (undefined = never fetched). */
export function peekNodeParamMeta(
  nodeId: string,
): NodeParameterRow[] | undefined {
  return metaCache.get(nodeId);
}

/** Drop a single node's cached metadata (e.g. on plugin replace). */
export function invalidateNodeParamMeta(nodeId: string): void {
  metaCache.delete(nodeId);
  inflight.delete(nodeId);
}

/**
 * Invalidate every cached node NOT present in `liveNodeIds` — call after a graph
 * topology change so a reused UUID can't serve stale metadata. Returns the set
 * of ids that were pruned (useful for tests).
 */
export function pruneNodeParamMeta(liveNodeIds: Iterable<string>): string[] {
  const live = new Set<string>();
  for (const id of liveNodeIds) live.add(id);
  const pruned: string[] = [];
  for (const id of metaCache.keys()) {
    if (!live.has(id)) {
      pruned.push(id);
    }
  }
  for (const id of pruned) {
    metaCache.delete(id);
    inflight.delete(id);
  }
  return pruned;
}

/** Test-only: clear the entire cache. */
export function _clearNodeParamMetaCache(): void {
  metaCache.clear();
  inflight.clear();
}

async function fetchMeta(nodeId: string): Promise<NodeParameterRow[]> {
  const cached = metaCache.get(nodeId);
  if (cached) return cached;
  const existing = inflight.get(nodeId);
  if (existing) return existing;
  const p = nativeGetNodeParameters(nodeId)
    .then(({ parameters }) => {
      metaCache.set(nodeId, parameters);
      inflight.delete(nodeId);
      return parameters;
    })
    .catch(() => {
      inflight.delete(nodeId);
      return [];
    });
  inflight.set(nodeId, p);
  return p;
}

/**
 * Hook: returns the cached metadata for `nodeId`, fetching once on mount (or
 * when `enabled` flips true). While loading it returns `null` (distinct from `[]`
 * = "fetched, no params") so the caller can keep the generic deck until truth
 * arrives — never flashing a half-built face.
 *
 * Pass `enabled={false}` for chooser-only faces that don't need metadata at all
 * (avoids a needless round-trip on every compare/logic block).
 */
export function useNodeParamMeta(
  nodeId: string,
  enabled = true,
): NodeParameterRow[] | null {
  const [meta, setMeta] = useState<NodeParameterRow[] | null>(
    () => (enabled ? metaCache.get(nodeId) ?? null : []),
  );

  useEffect(() => {
    if (!enabled) {
      setMeta([]);
      return;
    }
    let cancelled = false;
    const cached = metaCache.get(nodeId);
    if (cached) {
      setMeta(cached);
      return;
    }
    setMeta(null);
    void fetchMeta(nodeId).then((rows) => {
      if (!cancelled) setMeta(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [nodeId, enabled]);

  return meta;
}
