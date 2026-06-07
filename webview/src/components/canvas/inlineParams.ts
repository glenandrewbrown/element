/**
 * T5 — Bitwig-style inline controls on built-in (INT) Block faces.
 *
 * This module is the SPEC + VALIDATION for curated inline faces. It does NOT
 * render anything — `inline/InlineFace.tsx` consumes the resolved spec and the
 * live param metadata to draw the widgets. Keeping the registry + validation
 * pure makes the "fall back to the generic deck on any mismatch" rule
 * mechanically testable (see inlineParams.test.ts).
 *
 * NOTHING-FAKE (Glen hard rule): a curated face may only bind a control to a
 * parameter that REALLY exists on the node. The host enumerates parameters from
 * `proc->getAudioProcessor()->getParameters()` (element_webview_host.cpp
 * buildNodeParametersJson). Element's built-in logic/utility Processors
 * (ComparatorNode, LogicGateNode, …) are native `element::Processor`s whose
 * `getAudioProcessor()` returns nullptr — so they expose ZERO host parameters.
 * Their operator/mode is set via `elementNodeSetIntMode`, NOT a param. Hence the
 * first-wave curated faces are CHOOSER-ONLY for compare + logic.
 *
 * For any `kind: "knob" | "toggle"` entry we validate `expectName` against the
 * real param at `paramIndex` at runtime; if it doesn't match (or the param is
 * absent) the WHOLE curated face is rejected and the caller renders the existing
 * generic 3-knob deck. We never render a half-broken face or silently hide a
 * curated control.
 *
 * Enum evidence (verified against src/nodes/logicnodes.hpp):
 *   ComparatorNode::Op  — greater=0, greaterEqual=1, less=2, lessEqual=3,
 *                         equal=4, notEqual=5  →  > >= < <= == !=
 *   LogicGateNode::Mode — andMode=0, orMode=1, xorMode=2, nandMode=3,
 *                         norMode=4, notMode=5  →  AND OR XOR NAND NOR NOT
 * (The header's `notMode` is REAL and included — the task brief's 5-label list
 * omitted it; we follow the engine truth.)
 */

import type { NodeParameterRow } from "../../bridge/nativeGraph";

/** One control on a curated inline face. */
export type InlineFaceEntry =
  | {
      kind: "knob";
      /** Host parameter index this knob binds to. */
      paramIndex: number;
      /**
       * Validation guard — the real param name at `paramIndex` must match this
       * (string = case-insensitive substring; RegExp = test). Mismatch rejects
       * the whole face. Omit only when binding is structurally guaranteed.
       */
      expectName?: string | RegExp;
      /** Optional port id; if that Value/CV port is connected, the widget is
       *  swapped for the param-port chip (Blender rule). */
      portId?: string;
      /** Short caption under the knob (defaults to the real param name). */
      label?: string;
    }
  | {
      kind: "toggle";
      paramIndex: number;
      expectName?: string | RegExp;
      portId?: string;
      label?: string;
    }
  | {
      kind: "opChooser";
      /** Ordered options; `value` is the integer mode written via
       *  `nativeNodeSetIntMode`, rendered from `d.intMode` (engine truth). */
      options: { value: number; label: string }[];
      /** Accessible label for the chooser row (e.g. "Operator"). */
      title: string;
    }
  | {
      kind: "midiActivity";
      /** Caption shown beside the activity indicator. */
      label: string;
    };

/**
 * Per-entry density visibility (D2 — Wave-2 schema, Wave-3 consumer).
 *
 * A single curated face must render at THREE deliberate heights (Decision A
 * combined model): `compact` (collapsed — header + activity well only, NO
 * controls), `medium` (default — 1–2 primary controls), `large` (focused —
 * full control grid). Declared per-tier so ONE spec deserializes the three
 * Stitch layouts instead of needing three separate specs.
 */
export type InlineFaceDensity = "compact" | "medium" | "large";

/** A curated inline face: an ordered list of ≤6 entries. */
export interface InlineFaceSpec {
  /** Ordered controls (registry enforces ≤6 by convention; not load-bearing). */
  entries: InlineFaceEntry[];
  /**
   * D2 density-variant schema (Wave-2 addition, Wave-3 consumer — no-op until
   * the density-aware renderer lands). Maps each density tier to the subset of
   * `entries` (by index) shown at that tier, letting ONE face be compact/medium/
   * large. Optional: when absent the face renders all entries (the current
   * single-size behaviour, unchanged). When present it is validated for
   * index-bounds by {@link validateInlineFace} (NOTHING-fake: a density bucket
   * can only reference controls that really exist on the face).
   */
  densities?: {
    /** Entry indices shown when collapsed/compact (usually [] — compact = no
     *  controls, just header + activity well per D5). */
    compact?: number[];
    /** Entry indices shown at the default medium height. */
    medium?: number[];
    /** Entry indices shown at the focused large height. */
    large?: number[];
  };
}

