import { forwardRef } from "react";

interface NeuInputProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

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
          "w-full bg-[#1A1A1E] border-none rounded px-3 py-1.5 text-[11px] text-text-primary placeholder-text-dim",
          "shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]",
          "outline-none focus:ring-1 focus:ring-generator/30",
          "transition-shadow duration-100",
          className,
        ].join(" ")}
      />
    );
  },
);
