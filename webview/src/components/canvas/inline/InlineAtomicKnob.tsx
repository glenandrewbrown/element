/**
 * InlineAtomicKnob — on-block knob for a built-in MIDI-FX node parameter exposed
 * via InlineParamControl. Reads the engine-truth value/range from the graph
 * snapshot's `inlineParams` row and writes the RAW value via `nativeNodeSetParam`.
 * Unlike InlineMicroKnob's AudioProcessor-param path there is NO useParameterStore
 * here — the snapshot IS the source of truth. A short optimistic override keeps the
 * knob live during a drag until the next 60Hz snapshot echoes the committed value.
 */
import { useEffect, useRef, useState } from "react";
import type { InlineParamRow } from "../../../data/types";
import { InlineMicroKnob } from "./InlineMicroKnob";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Pure: normalised 0..1 → raw engine value, snapped to step and clamped. */
export function knobRawFromNorm(n: number, row: InlineParamRow): number {
  let raw = row.min + n * (row.max - row.min);
  if (row.step > 0) raw = Math.round(raw / row.step) * row.step;
  return clamp(raw, row.min, row.max);
}

const normFromRaw = (raw: number, row: InlineParamRow) =>
  row.max > row.min ? (raw - row.min) / (row.max - row.min) : 0;

interface InlineAtomicKnobProps {
  nodeId: string;
  row: InlineParamRow;
  label?: string;
  color?: "blue" | "orange" | "teal" | "purple";
  /** Write the RAW (un-normalised) value to the engine. */
  onWrite: (key: string, rawValue: number) => void;
}

export function InlineAtomicKnob({
  row,
  label,
  color = "teal",
  onWrite,
}: InlineAtomicKnobProps) {
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const settleRef = useRef<number | null>(null);

  // Drop the optimistic override once the snapshot echoes our committed value.
  useEffect(() => {
    if (optimistic == null) return;
    if (Math.abs(row.value - optimistic) <= row.step / 2 + 1e-6) setOptimistic(null);
  }, [row.value, row.step, optimistic]);

  const rawShown = optimistic ?? row.value;
  const steps =
    row.step > 0 ? Math.max(1, Math.round((row.max - row.min) / row.step)) : undefined;

  const handleChange = (n: number) => {
    const raw = knobRawFromNorm(n, row);
    setOptimistic(raw);
    if (settleRef.current != null) window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => setOptimistic(null), 500);
    onWrite(row.key, raw);
  };

  return (
    <InlineMicroKnob
      value={normFromRaw(rawShown, row)}
      defaultValue={normFromRaw(row.value, row)}
      label={label ?? row.label}
      color={color}
      steps={steps}
      onChange={handleChange}
    />
  );
}
