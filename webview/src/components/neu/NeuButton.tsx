import { type ReactNode } from "react";

const variantStyles = {
  default: "bg-[#252529] text-text-primary border-white/5 hover:bg-[#2A2A2E]",
  active: "bg-[#252529] text-logic border-white/5",
  panic: "bg-[#252529] text-error border-error/20",
} as const;

const sizeStyles = {
  sm: "py-1.5 px-2.5 text-[10px] gap-1.5",
  md: "py-2 px-3 text-[11px] gap-2",
} as const;

interface NeuButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "panic" | "active";
  size?: "sm" | "md";
  className?: string;
}

export function NeuButton({
  children,
  onClick,
  variant = "default",
  size = "md",
  className = "",
}: NeuButtonProps) {
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex items-center justify-center rounded border font-bold uppercase tracking-wider",
        "select-none transition-all duration-100",
        /* raised state */
        "shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)]",
        /* pressed state */
        "active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]",
        "active:translate-y-px",
        variantStyles[variant],
        sizeStyles[size],
        variant === "panic" &&
          "shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35),0_0_12px_rgba(239,68,68,0.15)]",
        variant === "active" &&
          "shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35),0_0_8px_rgba(43,196,196,0.2)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {variant === "active" && (
        <span className="w-1.5 h-1.5 rounded-full bg-logic shadow-[0_0_4px_rgba(43,196,196,0.8)]" />
      )}
      {variant === "panic" && (
        <span className="w-1.5 h-1.5 rounded-full bg-error shadow-[0_0_4px_rgba(239,68,68,0.8)]" />
      )}
      {children}
    </button>
  );
}
