import { type ReactNode } from "react";

interface NeuDisplayProps {
  children?: ReactNode;
  className?: string;
}

export function NeuDisplay({ children, className = "" }: NeuDisplayProps) {
  return (
    <div
      className={[
        "bg-[#1A1A1E] rounded overflow-hidden relative",
        "shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
