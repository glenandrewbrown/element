const colorMap = {
  blue: { border: "border-generator", text: "text-generator" },
  orange: { border: "border-modifier", text: "text-modifier" },
  teal: { border: "border-logic", text: "text-logic" },
  purple: { border: "border-badge-au", text: "text-badge-au" },
  grey: { border: "border-badge-lv2", text: "text-badge-lv2" },
} as const;

interface NeuBadgeProps {
  text: string;
  color?: keyof typeof colorMap;
  className?: string;
}

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
