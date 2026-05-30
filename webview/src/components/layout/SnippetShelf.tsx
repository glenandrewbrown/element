import { useCallback } from "react";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { nativeMoleculeInsert, nativeTransportPanic } from "../../bridge/nativeGraph";
import { NeuButton, Icon } from "../neu";

/**
 * Left-nav panel for saved Snippets — pre-wired Block + Cable groups
 * (molecules) that drop onto the Board in one click. Select blocks on the
 * canvas and use File › Save as Snippet to create new ones.
 *
 * Relocated from the bottom edit-mode shelf into the project nav so
 * Snippets sit alongside SessionTree and ToolPalette for direct access
 * without scrolling the bottom bar.
 */
export function SnippetShelf() {
  const molecules = useHostExtrasStore((s) => s.molecules);

  const handleInsert = useCallback((name: string) => {
    void nativeMoleculeInsert(name, 120, 120);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-3 pt-3 pb-2 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <Icon
              name="Puzzle"
              size={13}
              className="text-accent-orange"
              aria-hidden
            />
            <span className="text-[11px] font-bold text-text-primary uppercase tracking-widest">
              Snippets
            </span>
            {molecules.length > 0 && (
              <span className="text-[10px] text-text-dim tabular">
                {molecules.length}
              </span>
            )}
          </div>
          {/* PANIC — always visible per spec */}
          <NeuButton
            variant="panic"
            size="sm"
            onClick={() => void nativeTransportPanic()}
          >
            PANIC
          </NeuButton>
        </div>
        {/* Explanatory label — clarifies what snippets are (G-15) */}
        <p className="text-[10px] text-text-dim leading-relaxed">
          Pre-wired Block + Cable groups — drop onto the Board in one click.
        </p>
      </div>

      {/* ── Snippet list ── */}
      <div className="flex-1 overflow-y-auto p-2">
        {molecules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-3 text-center px-2">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{
                boxShadow:
                  "inset 2px 2px 6px rgba(0,0,0,0.4), inset -1px -1px 4px rgba(255,255,255,0.05)",
              }}
            >
              <Icon
                name="Puzzle"
                size={16}
                className="text-text-dim"
                aria-hidden
              />
            </div>
            <div>
              <p className="text-[11px] text-text-secondary font-medium">
                No snippets yet
              </p>
              <p className="text-[10px] text-text-dim mt-1 leading-relaxed">
                Select blocks on the canvas,
                <br />
                then use File &rsaquo; Save as Snippet.
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-1.5 list-none p-0 m-0">
            {molecules.map((mol) => (
              <li key={mol.name}>
                <button
                  type="button"
                  onClick={() => handleInsert(mol.name)}
                  aria-label={`Insert snippet: ${mol.name}`}
                  title={mol.description || mol.name}
                  className="w-full group flex items-center gap-2.5 px-2.5 py-2 bg-surface rounded border border-white/5 hover:bg-elevated hover:border-white/10 active:border-white/5 cursor-pointer text-left transition-colors"
                  style={{
                    boxShadow:
                      "-2px -2px 6px rgba(255,255,255,0.04), 2px 2px 8px rgba(0,0,0,0.35)",
                  }}
                >
                  {/* Molecule icon badge */}
                  <div
                    className="w-6 h-6 shrink-0 rounded flex items-center justify-center"
                    style={{
                      boxShadow:
                        "inset 2px 2px 5px rgba(0,0,0,0.4), inset -1px -1px 3px rgba(255,255,255,0.04)",
                    }}
                  >
                    <Icon
                      name="Puzzle"
                      size={11}
                      className="text-accent-orange/60 group-hover:text-accent-orange transition-colors"
                      aria-hidden
                    />
                  </div>

                  {/* Name + description */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-text-primary font-medium truncate">
                      {mol.name}
                    </div>
                    {mol.description && (
                      <div className="text-[10px] text-text-dim truncate mt-0.5">
                        {mol.description}
                      </div>
                    )}
                  </div>

                  {/* Insert hint — shows on hover */}
                  <Icon
                    name="Plus"
                    size={11}
                    className="text-text-dim shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Footer hint (only when items present) ── */}
      {molecules.length > 0 && (
        <div className="px-2 py-1.5 border-t border-white/5 shrink-0">
          <p className="text-[10px] text-text-dim text-center">
            Shift+Drag to multi-select blocks
          </p>
        </div>
      )}
    </div>
  );
}
