/**
 * T5 — InlineMicroKnob: a 22–28px on-face knob bound to ONE real host parameter
 * (normalised 0–1). Thin wrapper over NeuKnob (xs/compact) that routes its
 * pointer gestures through the shared `useParamGesture` spec — deadzone,
 * mid-drag re-anchored fine (Shift), double-click reset, Cmd-click type-in — so
 * inline knobs feel identical to the Inspector knob. The value domain is the
 * host's normalised 0–1; we present 0–100 to NeuKnob's arc.
 *
 * Values are owned by the caller (read from useParameterStore, written
 * setLocal + nativeSetNodeParameter). This widget only renders + emits.
 */

import { useState } from "react";
import { NeuKnob } from "../../neu/NeuKnob";
import { useParamGesture, snapStepped, NO_DRAG_CLASS } from "./useParamGesture";

interface InlineMicroKnobProps {
  /** Normalised current value 0–1. */
  value: number;
  /** Normalised default (for double-click reset). */
  defaultValue: number;
  label: string;
  color?: "blue" | "orange" | "teal" | "purple";
  /** Stepped param → snap to discrete increments (count of steps). */
  steps?: number;
  /** Emit a normalised 0–1 value (caller writes setLocal + native). */
  onChange: (value: number) => void;
}

export function InlineMicroKnob({
  value,
  defaultValue,
  label,
  color = "purple",
  steps,
  onChange,
}: InlineMicroKnobProps) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");

  const emit = (v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    onChange(steps ? snapStepped(clamped, 0, 1, steps) : clamped);
  };

  const gesture = useParamGesture({
    value,
    min: 0,
    max: 1,
    onChange: emit,
    onReset: () => emit(defaultValue),
    onTypeRequest: () => {
      setDraft(String(Math.round(value * 100)));
      setTyping(true);
    },
  });

  const commitTypeIn = () => {
    const n = Number(draft);
    if (Number.isFinite(n)) emit(n / 100);
    setTyping(false);
  };

  return (
    <div
      className={`${NO_DRAG_CLASS} flex flex-col items-center`}
      style={{ width: 30 }}
      onPointerDown={typing ? undefined : gesture.onPointerDown}
      onPointerMove={typing ? undefined : gesture.onPointerMove}
      onPointerUp={typing ? undefined : gesture.onPointerUp}
      onDoubleClick={typing ? undefined : gesture.onDoubleClick}
      data-testid="inline-knob"
    >
      {typing ? (
        <input
          autoFocus
          type="text"
          inputMode="numeric"
          value={draft}
          aria-label={`${label} value`}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitTypeIn}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commitTypeIn();
            else if (e.key === "Escape") setTyping(false);
          }}
          className="w-full bg-pressed border-none rounded text-center text-[9px] text-text-primary px-1 py-0 outline-none shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]"
        />
      ) : (
        <NeuKnob
          size="xs"
          compact
          color={color}
          label={label}
          value={Math.round(value * 100)}
          // NeuKnob's own pointer drag is intentionally NOT wired — the wrapper
          // owns the gesture (stopPropagation + pointer capture). We pass a
          // no-op onChange only so NeuKnob renders in its interactive style.
          onChange={() => {}}
        />
      )}
    </div>
  );
}
