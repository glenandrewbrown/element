import { useCallback } from "react";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { nativeMoleculeInsert } from "../../bridge/nativeGraph";
import { nativeTransportPanic } from "../../bridge/nativeGraph";
import { NeuButton } from "../neu";

const ICON_PUZZLE =
  "M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z";

function Icon({
  d,
  size = 14,
  className = "",
}: {
  d: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

export function SnippetShelf() {
  const molecules = useHostExtrasStore((s) => s.molecules);

  const handleInsert = useCallback((name: string) => {
    void nativeMoleculeInsert(name, 120, 120);
  }, []);

  return (
    <div className="h-full flex items-center gap-4 px-6 overflow-x-auto select-none">
      {/* Label */}
      <div className="shrink-0 flex items-center gap-2 mr-4">
        <Icon d={ICON_PUZZLE} size={14} className="text-modifier" />
        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
          Snippets
        </span>
        <span className="text-[10px] text-text-dim">
          {molecules.length}
        </span>
      </div>

      {/* Molecule thumbnails */}
      <div className="flex items-center gap-3">
        {molecules.length === 0 && (
          <span className="text-[10px] text-text-dim italic">
            No snippets saved — select blocks and save as molecule
          </span>
        )}
        {molecules.map((mol) => (
          <button
            key={mol.name}
            type="button"
            onClick={() => handleInsert(mol.name)}
            title={mol.description || mol.name}
            className="w-32 h-10 bg-pressed rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] border border-white/5 flex items-center justify-center gap-2 group cursor-pointer hover:bg-surface hover:border-white/10 transition-colors"
          >
            <Icon d={ICON_PUZZLE} size={10} className="text-modifier/60 group-hover:text-modifier" />
            <span className="text-[10px] text-text-secondary group-hover:text-text-primary font-medium truncate max-w-[90px]">
              {mol.name}
            </span>
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Keyboard hints */}
      <div className="shrink-0 text-[10px] text-white/20 tracking-[2px] uppercase mr-4">
        Shift+Drag: Multi-select
      </div>

      {/* Panic button */}
      <NeuButton variant="panic" size="sm" onClick={() => void nativeTransportPanic()}>
        PANIC
      </NeuButton>
    </div>
  );
}