// ── Compare / Logic op tables (engine-verified) ─────────────────────────────

const COMPARE_OPS: { value: number; label: string }[] = [
  { value: 0, label: ">" },
  { value: 1, label: ">=" },
  { value: 2, label: "<" },
  { value: 3, label: "<=" },
  { value: 4, label: "==" },
  { value: 5, label: "!=" },
];

const LOGIC_MODES: { value: number; label: string }[] = [
  { value: 0, label: "AND" },
  { value: 1, label: "OR" },
  { value: 2, label: "XOR" },
  { value: 3, label: "NAND" },
  { value: 4, label: "NOR" },
  { value: 5, label: "NOT" },
];

/**
 * Curated inline-face registry keyed by the internal node `identifier`.
 *
 * First wave (honest — only nodes whose real surface we can drive without
 * fabricating anything):
 *   • element.compare → operator chooser (6 ops). The node exposes NO host
 *     params (epsilon is a raw-state atomic, not an AudioProcessorParameter),
 *     so it is chooser-only.
 *   • element.logic   → mode chooser (6 modes, incl. NOT). Chooser-only for the
 *     same reason.
 *
 * Param-driven faces (constant/trigger/envFollower/midiTranspose/…) are NOT
 * registered yet: those Processors expose zero host parameters at runtime, so a
 * micro-knob face would have nothing real to bind to. Registering them would
 * either fabricate controls or always fall back — neither is useful. The knob/
 * toggle infrastructure ships ready, so the moment a built-in (or any node)
 * exposes a real validated parameter, a one-line registry entry lights it up.
 */
export const INLINE_FACE_REGISTRY: Record<string, InlineFaceSpec> = {
  "element.compare": {
    entries: [{ kind: "opChooser", title: "Operator", options: COMPARE_OPS }],
  },
  "element.logic": {
    entries: [{ kind: "opChooser", title: "Mode", options: LOGIC_MODES }],
  },
};

/** Look up the curated face for an identifier (undefined = not curated). */
export function getInlineFaceSpec(
  identifier: string | undefined,
): InlineFaceSpec | undefined {
  if (!identifier) return undefined;
  return INLINE_FACE_REGISTRY[identifier];
}

/** True when the real param name satisfies the entry's `expectName` guard. */
function paramNameMatches(
  expect: string | RegExp,
  actualName: string,
): boolean {
  if (expect instanceof RegExp) return expect.test(actualName);
  return actualName.toLowerCase().includes(expect.toLowerCase());
}

/**
 * Validate a curated face against the node's REAL parameter metadata.
 *
 * Returns true only if every knob/toggle entry resolves to an existing param
 * whose name matches `expectName` (when set). opChooser / midiActivity entries
 * carry no param binding and are always structurally valid. An empty `params`
 * array therefore rejects any face that contains a knob/toggle entry — exactly
 * the "fall back, never half-broken" rule.
 *
 * `params` is the array from `nativeGetNodeParameters(nodeId)`. Pass [] while
 * metadata is still loading → the face is treated as not-yet-valid and the
 * caller renders the generic deck until real metadata arrives.
 */
export function validateInlineFace(
  spec: InlineFaceSpec,
  params: NodeParameterRow[],
): boolean {
  const byIndex = new Map<number, NodeParameterRow>();
  for (const p of params) byIndex.set(p.index, p);

  for (const entry of spec.entries) {
    if (entry.kind !== "knob" && entry.kind !== "toggle") continue;
    const row = byIndex.get(entry.paramIndex);
    if (!row) return false; // param absent → reject whole face
    if (entry.expectName && !paramNameMatches(entry.expectName, row.name))
      return false; // name mismatch → reject whole face
  }

  // D2 density-variant pass-through validation (Wave-2 schema): every index in
  // a density bucket must reference a real entry. An out-of-bounds density index
  // is a malformed face (would render a control that doesn't exist) → reject,
  // same "never half-broken" discipline as the param checks above. No-op when
  // `densities` is absent (the common single-size case).
  if (spec.densities) {
    const n = spec.entries.length;
    for (const bucket of [
      spec.densities.compact,
      spec.densities.medium,
      spec.densities.large,
    ]) {
      if (!bucket) continue;
      for (const idx of bucket) {
        if (!Number.isInteger(idx) || idx < 0 || idx >= n) return false;
      }
    }
  }
  return true;
}

/**
 * Does this curated face need real param metadata to render?
 * (i.e. contains at least one knob/toggle entry). Chooser-only faces
 * (compare/logic) do not — they validate without any metadata fetch.
 */
export function faceNeedsParamMeta(spec: InlineFaceSpec): boolean {
  return spec.entries.some((e) => e.kind === "knob" || e.kind === "toggle");
}
