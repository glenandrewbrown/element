import { Icon } from "../../neu/Icon";
import { NeuInput } from "../../neu";

interface PaletteSearchProps {
  tab: "plugins" | "projects";
  value: string;
  onChange: (v: string) => void;
  showScan: boolean;
  onToggleScan: () => void;
}

/**
 * Search row with gear/disclosure affordance that toggles ScanControls.
 * The placeholder always contains "Search" so useKeyboard Cmd+F selector
 * `aside input[placeholder*="Search"]` keeps working.
 */
export function PaletteSearch({
  tab,
  value,
  onChange,
  showScan,
  onToggleScan,
}: PaletteSearchProps) {
  const placeholder =
    tab === "plugins" ? "Search plugins…" : "Search project files…";

  return (
    <div className="flex items-center gap-1">
      <div className="relative flex-1">
        <NeuInput
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className="pl-8"
        />
        <span className="absolute left-2 top-1.5 text-text-secondary pointer-events-none">
          <Icon name="Search" size={16} aria-hidden />
        </span>
      </div>
      {tab === "plugins" ? (
        <button
          type="button"
          onClick={onToggleScan}
          aria-expanded={showScan}
          aria-label="Plugin scan settings"
          title="Plugin scan settings"
          className={[
            "shrink-0 p-1.5 rounded transition-colors",
            showScan
              ? "neu-inset text-accent-blue bg-pressed"
              : "text-text-secondary hover:bg-white/5",
          ].join(" ")}
        >
          <Icon name="Settings2" size={13} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
