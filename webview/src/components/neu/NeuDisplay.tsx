import { type ReactNode } from "react";

interface NeuDisplayProps {
  /** Readout content — typically a numeric value, or a fill bar / meter element. */
  children?: ReactNode;
  /** Optional className; set width/height/padding here (e.g. "w-24 h-8"). */
  className?: string;
}

/**
 * Neumorphic inset "screen" — a recessed, dark panel for read-only numeric
 * readouts (frequency, dB, BPM) and meter/value bars. Pressed INTO the chassis
 * (not extruded) so it reads as an instrument display rather than a control.
 * Use it to surface a live value; pair with a NeuKnob/NeuFader that drives it.
 */
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
