import { useState } from "react";
import { Icon } from "../../neu/Icon";

interface CollapsibleSectionProps {
  label: React.ReactNode;
  defaultOpen?: boolean;
  /** Additional classes on the header button */
  headerClassName?: string;
  children: React.ReactNode;
  "data-testid"?: string;
}

/**
 * Neumorphic disclosure widget reused by FavouritesSection, RecentsSection,
 * MoleculesSection, and BoardsSection. The toggle arrow rotates 90° when open.
 * Styled to match the existing "Plugin Scan & Paths" collapsible pattern.
 */
export function CollapsibleSection({
  label,
  defaultOpen = true,
  headerClassName,
  children,
  "data-testid": testId,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={[
          "w-full flex items-center gap-1.5 px-1 py-1 text-[9px] font-bold tracking-widest uppercase hover:text-text-primary transition-colors",
          headerClassName ?? "text-text-secondary",
        ].join(" ")}
      >
        <Icon
          name="ChevronRight"
          size={11}
          aria-hidden
          className={`shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        />
        {label}
      </button>
      {open ? children : null}
    </div>
  );
}
