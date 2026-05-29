const colorMap = {
  blue: { border: "border-generator", text: "text-generator" },
  orange: { border: "border-modifier", text: "text-modifier" },
  teal: { border: "border-logic", text: "text-logic" },
  purple: { border: "border-badge-au", text: "text-badge-au" },
  grey: { border: "border-badge-lv2", text: "text-badge-lv2" },
} as const;

interface NeuBadgeProps {
  /** Short label, rendered uppercase (e.g. "VST3", "MIDI", "CV"). */
  text: string;
  /**
   * Accent colour. Maps to Element's semantic palette: `blue` = generator,
   * `orange` = modifier, `teal` = logic, plus `purple`/`grey` for plugin-format
   * tags (AU / LV2). Default `blue`.
   */
  color?: keyof typeof colorMap;
  /** Optional className appended to the badge. */
  className?: string;
}

/**
 * Small neumorphic pill for terse metadata — plugin format tags (VST3, AU, CLAP,
 * LV2) and signal-type labels (Audio, MIDI, CV). Use it inline on Block headers
 * and in browser rows where a colour-coded one-word marker conveys role at a
 * glance; not for interactive controls.
 */
export function NeuBadge({
  text,
  color = "blue",
  className = "",
}: NeuBadgeProps) {
  const { border, text: textColor } = colorMap[color];

  return (
    <span
      className={[
        "inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wide",
        "bg-pressed border neu-raised",
        border,
        textColor,
        className,
      ].join(" ")}
    >
      {text}
    </span>
  );
}
