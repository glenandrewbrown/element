const colorMap = {
  blue: { bg: "bg-generator/20", text: "text-generator" },
  orange: { bg: "bg-modifier/20", text: "text-modifier" },
  teal: { bg: "bg-logic/20", text: "text-logic" },
  purple: { bg: "bg-badge-au/20", text: "text-badge-au" },
  grey: { bg: "bg-badge-lv2/20", text: "text-badge-lv2" },
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
  const { bg, text: textColor } = colorMap[color];

  return (
    <span
      className={[
        "inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wide",
        "shadow-[-1px_-1px_4px_rgba(255,255,255,0.02),1px_1px_4px_rgba(0,0,0,0.25)]",
        bg,
        textColor,
        className,
      ].join(" ")}
    >
      {text}
    </span>
  );
}
