import { forwardRef } from "react";

interface NeuInputProps {
  /** Placeholder shown when the field is empty (e.g. "Search blocks…"). */
  placeholder?: string;
  /** Controlled string value. */
  value?: string;
  /** Called with the new string on each keystroke. Omit for read-only display. */
  onChange?: (value: string) => void;
  /** Optional className appended to the input. */
  className?: string;
}

/**
 * Neumorphic single-line text input — a pressed-in field for search boxes,
 * rename-in-place, and short text entry (Block names, Project names, filter
 * queries). Forwards its ref so callers can focus it programmatically (e.g.
 * autofocusing a QuickAdd or rename field). Inset styling signals an editable
 * slot recessed into the chassis.
 */
export const NeuInput = forwardRef<HTMLInputElement, NeuInputProps>(
  function NeuInput({ placeholder, value, onChange, className = "" }, ref) {
    return (
      <input
        ref={ref}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className={[
          "w-full bg-pressed border-none rounded px-3 py-1.5 text-[11px] text-text-primary placeholder-text-dim",
          "shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]",
          "outline-none focus:ring-1 focus:ring-accent-blue/30",
          "transition-shadow duration-100",
          className,
        ].join(" ")}
      />
    );
  },
);
