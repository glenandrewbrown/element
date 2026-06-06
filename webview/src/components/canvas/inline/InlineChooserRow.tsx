/**
 * T5 — InlineChooserRow: the operator/mode chooser for element.compare /
 * element.logic. A full-width ~18px row inside the Block face:
 *   ‹  CURRENT-LABEL  ›
 * with prev/next steppers and a click-the-label popover list. Writes the chosen
 * integer mode via `nativeNodeSetIntMode` (engine truth) and renders the
 * selection from `intMode` (the snapshot value). An optimistic local highlight
 * is OK — the engine re-pushes the authoritative `intMode` on the next snapshot.
 *
 * Neumorphic: a recessed pill (pressed INTO the chassis) with the Value/CV
 * orange accent (these nodes operate on CV). `nodrag nopan` + stopPropagation so
 * interacting never moves the Block.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { NO_DRAG_CLASS } from "./useParamGesture";

const ACCENT = "#A87FE0"; // Modulators/Utilities purple (compare/logic are utilities)

export interface InlineChooserOption {
  value: number;
  label: string;
}

interface InlineChooserRowProps {
  title: string;
  options: InlineChooserOption[];
  /** Engine-truth current mode (d.intMode). May be undefined before first snapshot. */
  value: number | undefined;
  /** Write the chosen integer mode to the host. */
  onSelect: (value: number) => void;
}

export function InlineChooserRow({
  title,
  options,
  value,
  onSelect,
}: InlineChooserRowProps) {
  const [open, setOpen] = useState(false);
  // Optimistic local highlight: reflects the click instantly; superseded by the
  // engine `value` once the snapshot lands.
  const [pending, setPending] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const effective = pending ?? value ?? options[0]?.value ?? 0;
  // Clear the optimistic value once the engine truth catches up.
  useEffect(() => {
    if (pending != null && value === pending) setPending(null);
  }, [value, pending]);

  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === effective),
  );
  const current = options[idx] ?? options[0];

  const choose = useCallback(
    (v: number) => {
      setPending(v);
      setOpen(false);
      onSelect(v);
    },
    [onSelect],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (options.length === 0) return;
      const next = (idx + dir + options.length) % options.length;
      choose(options[next].value);
    },
    [idx, options, choose],
  );

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      ref={rootRef}
      className={`${NO_DRAG_CLASS} relative flex items-center gap-1 w-full`}
      onPointerDown={stop}
      data-testid="inline-chooser"
      data-value={effective}
    >
      <StepBtn dir="prev" onClick={() => step(-1)} disabled={options.length < 2} />
      <button
        type="button"
        title={title}
        aria-label={`${title}: ${current?.label ?? ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
        className="flex-1 min-w-0 flex items-center justify-center leading-none select-none"
        style={{
          height: 18,
          borderRadius: 3,
          color: ACCENT,
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          // Recessed pill (pressed in), orange-tinted, same grammar as the
          // ParamLaneToggle + port wells.
          background: open
            ? `linear-gradient(180deg, ${ACCENT}1F 0%, ${ACCENT}12 100%)`
            : "linear-gradient(180deg, rgba(26,26,30,0.9) 0%, rgba(20,20,24,0.95) 100%)",
          boxShadow: open
            ? `inset 1px 1px 2px rgba(0,0,0,0.7), inset -0.5px -0.5px 1px rgba(255,255,255,0.04), 0 0 5px ${ACCENT}40`
            : "inset 1px 1px 2px rgba(0,0,0,0.7), inset -0.5px -0.5px 1px rgba(255,255,255,0.04)",
          transition: "background 90ms ease, box-shadow 90ms ease",
        }}
      >
        {current?.label ?? "—"}
      </button>
      <StepBtn dir="next" onClick={() => step(1)} disabled={options.length < 2} />

      {open && (
        <div
          role="listbox"
          aria-label={title}
          className="absolute left-0 right-0 z-50 overflow-hidden"
          style={{
            top: 22,
            borderRadius: 4,
            background: "#222226",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow:
              "-4px -4px 8px rgba(255,255,255,0.04), 8px 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          {options.map((o) => {
            const sel = o.value === effective;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={sel}
                onClick={(e) => {
                  stop(e);
                  choose(o.value);
                }}
                className="w-full flex items-center justify-center leading-none text-left"
                style={{
                  height: 18,
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: sel ? ACCENT : "rgba(229,229,234,0.85)",
                  background: sel ? `${ACCENT}1A` : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!sel)
                    (e.currentTarget as HTMLElement).style.background =
                      "rgba(42,42,46,0.9)";
                }}
                onMouseLeave={(e) => {
                  if (!sel)
                    (e.currentTarget as HTMLElement).style.background =
                      "transparent";
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StepBtn({
  dir,
  onClick,
  disabled,
}: {
  dir: "prev" | "next";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous" : "Next"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="shrink-0 flex items-center justify-center select-none"
      style={{
        width: 16,
        height: 18,
        borderRadius: 3,
        color: disabled ? "rgba(146,146,153,0.4)" : "rgba(168,127,224,0.9)",
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: 11,
        fontWeight: 700,
        background:
          "linear-gradient(180deg, rgb(41,41,46) 0%, rgb(26,26,30) 100%)",
        boxShadow:
          "inset 1px 1px 1.5px rgba(0,0,0,0.7), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.04)",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {dir === "prev" ? "‹" : "›"}
    </button>
  );
}
