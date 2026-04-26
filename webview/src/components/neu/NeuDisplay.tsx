import { type ReactNode } from "react";

interface NeuDisplayProps {
  children?: ReactNode;
  className?: string;
}

export function NeuDisplay({ children, className = "" }: NeuDisplayProps) {
  return (
    <div
      className={[
        "bg-pressed rounded overflow-hidden relative tabular-nums",
        "neu-inset",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
