/**
 * Transform-face ALTERNATE layouts — for side-by-side comparison against the
 * PRIMARY TransformFace (dials). Same data contract, same RAW-units behaviour,
 * same engine writes — different spatial idiom so a human reviewer can pick the
 * feel that best fits a dense canvas Block face.
 *
 *   • TransformFaceStacked — horizontal "fader rows": caption on the left, a
 *     pressed-in value TRACK with a teal fill + thumb in the middle, a RAW
 *     readout on the right. Drag anywhere on the row. Reads like a mixer strip;
 *     scales cleanly to N params with no empty slot (1 row or 2 rows).
 *
 *   • TransformFaceInline — the most compact: one line per param, "LABEL  value"
 *     where the value chip itself is the drag handle (no ring, no track). Lowest
 *     footprint for a tight collapsed Block; still full drag + Shift-fine +
 *     double-click-reset + ⌘-click RAW type-in.
 *
 * Both share `useRawParamControl` (the optimistic-override + raw type-in state on
 * top of `useParamGesture`) so behaviour is byte-identical to the PRIMARY dial.
 * Shadows are from lib/neu.ts; accent teal #2BC4C4; readout text always carries
 * the value (colour-blind safe).
 */
import { useEffect, useId, useRef, useState } from "react";
import type { BlockData, InlineParamRow } from "../../../../data/types";
import { nativeNodeSetParam } from "../../../../bridge/nativeGraph";
import { ELEMENT_GLOW, neu } from "../../../../lib/neu";
import { NO_DRAG_CLASS, useParamGesture } from "../useParamGesture";
import { formatRaw, formatRawBare, normOf, parseRaw, snapRaw } from "./transformFormat";

const TEAL = "#2BC4C4";
const TRACK_WELL = neu({ base: "#1A1A1E", shape: "pressed", distance: 3, intensity: 0.55 });

/* ── Shared raw-units control state ─────────────────────────────────────────
   Wraps useParamGesture with: the optimistic-during-drag override (so the live
   readout never lags the engine snapshot), a press/active flag, a commit-flash
   counter, and RAW type-in draft state. Identical to TransformDial's internals,
   factored so both alternates inherit the exact same feel. */
function useRawParamControl(
  row: InlineParamRow,
  onWrite: (key: string, raw: number) => void,
) {
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [flash, setFlash] = useState(0);
  const settleRef = useRef<number | null>(null);

  useEffect(() => {
    if (optimistic == null) return;
    if (Math.abs(row.value - optimistic) <= row.step / 2 + 1e-6) setOptimistic(null);
  }, [row.value, row.step, optimistic]);

  const rawShown = optimistic ?? row.value;

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
      commit(row.value); // no node-default in contract → reset = current value
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

  const bind = {
    onPointerDown: typing
      ? undefined
      : (e: React.PointerEvent) => {
          setActive(true);
          gesture.onPointerDown(e);
        },
    onPointerMove: typing ? undefined : gesture.onPointerMove,
    onPointerUp: typing
      ? undefined
      : (e: React.PointerEvent) => {
          setActive(false);
          setFlash((f) => f + 1);
          gesture.onPointerUp(e);
        },
    onPointerCancel: () => setActive(false),
    onDoubleClick: typing ? undefined : gesture.onDoubleClick,
  };

  return {
    rawShown,
    active,
    typing,
    draft,
    setDraft,
    flash,
    commit,
    commitTypeIn,
    setTyping,
    bind,
  } as const;
}

/* ── Variant A: stacked fader rows ─────────────────────────────────────────── */

function FaderRow({
  row,
  onWrite,
}: {
  row: InlineParamRow;
  onWrite: (key: string, raw: number) => void;
}) {
  const c = useRawParamControl(row, onWrite);
  const inputId = useId();
  const pct = normOf(row, c.rawShown) * 100;

  return (
    <div
      className={`${NO_DRAG_CLASS} flex items-center w-full`}
      style={{ gap: 6, height: 18 }}
      data-testid="transform-fader-row"
      data-param-key={row.key}
    >
      <span
        className="font-bold uppercase tracking-tight leading-none text-text-secondary shrink-0"
        style={{ fontSize: 8, width: 30, letterSpacing: "0.02em" }}
      >
        {row.label}
      </span>

      {/* Pressed-in track — drag anywhere on it. */}
      <div
        className="relative grow"
        role="slider"
        aria-label={row.label}
        aria-valuemin={row.min}
        aria-valuemax={row.max}
        aria-valuenow={Number(snapRaw(row, c.rawShown).toFixed(4))}
        aria-valuetext={formatRaw(row, c.rawShown)}
        tabIndex={0}
        style={{
          height: 10,
          borderRadius: 5,
          background: TRACK_WELL.background,
          boxShadow: c.active
            ? `${TRACK_WELL.boxShadow}, ${ELEMENT_GLOW(TEAL).boxShadow}`
            : TRACK_WELL.boxShadow,
          cursor: "ns-resize",
          transition: "box-shadow 90ms ease",
        }}
        {...c.bind}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowRight") {
            e.preventDefault();
            c.commit(c.rawShown + row.step * (e.shiftKey ? 10 : 1));
          } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
            e.preventDefault();
            c.commit(c.rawShown - row.step * (e.shiftKey ? 10 : 1));
          }
        }}
      >
        {/* Teal fill up to the value. */}
        <div
          aria-hidden
          className="absolute top-0 left-0 h-full"
          style={{
            width: `${pct}%`,
            borderRadius: 5,
            background: `linear-gradient(180deg, ${TEAL}cc, ${TEAL}99)`,
            boxShadow: c.active ? `0 0 5px ${TEAL}66` : "none",
            transition: "width 90ms cubic-bezier(0.16,1,0.3,1), box-shadow 90ms ease",
          }}
        />
        {/* Thumb tick at the value. */}
        <div
          aria-hidden
          className="absolute top-1/2"
          style={{
            left: `calc(${pct}% - 1px)`,
            width: 2.5,
            height: 12,
            marginTop: -6,
            borderRadius: 2,
            background: "#E5E5EA",
            boxShadow: `0 0 4px ${TEAL}99`,
            transition: "left 90ms cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      </div>

      {/* RAW readout / type-in. */}
      {c.typing ? (
        <input
          id={inputId}
          autoFocus
          type="text"
          value={c.draft}
          aria-label={`${row.label} value`}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => c.setDraft(e.target.value)}
          onBlur={c.commitTypeIn}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") c.commitTypeIn();
            else if (e.key === "Escape") c.setTyping(false);
          }}
          className="tabular text-right text-text-primary border-none outline-none shrink-0"
          style={{
            width: 38,
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 3px",
            borderRadius: 3,
            background: TRACK_WELL.background,
            boxShadow: TRACK_WELL.boxShadow,
          }}
        />
      ) : (
        <output
          htmlFor={inputId}
          className="tabular text-right shrink-0"
          data-testid="transform-readout"
          title="Drag to change · ⌘-click to type · double-click to reset"
          style={{
            width: 38,
            fontSize: 9,
            fontWeight: 700,
            color: c.active ? TEAL : "#E5E5EA",
            transition: "color 90ms ease",
          }}
        >
          {formatRaw(row, c.rawShown)}
        </output>
      )}
    </div>
  );
}

