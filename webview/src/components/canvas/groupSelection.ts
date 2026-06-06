/**
 * T10 — "Group selection into a Container" (Cmd+Shift+D / block context menu).
 *
 * Webview-side gate + bridge call. The C++ handler (elementGroupNodes →
 * EngineService::groupNodes) enforces the same refusals (defense in depth);
 * gating here gives instant plain-language feedback without a bridge round
 * trip, and pre-checks the CV-boundary rule the engine cannot satisfy
 * (default Containers expose no CV ports, so a Value/CV cable crossing the
 * selection boundary has no rewiring path — refuse rather than silently drop).
 */
import { useGraphStore } from "../../stores/useGraphStore";
import { nativeGroupNodes } from "../../bridge/nativeGraph";
import type { BlockData } from "../../data/types";

/** Graph IO device nodes — semantically bound to THEIR board; never groupable. */
const IO_IDENTIFIERS = new Set([
  "audio.input",
  "audio.output",
  "midi.input",
  "midi.output",
]);

export type GroupRefusal =
  | "need-2" // fewer than 2 eligible blocks selected
  | "ineligible" // selection contains IO device / Container / Portal
  | "cv-boundary" // a Value/CV cable crosses the selection boundary
  | (string & {}); // engine-reported reason passthrough

/** Plain-language refusal copy for the status hint. */
export const GROUP_REFUSAL_COPY: Record<string, string> = {
  "need-2": "Select at least 2 blocks to group",
  ineligible: "Can't group I/O, Container or Portal blocks",
  "cv-boundary":
    "Can't group: a CV cable crosses the selection edge (Containers have no CV ports yet)",
};

export function isGroupEligible(b: BlockData): boolean {
  if (b.isPortal) return false;
  if (b.containerNodeCount !== undefined) return false; // Container block
  if (b.identifier && IO_IDENTIFIERS.has(b.identifier)) return false;
  if (b.identifier === "element.graph") return false;
  return true;
}

/**
 * Validate + group the given selection. Returns the engine container id on
 * success; a {@link GroupRefusal} reason otherwise. Engine-driven refresh —
 * no optimistic graph surgery here.
 */
export async function groupSelectedBlocks(
  selectedIds: string[],
): Promise<{ ok: true; containerId: string } | { ok: false; reason: GroupRefusal }> {
  if (selectedIds.length < 2) return { ok: false, reason: "need-2" };

  const { nodes, edges } = useGraphStore.getState();
  const sel = new Set(selectedIds);
  const selectedBlocks = nodes.filter((n) => sel.has(n.id));
  if (selectedBlocks.length < 2) return { ok: false, reason: "need-2" };
  if (!selectedBlocks.every(isGroupEligible))
    return { ok: false, reason: "ineligible" };

  // CV-boundary pre-check: exactly one end inside the selection + Value type.
  const cvBoundary = edges.some((e) => {
    const inA = sel.has(e.source);
    const inB = sel.has(e.target);
    return inA !== inB && e.signalType === "value";
  });
  if (cvBoundary) return { ok: false, reason: "cv-boundary" };

  return nativeGroupNodes(selectedIds);
}
