/**
 * T5 — InlineFace: renders a VALIDATED curated inline face for a built-in (INT)
 * Block. Mounted by Block.tsx ONLY when:
 *   d.format === "INT" && a registry spec exists && validateInlineFace passed.
 * (Validation + the metadata fetch happen in Block.tsx so hook order stays
 * stable; this component receives an already-validated spec + the live meta.)
 *
 * Per-entry rendering:
 *   • opChooser   → InlineChooserRow (writes nativeNodeSetIntMode, renders intMode)
 *   • knob/toggle → InlineMicroKnob / InlineToggle bound to the real param,
 *                   UNLESS the entry's portId is a CONNECTED Value/CV port
 *                   (Blender rule) → render the param-port chip instead.
 *   • midiActivity → skipped (no real per-node MIDI activity feed exists yet —
 *                   see report; we never fake blinkenlights).
 *
 * Values: read off useParameterStore with useShallow (deriving an array without
 * it infinite-loops useSyncExternalStore — same constraint as Block's knobParams
 * selector). Writes: setLocal (optimistic) + nativeSetNodeParameter.
 */

import { useShallow } from "zustand/react/shallow";
import type { BlockData } from "../../../data/types";
import type { NodeParameterRow } from "../../../bridge/nativeGraph";
import {
  nativeSetNodeParameter,
  nativeNodeSetIntMode,
  nativeNodeSetParam,
} from "../../../bridge/nativeGraph";
import { useParameterStore } from "../../../stores/useParameterStore";
import type { InlineFaceSpec, InlineFaceEntry } from "../inlineParams";
import { InlineChooserRow } from "./InlineChooserRow";
import { InlineMicroKnob } from "./InlineMicroKnob";
import { InlineToggle } from "./InlineToggle";
import { InlineAtomicKnob } from "./InlineAtomicKnob";
import { TransformFace } from "./faces/TransformFace";
import type { FC } from "react";

interface InlineFaceProps {
  d: BlockData;
  spec: InlineFaceSpec;
  /** Validated metadata (already passed validateInlineFace). */
  meta: NodeParameterRow[];
}

/**
 * Bespoke archetype faces resolved by `componentKey` (keeps inlineParams.ts
 * render-free). When a spec sets componentKey, InlineFace renders the mapped
 * component (which reads d.inlineParams itself) instead of the generic entries.
 */
const FACE_COMPONENTS: Record<string, FC<{ d: BlockData }>> = {
  transform: TransformFace,
};

/** Param-port chip shown when a curated knob's port is wired (Blender rule). */
function ParamPortChip({ label }: { label: string }) {
  const ACCENT = "#E8A838"; // Value/CV orange — the chip IS a wired CV param
  return (
    <div
      className="flex flex-col items-center gap-0.5"
      data-testid="inline-portchip"
    >
      <span
        className="flex items-center justify-center"
        style={{
          width: 28,
          height: 18,
          borderRadius: 3,
          background: `${ACCENT}1A`,
          border: `1px solid ${ACCENT}55`,
          boxShadow: `0 0 4px ${ACCENT}40`,
        }}
      >
        <span
          aria-hidden
          style={{ fontSize: 9, color: ACCENT, lineHeight: 1 }}
        >
          ⟿
        </span>
      </span>
      <span
        className="font-bold uppercase tracking-tight leading-none text-text-secondary"
        style={{ fontSize: 7 }}
      >
        {label}
      </span>
    </div>
  );
}

export function InlineFace({ d, spec, meta }: InlineFaceProps) {
  // Bespoke designed archetype face: render the mapped component (it reads
  // d.inlineParams itself) and ignore the generic entries path.
  if (spec.componentKey) {
    const FaceComp = FACE_COMPONENTS[spec.componentKey];
    if (FaceComp) return <FaceComp d={d} />;
  }

  const byIndex = new Map<number, NodeParameterRow>();
  for (const p of meta) byIndex.set(p.index, p);

  // Indices used by knob/toggle entries — read their live values in one shallow
  // selector (array order matches the entry order of param-bearing entries).
  const paramIndices = spec.entries
    .filter(
      (e): e is Extract<InlineFaceEntry, { paramIndex: number }> =>
        e.kind === "knob" || e.kind === "toggle",
    )
    .map((e) => e.paramIndex);

  const setLocal = useParameterStore((s) => s.setLocal);
  const liveValues = useParameterStore(
    useShallow((st) => {
      const out: Record<number, number> = {};
      for (const i of paramIndices) {
        const v = st.values[`${d.id}:${i}`];
        if (typeof v === "number") out[i] = v;
      }
      return out;
    }),
  );

  // Map portId → connected, to apply the Blender swap.
  const portConnected = new Map<string, boolean>();
  for (const p of d.ports) portConnected.set(p.id, p.connected && p.type === "value");

  const writeParam = (paramIndex: number, norm: number) => {
    setLocal(d.id, paramIndex, norm);
    void nativeSetNodeParameter(d.id, paramIndex, norm);
  };

  return (
    <div
      className="flex items-center gap-1.5 w-full min-w-0"
      data-testid="inline-face"
    >
      {spec.entries.map((entry, i) => {
        if (entry.kind === "opChooser") {
          return (
            <InlineChooserRow
              key={i}
              title={entry.title}
              options={entry.options}
              value={d.intMode}
              onSelect={(v) => void nativeNodeSetIntMode(d.id, v)}
            />
          );
        }
        if (entry.kind === "midiActivity") {
          // Honest skip: no real per-node MIDI activity feed exists. Render
          // nothing rather than a fake indicator.
          return null;
        }

        if (entry.kind === "atomicKnob") {
          // pizmidi-native MIDI-FX param: read engine truth from the snapshot
          // inlineParams row, write the raw value via nativeNodeSetParam.
          const prow = d.inlineParams?.find((r) => r.key === entry.key);
          if (!prow) return null; // honest skip: engine reports no such param
          return (
            <InlineAtomicKnob
              key={i}
              nodeId={d.id}
              row={prow}
              label={entry.label}
              color={entry.color ?? "teal"}
              onWrite={(k, v) => void nativeNodeSetParam(d.id, k, v)}
            />
          );
        }

        // knob / toggle — bound to a real validated param.
        const row = byIndex.get(entry.paramIndex);
        if (!row) return null; // defensive; validation should have caught this
        const label = entry.label ?? row.name;

        // Blender rule: if the entry's port is a connected Value/CV port, show
        // the param-port chip instead of the editable widget.
        if (entry.portId && portConnected.get(entry.portId)) {
          return <ParamPortChip key={i} label={label} />;
        }

        const live =
          entry.paramIndex in liveValues
            ? liveValues[entry.paramIndex]
            : row.value;

        if (entry.kind === "toggle") {
          return (
            <InlineToggle
              key={i}
              value={live}
              label={label}
              onChange={(v) => writeParam(entry.paramIndex, v)}
            />
          );
        }
        // knob
        return (
          <InlineMicroKnob
            key={i}
            value={live}
            defaultValue={row.defaultValue}
            label={label}
            color="purple"
            steps={row.stepped && row.min != null && row.max != null
              ? Math.max(1, Math.round(row.max - row.min))
              : undefined}
            onChange={(v) => writeParam(entry.paramIndex, v)}
          />
        );
      })}
    </div>
  );
}
