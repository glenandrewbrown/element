/**
 * TransformDial — the single live control used across every Transform-archetype
 * face layout. ONE control, RAW engine units end-to-end.
 *
 * Why bespoke (vs reusing InlineMicroKnob directly): the inherited knob lives in
 * normalised 0–1 space and its type-in is a 0–100 PERCENT entry. The Transform
 * face is judged on raw-unit fidelity — "+5 st", "1.00×" — so this control runs
 * `useParamGesture` natively in the param's own [min,max] domain. That makes:
 *   • drag        → raw delta (full sweep ≈ 200px; Shift = 10× fine)   [hook]
 *   • double-click→ reset to the current engine value (no node-default in the
 *                   contract yet — accepted known gap; we reset to row.value)
 *   • Cmd/Ctrl-click → a RAW numeric type-in ("12" → 12 st, "1.5" → 1.5×)
 * all share the locked Bitwig gesture spec, identically to the Inspector knob.
 *
 * Engine truth: the 60Hz snapshot (`row.value`) is the source of truth. A short
 * optimistic override keeps the dial + readout live DURING a drag until the
 * snapshot echoes the committed value (the proven InlineAtomicKnob pattern) —
 * so the readout is 1:1 with the pointer, never laggy.
 *
 * Neumorphic shadows come from `lib/neu.ts` (ELEMENT_RAISED / ELEMENT_PRESSED /
 * ELEMENT_GLOW + a derived pressed well) — NOT hand-rolled. MIDI-FX accent =
 * teal #2BC4C4; the readout text always carries the value (colour-blind safe).
 */
import { useEffect, useId, useRef, useState } from "react";
import type { InlineParamRow } from "../../../../data/types";
import {
  ELEMENT_GLOW,
  ELEMENT_RAISED,
  neu,
} from "../../../../lib/neu";
import { NO_DRAG_CLASS, useParamGesture } from "../useParamGesture";
import {
  formatRaw,
  formatRawBare,
  normOf,
  parseRaw,
  snapRaw,
  unitSuffixFor,
} from "./transformFormat";

/** MIDI Effects signal accent (teal). The Transform nodes are MIDI effects. */
const TEAL = "#2BC4C4";

/** Derived inset well for the value readout — pressed INTO the chassis. */
const READOUT_WELL = neu({ base: "#1A1A1E", shape: "pressed", distance: 3, intensity: 0.55 });

export type DialSize = "md" | "sm";

const SIZES: Record<DialSize, { dia: number; ring: number; track: number }> = {
  // md — the hero size used when a Transpose face has a single control.
  md: { dia: 46, ring: 3.5, track: 3.5 },
  // sm — the paired size used when VelocityAmp shows two controls side by side.
  sm: { dia: 38, ring: 3, track: 3 },
};

interface TransformDialProps {
  nodeId: string;
  row: InlineParamRow;
  size?: DialSize;
  /** Write the RAW (un-normalised) value to the engine. */
  onWrite: (key: string, rawValue: number) => void;
}

