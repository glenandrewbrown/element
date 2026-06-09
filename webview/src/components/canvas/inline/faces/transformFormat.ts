/**
 * Transform-face RAW-unit value formatting + shared param geometry.
 *
 * The Transform archetype face renders engine-truth params from `d.inlineParams`
 * in their RAW units — never a 0–100 percentage (that is the papercut this face
 * fixes vs the inherited InlineMicroKnob). One small, pure module so the PRIMARY
 * face and both alternate layouts read values identically.
 *
 * Unit inference is keyed off the param `key` (the engine's stable identifier),
 * NOT the human label, so a relabelled param still formats correctly:
 *   • "semitones" → signed integer + " st"  (e.g. "+5 st", "0 st", "-12 st")
 *   • "scale"     → 2dp + "×"                (e.g. "1.00×", "0.50×")
 *   • "power"     → 2dp + "×"                (a curve exponent, shown ×-style)
 *   • anything else → step-aware decimals (int step → integer, else 2dp).
 *
 * Colour-blind safety: the readout text ALWAYS carries the value — the teal
 * accent is decoration, never the sole signal.
 */
import type { InlineParamRow } from "../../../../data/types";

/** Decimal places implied by a step (integer step → 0, else 2). */
export function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 2;
  return Number.isInteger(step) ? 0 : 2;
}

/** RAW → display string in the param's natural units (no percentages, ever). */
export function formatRaw(row: InlineParamRow, raw: number): string {
  const v = Number.isFinite(raw) ? raw : row.value;
  switch (row.key) {
    case "semitones": {
      // Signed integer with a sign-forward sigil — pitch shift reads as ± offset.
      const n = Math.round(v);
      const sign = n > 0 ? "+" : ""; // negatives already carry "-"
      return `${sign}${n} st`;
    }
    case "scale":
    case "power":
      return `${v.toFixed(2)}×`;
    default: {
      const d = decimalsForStep(row.step);
      return v.toFixed(d);
    }
  }
}

/** A terse unit caption for layouts that split value and unit (alternates). */
export function unitSuffixFor(row: InlineParamRow): string {
  switch (row.key) {
    case "semitones":
      return "st";
    case "scale":
    case "power":
      return "×";
    default:
      return "";
  }
}

/** Numeric-only display (no unit) — for the dial centre + type-in seed. */
export function formatRawBare(row: InlineParamRow, raw: number): string {
  const v = Number.isFinite(raw) ? raw : row.value;
  if (row.key === "semitones") {
    const n = Math.round(v);
    return n > 0 ? `+${n}` : `${n}`;
  }
  return v.toFixed(decimalsForStep(row.step));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** RAW value snapped to the param step and clamped to [min,max] (engine-parity). */
export function snapRaw(row: InlineParamRow, raw: number): number {
  let r = raw;
  if (row.step > 0) r = Math.round(r / row.step) * row.step;
  // Kill binary-float fuzz introduced by the divide/round so the readout is exact.
  if (row.step > 0) {
    const d = decimalsForStep(row.step);
    r = Number(r.toFixed(Math.max(d, 4)));
  }
  return clamp(r, row.min, row.max);
}

/** Normalised 0..1 position of a raw value within the param range. */
export function normOf(row: InlineParamRow, raw: number): number {
  return row.max > row.min ? clamp((raw - row.min) / (row.max - row.min), 0, 1) : 0;
}

/** Parse a typed RAW string; returns null when it is not a finite number. */
export function parseRaw(s: string): number | null {
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : null;
}