export function TransformFaceStacked({ d }: { d: BlockData }) {
  const params = d.inlineParams ?? [];
  if (params.length === 0) return null;
  const write = (key: string, raw: number) => {
    void nativeNodeSetParam(d.id, key, raw);
  };
  return (
    <div
      className="flex flex-col w-full min-w-0"
      style={{ gap: 5, padding: "2px 2px 1px" }}
      data-testid="transform-face"
    >
      {params.map((row) => (
        <FaderRow key={row.key} row={row} onWrite={write} />
      ))}
    </div>
  );
}

/* ── Variant B: inline value chips ─────────────────────────────────────────── */

function ChipRow({
  row,
  onWrite,
}: {
  row: InlineParamRow;
  onWrite: (key: string, raw: number) => void;
}) {
  const c = useRawParamControl(row, onWrite);
  const inputId = useId();

  return (
    <div
      className={`${NO_DRAG_CLASS} flex items-center justify-between w-full`}
      style={{ gap: 6, height: 16 }}
      data-testid="transform-chip-row"
      data-param-key={row.key}
    >
      <span
        className="font-bold uppercase tracking-tight leading-none text-text-secondary"
        style={{ fontSize: 8, letterSpacing: "0.03em" }}
      >
        {row.label}
      </span>

      {c.typing ? (
        <input
          id={inputId}
          autoFocus
          type="text"
          value={c.draft}
          aria-label={`${row.label} value`}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => c.setDraft(e.target.value)}
          onBlur={c.commitTypeIn}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") c.commitTypeIn();
            else if (e.key === "Escape") c.setTyping(false);
          }}
          className="tabular text-center text-text-primary border-none outline-none"
          style={{
            width: 44,
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 3px",
            borderRadius: 3,
            background: TRACK_WELL.background,
            boxShadow: TRACK_WELL.boxShadow,
          }}
        />
      ) : (
        /* The value chip IS the drag handle — a pressed pill that lights teal. */
        <div
          role="slider"
          aria-label={row.label}
          aria-valuemin={row.min}
          aria-valuemax={row.max}
          aria-valuenow={Number(snapRaw(row, c.rawShown).toFixed(4))}
          aria-valuetext={formatRaw(row, c.rawShown)}
          tabIndex={0}
          data-testid="transform-readout"
          title="Drag to change · ⌘-click to type · double-click to reset"
          className="tabular text-center"
          style={{
            minWidth: 44,
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: 4,
            cursor: "ns-resize",
            color: c.active ? TEAL : "#E5E5EA",
            background: TRACK_WELL.background,
            boxShadow: c.active
              ? `${TRACK_WELL.boxShadow}, ${ELEMENT_GLOW(TEAL).boxShadow}`
              : TRACK_WELL.boxShadow,
            transition: "color 90ms ease, box-shadow 90ms ease",
          }}
          {...c.bind}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowRight") {
              e.preventDefault();
              c.commit(c.rawShown + row.step * (e.shiftKey ? 10 : 1));
            } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
              e.preventDefault();
              c.commit(c.rawShown - row.step * (e.shiftKey ? 10 : 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              c.setDraft(formatRawBare(row, c.rawShown));
              c.setTyping(true);
            }
          }}
        >
          {formatRaw(row, c.rawShown)}
        </div>
      )}
    </div>
  );
}

export function TransformFaceInline({ d }: { d: BlockData }) {
  const params = d.inlineParams ?? [];
  if (params.length === 0) return null;
  const write = (key: string, raw: number) => {
    void nativeNodeSetParam(d.id, key, raw);
  };
  return (
    <div
      className="flex flex-col w-full min-w-0"
      style={{ gap: 3, padding: "2px 3px 1px" }}
      data-testid="transform-face"
    >
      {params.map((row) => (
        <ChipRow key={row.key} row={row} onWrite={write} />
      ))}
    </div>
  );
}
