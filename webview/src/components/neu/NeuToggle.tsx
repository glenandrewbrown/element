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
  /** On/off state. On = filled, glowing track; off = inset (recessed) track. */
  active: boolean;
  /** Called with the next boolean state when the switch is clicked. */
  onChange: (active: boolean) => void;
  /**
   * Accent colour of the active track, mapped to Element's semantic palette:
   * `blue` = generator, `orange` = modifier, `teal` = logic. Default `blue`.
   */
  color?: "blue" | "orange" | "teal";
  /** Optional className appended to the switch. */
  className?: string;
}

/**
 * Compact neumorphic on/off switch (ARIA `role="switch"`) for binary settings —
 * bypass, mute, snap-to-grid, monitor on/off, and similar toggles in panels and
 * Perform-mode dashboards. The active track lights up in the chosen semantic hue
 * so its on-state reads at a glance.
 */
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
          ? `${track} ${glow}`
          : "bg-pressed neu-inset",
        "border border-white/5",
        className,
      ].join(" ")}
    >
      <span
        className={[
          // G-04: top-1/2 + -translate-y-1/2 centres the knob dot vertically.
          // (top-0.5 left it ~2px high once the 1px border ate the bottom gap.)
          "absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-text-primary transition-all duration-150",
          active ? "right-0.5" : "left-0.5",
        ].join(" ")}
      />
    </button>
  );
}
