/**
 * T5 — InlineToggle: a 16px square recessed on/off control for a boolean host
 * parameter (NOT an iOS pill switch). Off = a pressed-in well; on = the well
 * lights with the accent hue (a chip pressed into the chassis, glowing). Bound
 * to a real boolean param: value is normalised (≥0.5 = on); the caller writes
 * setLocal + nativeSetNodeParameter.
 *
 * `nodrag nopan` + stopPropagation so toggling never moves the Block.
 */

import { NO_DRAG_CLASS } from "./useParamGesture";

const ACCENT = "#A87FE0";

interface InlineToggleProps {
  /** Normalised 0–1; ≥0.5 = on. */
  value: number;
  label: string;
  /** Emit the new normalised value (0 or 1). */
  onChange: (value: number) => void;
}

export function InlineToggle({ value, label, onChange }: InlineToggleProps) {
  const on = value >= 0.5;
  return (
    <div className={`${NO_DRAG_CLASS} flex flex-col items-center gap-0.5`}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        data-testid="inline-toggle"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onChange(on ? 0 : 1);
        }}
        style={{
          width: 16,
          height: 16,
          borderRadius: 3,
          background: on
            ? `linear-gradient(180deg, ${ACCENT}33 0%, ${ACCENT}1A 100%)`
            : "linear-gradient(180deg, rgb(26,26,30) 0%, rgb(20,20,24) 100%)",
          boxShadow: on
            ? `inset 1px 1px 2px rgba(0,0,0,0.6), inset -0.5px -0.5px 1px rgba(255,255,255,0.05), 0 0 5px ${ACCENT}66`
            : "inset 1.5px 1.5px 3px rgba(0,0,0,0.8), inset -0.5px -0.5px 1px rgba(255,255,255,0.04)",
          transition: "background 90ms ease, box-shadow 90ms ease",
        }}
      >
        {/* lit pip when on */}
        <span
          aria-hidden
          style={{
            display: "block",
            width: 5,
            height: 5,
            margin: "auto",
            borderRadius: "50%",
            background: on ? ACCENT : "transparent",
            boxShadow: on ? `0 0 4px ${ACCENT}` : "none",
          }}
        />
      </button>
      <span
        className="font-bold uppercase tracking-tight leading-none text-text-secondary"
        style={{ fontSize: 7 }}
      >
        {label}
      </span>
    </div>
  );
}
