const colorMap = {
  blue: {
    track: "bg-generator",
    glow: "shadow-[0_0_8px_rgba(74,144,217,0.5)]",
  },
  orange: {
    track: "bg-modifier",
    glow: "shadow-[0_0_8px_rgba(232,168,56,0.5)]",
  },
  teal: {
    track: "bg-logic",
    glow: "shadow-[0_0_8px_rgba(43,196,196,0.5)]",
  },
} as const;

interface NeuToggleProps {
  active: boolean;
  onChange: (active: boolean) => void;
  color?: "blue" | "orange" | "teal";
  className?: string;
}

export function NeuToggle({
  active,
  onChange,
  color = "blue",
  className = "",
}: NeuToggleProps) {
  const { track, glow } = colorMap[color];

  return (
    <button
      role="switch"
      aria-checked={active}
      onClick={() => onChange(!active)}
      className={[
        "relative w-6 h-3 rounded-full transition-colors duration-150",
        active
          ? track
          : "bg-[#1A1A1E] shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]",
        "border border-white/5",
        className,
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-0.5 w-2 h-2 rounded-full bg-text-primary transition-all duration-150",
          active ? `right-0.5 ${glow}` : "left-0.5",
        ].join(" ")}
      />
    </button>
  );
}
