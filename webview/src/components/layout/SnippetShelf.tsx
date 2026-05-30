import { useCallback } from "react";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { nativeMoleculeInsert } from "../../bridge/nativeGraph";
import { nativeTransportPanic } from "../../bridge/nativeGraph";
import { NeuButton, Icon } from "../neu";

/**
 * Edit-mode bottom shelf of saved Snippets (reusable Block + Cable groups,
 * a.k.a. molecules) shown as click-to-insert thumbnails. Use it to drop a
 * pre-wired chain (sidechain comp, reverb send, etc.) onto the Board in one
 * click instead of rebuilding it. Also hosts the always-visible red PANIC
 * button that sends Note Off to all MIDI outputs.
 */
export function SnippetShelf() {
  const molecules = useHostExtrasStore((s) => s.molecules);

  const handleInsert = useCallback((name: string) => {
    void nativeMoleculeInsert(name, 120, 120);
  }, []);

  return (
    <div className="h-full flex items-center gap-4 px-6 overflow-x-auto select-none">
      {/* Label */}
      <div className="shrink-0 flex items-center gap-2 mr-4">
        <Icon name="Puzzle" size={14} className="text-accent-orange" aria-hidden />
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
            <Icon name="Puzzle" size={10} className="text-accent-orange/60 group-hover:text-accent-orange" aria-hidden />
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