export function TransformDial({ nodeId, row, size = "md", onWrite }: TransformDialProps) {
  void nodeId; // identity is carried by the caller's onWrite closure; kept for parity/testability.
  const dim = SIZES[size];
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(false); // pressed/dragging → press INTO surface + glow
  const [flash, setFlash] = useState(0); // bump to retrigger the settle pulse
  const settleRef = useRef<number | null>(null);
  const inputId = useId();

  // Drop the optimistic override once the snapshot echoes our committed value.
  useEffect(() => {
    if (optimistic == null) return;
    if (Math.abs(row.value - optimistic) <= row.step / 2 + 1e-6) setOptimistic(null);
  }, [row.value, row.step, optimistic]);

  const rawShown = optimistic ?? row.value;
  const norm = normOf(row, rawShown);
  const angle = norm * 270 - 135; // -135°..+135° (270° sweep), matches NeuKnob

  const commit = (raw: number) => {
    const snapped = snapRaw(row, raw);
    setOptimistic(snapped);
    if (settleRef.current != null) window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => setOptimistic(null), 500);
    onWrite(row.key, snapped);
  };

  const gesture = useParamGesture({
    value: rawShown,
    min: row.min,
    max: row.max,
    onChange: commit,
    onReset: () => {
      // No node-default in the data contract yet (accepted gap) → reset targets
      // the current engine value, i.e. a no-op snap that re-flashes confirmation.
      commit(row.value);
      setFlash((f) => f + 1);
    },
    onTypeRequest: () => {
      setDraft(formatRawBare(row, rawShown));
      setTyping(true);
    },
  });

  const commitTypeIn = () => {
    const n = parseRaw(draft);
    if (n != null) {
      commit(n);
      setFlash((f) => f + 1);
    }
    setTyping(false);
  };

  // SVG arc maths (270° sweep) — same construction as NeuKnob's progress ring.
  const r = dim.dia / 2 - dim.track;
  const circumference = 2 * Math.PI * r;
  const arcLength = norm * (270 / 360) * circumference;

  const wellStyle = {
    background: READOUT_WELL.background,
    boxShadow: active
      ? `${READOUT_WELL.boxShadow}, ${ELEMENT_GLOW(TEAL).boxShadow}`
      : READOUT_WELL.boxShadow,
  };

  return (
    <div
      className={`${NO_DRAG_CLASS} flex flex-col items-center select-none transform-dial-mount`}
      style={{ width: dim.dia + 14 }}
      data-testid="transform-dial"
      data-param-key={row.key}
    >
      {/* Caption */}
      <span
        className="font-bold uppercase tracking-tight leading-none text-text-secondary"
        style={{ fontSize: 8, marginBottom: 4, letterSpacing: "0.02em" }}
      >
        {row.label}
      </span>

      {/* Dial body — drag target. Presses INTO the surface while active. */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: dim.dia,
          height: dim.dia,
          cursor: typing ? "default" : "ns-resize",
        }}
        role="slider"
        aria-label={row.label}
        aria-valuemin={row.min}
        aria-valuemax={row.max}
        aria-valuenow={Number(snapRaw(row, rawShown).toFixed(4))}
        aria-valuetext={formatRaw(row, rawShown)}
        tabIndex={0}
        onPointerDown={
          typing
            ? undefined
            : (e) => {
                setActive(true);
                gesture.onPointerDown(e);
              }
        }
        onPointerMove={typing ? undefined : gesture.onPointerMove}
        onPointerUp={
          typing
            ? undefined
            : (e) => {
                setActive(false);
                setFlash((f) => f + 1); // confirm the committed value on release
                gesture.onPointerUp(e);
              }
        }
        onPointerCancel={() => setActive(false)}
        onDoubleClick={typing ? undefined : gesture.onDoubleClick}
        onKeyDown={(e) => {
          // Keyboard a11y: arrows nudge by one step (Shift = 10×), Enter = type-in.
          if (e.key === "ArrowUp" || e.key === "ArrowRight") {
            e.preventDefault();
            commit(rawShown + row.step * (e.shiftKey ? 10 : 1));
          } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
            e.preventDefault();
            commit(rawShown - row.step * (e.shiftKey ? 10 : 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            setDraft(formatRawBare(row, rawShown));
            setTyping(true);
          }
        }}
      >
        {/* Progress ring (SVG) — track + teal active arc. */}
        <svg
          className="absolute inset-0 -rotate-[225deg]"
          width={dim.dia}
          height={dim.dia}
          aria-hidden
        >
          <circle
            cx={dim.dia / 2}
            cy={dim.dia / 2}
            r={r}
            fill="none"
            stroke="rgba(0,0,0,0.45)"
            strokeWidth={dim.track}
          />
          <circle
            cx={dim.dia / 2}
            cy={dim.dia / 2}
            r={r}
            fill="none"
            stroke={TEAL}
            strokeWidth={dim.ring}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - arcLength}
            style={{
              transition: "stroke-dashoffset 90ms cubic-bezier(0.16,1,0.3,1)",
              filter: active ? `drop-shadow(0 0 3px ${TEAL}66)` : "none",
            }}
          />
        </svg>

        {/* Raised dial cap. */}
        <div
          className="rounded-full bg-surface flex items-center justify-center absolute transform-dial-cap"
          style={{
            width: dim.dia - dim.track * 2 - 3,
            height: dim.dia - dim.track * 2 - 3,
            ...ELEMENT_RAISED(8, active ? 3 : 4),
            border: "1px solid rgba(255,255,255,0.04)",
            transition: "box-shadow 90ms ease, transform 90ms ease",
            transform: active ? "scale(0.97)" : "scale(1)",
          }}
        >
          {/* Indicator notch — the value pointer. */}
          <span
            aria-hidden
            className="absolute rounded-full"
            style={{
              width: 2.5,
              height: dim.dia <= 38 ? 7 : 8,
              top: 3,
              left: "50%",
              marginLeft: -1.25,
              backgroundColor: TEAL,
              boxShadow: `0 0 4px ${TEAL}99`,
              transformOrigin: `50% ${(dim.dia - dim.track * 2 - 3) / 2 - 3}px`,
              transform: `rotate(${angle}deg)`,
              transition: "transform 90ms cubic-bezier(0.16,1,0.3,1)",
            }}
          />
        </div>
      </div>

      {/* Value readout — pressed-in well, RAW units, type-in on Cmd/Ctrl-click. */}
      {typing ? (
        <input
          id={inputId}
          autoFocus
          type="text"
          inputMode="text"
          value={draft}
          aria-label={`${row.label} value`}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitTypeIn}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commitTypeIn();
            else if (e.key === "Escape") setTyping(false);
          }}
          className="tabular text-center text-text-primary border-none outline-none"
          style={{
            width: dim.dia + 6,
            marginTop: 4,
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 2px",
            borderRadius: 3,
            background: READOUT_WELL.background,
            boxShadow: READOUT_WELL.boxShadow,
          }}
        />
      ) : (
        <output
          key={flash /* remount → replay the settle flash keyframe */}
          htmlFor={inputId}
          className="tabular text-center transform-dial-readout"
          data-testid="transform-readout"
          title="Drag to change · ⌘-click to type · double-click to reset"
          style={{
            width: dim.dia + 6,
            marginTop: 4,
            fontSize: 9,
            fontWeight: 700,
            lineHeight: "13px",
            padding: "1px 2px",
            borderRadius: 3,
            color: active ? TEAL : "#E5E5EA",
            ...wellStyle,
            transition: "color 90ms ease, box-shadow 90ms ease",
          }}
        >
          {formatRaw(row, rawShown)}
          {/* unitSuffixFor kept available for split layouts; full string above
              already includes the unit, so this is intentionally not appended. */}
          <span aria-hidden style={{ display: "none" }}>
            {unitSuffixFor(row)}
          </span>
        </output>
      )}
    </div>
  );
}
