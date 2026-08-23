/**
 * Neumorphic prompt modal — V3.0 Instrument Paradigm.
 *
 * W-1 (Phase F-block 1) replacement for the production-shipped `window.prompt()`
 * regression in the PRESETS Save/Load strip. Controlled component:
 *
 *   const [open, setOpen] = useState(false);
 *   const [defaultValue, setDefaultValue] = useState("");
 *   ...
 *   <NeuPromptModal
 *     open={open}
 *     title="Preset name"
 *     placeholder="Enter a name…"
 *     defaultValue={defaultValue}
 *     onConfirm={(v) => { savePreset(v); setOpen(false); }}
 *     onCancel={() => setOpen(false)}
 *   />
 *
 * Accessibility contract (autonomy-execution-spec §6 + V3.0 a11y):
 *   - role="dialog", aria-modal="true", aria-labelledby points at the title
 *   - focus trap: tab cycles inside the modal (input ↔ Cancel ↔ Confirm)
 *   - ESC dismisses (calls onCancel)
 *   - Enter on the input confirms (calls onConfirm with the trimmed value)
 *   - Initial focus lands on the input, with the default value pre-selected
 *   - Backdrop click is intentionally NOT a dismiss — destination data ops
 *     should require an explicit Cancel choice (matches V3.0 "speed but no
 *     foot-guns" principle).
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export interface NeuPromptModalProps {
  /** Controlled visibility — render only when true. */
  open: boolean;
  /** Modal title (used for aria-labelledby). */
  title: string;
  /** Optional descriptive helper text under the title. */
  description?: string;
  /** Placeholder for the input. */
  placeholder?: string;
  /** Initial value seeded into the input on open. */
  defaultValue?: string;
  /** Confirm-button label (default "OK"). */
  confirmLabel?: string;
  /** Cancel-button label (default "Cancel"). */
  cancelLabel?: string;
  /** Fires with the trimmed input on Enter or Confirm click. */
  onConfirm: (value: string) => void;
  /** Fires on ESC key, Cancel click, or programmatic dismissal. */
  onCancel: () => void;
}

/**
 * Neumorphic single-field prompt modal — the V3.0 replacement for the browser's
 * native `window.prompt()`. Use it for short, blocking text entry inside the
 * Project chassis (naming a preset, renaming a Block, creating a Container)
 * where a full Inspector form is overkill. Controlled via `open`; confirms on
 * Enter or the Confirm button, cancels on ESC. Backdrop click is intentionally
 * NOT a dismiss so destructive data ops require an explicit choice.
 */
export function NeuPromptModal({
  open,
  title,
  description,
  placeholder,
  defaultValue = "",
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: NeuPromptModalProps) {
  const titleId = useId();
  const descId = useId();
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  // Reset to defaultValue every time the modal opens; otherwise stale values
  // from a previous open would leak forward.
  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  // Initial focus: input, with text pre-selected for fast overwrite.
  useLayoutEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // Focus trap + ESC handler at the document level — only when open.
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Tab") {
        const order: Array<HTMLElement | null> = [
          inputRef.current,
          cancelRef.current,
          confirmRef.current,
        ];
        const focusables: HTMLElement[] = order.filter(
          (el): el is HTMLElement => el !== null,
        );
        if (focusables.length === 0) return;
        const active = document.activeElement as HTMLElement | null;
        const idx = active ? focusables.indexOf(active) : -1;
        const next = e.shiftKey
          ? focusables[(idx <= 0 ? focusables.length : idx) - 1]
          : focusables[(idx + 1) % focusables.length];
        if (next) {
          e.preventDefault();
          next.focus();
        }
      }
    },
    [open, onCancel],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleKey]);

  if (!open) return null;

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return; // empty values are not actionable
    onConfirm(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      <div className="w-[min(420px,92vw)] rounded-lg bg-surface shadow-[8px_8px_24px_rgba(0,0,0,0.5),-2px_-2px_8px_rgba(255,255,255,0.04)] border border-white/5 p-6 space-y-4">
        <div className="space-y-1">
          <h2
            id={titleId}
            className="text-[12px] font-bold uppercase tracking-widest text-text-primary"
          >
            {title}
          </h2>
          {description ? (
            <p
              id={descId}
              className="text-[10px] text-text-secondary leading-relaxed"
            >
              {description}
            </p>
          ) : null}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          className="w-full text-[12px] bg-pressed text-text-primary rounded-md px-3 py-2 outline-none border border-white/5 focus:border-generator/40 placeholder-text-secondary/60 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]"
        />

        <div className="flex justify-end gap-2 pt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-[11px] uppercase tracking-wide text-text-secondary bg-surface hover:bg-elevated transition-colors shadow-[-1px_-1px_4px_rgba(255,255,255,0.04),1px_1px_4px_rgba(0,0,0,0.3)]"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={submit}
            disabled={value.trim().length === 0}
            className="px-3 py-1.5 rounded text-[11px] uppercase tracking-wide font-bold text-text-primary bg-generator/20 border border-generator/30 hover:bg-generator/30 transition-colors shadow-[-1px_-1px_4px_rgba(255,255,255,0.04),1px_1px_4px_rgba(0,0,0,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NeuPromptModal;
