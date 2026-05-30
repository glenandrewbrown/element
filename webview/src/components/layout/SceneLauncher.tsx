import { useCallback, useState } from "react";
import { useAppStore } from "../../stores/useAppStore";
import {
  usePerformStore,
  selectScenes,
  selectActiveScene,
} from "../../stores/usePerformStore";
import {
  nativePerformAddScene,
  nativePerformCaptureScene,
  nativePerformDeleteScene,
  nativePerformRenameScene,
  nativePerformSetActiveScene,
} from "../../bridge/nativePerform";
import { NeuButton, Icon } from "../neu";

/**
 * Perform-mode grid of Scenes (parameter snapshots of the Project) laid out as
 * launch-pad slots. Use it on stage to switch between saved parameter states
 * with one click — no plugin reload — and to capture, rename, or delete those
 * snapshots inline. Clicking a card routes through the optimistic
 * activate-with-rollback path so a failed host call reverts cleanly; the active
 * Scene is highlighted in the modifier (orange) accent.
 */
export function SceneLauncher() {
  const scenes = usePerformStore(selectScenes);
  const activeScene = usePerformStore(selectActiveScene);
  const setScene = useAppStore((s) => s.setScene);

  // Inline rename state: null = not renaming, number = index being renamed
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleActivate = useCallback(
    (index: number) => {
      // setScene routes through usePerformStore.activateScene which fires the
      // bridge with optimistic-update + rollback. Don't call the bridge again
      // here — that would double-fire and bypass rollback safety.
      setScene(index);
    },
    [setScene],
  );

  const handleAddScene = useCallback(() => {
    void nativePerformAddScene(`Scene ${scenes.length + 1}`);
  }, [scenes.length]);

  const handleCaptureScene = useCallback(
    (index: number) => {
      // Bridge-first ordering matters: activate on host so capture snapshots
      // into the right slot, then capture. Update local state directly at the
      // end — going through setScene would fire setActiveScene a third time.
      void nativePerformSetActiveScene(index)
        .then(() => nativePerformCaptureScene())
        .then(() => {
          useAppStore.setState({ activeScene: index });
          usePerformStore.setState((s) => ({
            scenes: s.scenes.map((sc, i) => ({ ...sc, active: i === index })),
          }));
        });
    },
    [],
  );

  const handleDelete = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.stopPropagation();
      void nativePerformDeleteScene(index);
    },
    [],
  );

  const beginRename = useCallback(
    (index: number, currentName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setRenamingIndex(index);
      setRenameValue(currentName);
    },
    [],
  );

  const commitRename = useCallback(
    (index: number) => {
      const trimmed = renameValue.trim();
      if (trimmed.length > 0) {
        void nativePerformRenameScene(index, trimmed);
      }
      setRenamingIndex(null);
      setRenameValue("");
    },
    [renameValue],
  );

  const cancelRename = useCallback(() => {
    setRenamingIndex(null);
    setRenameValue("");
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 bg-pressed border-b border-white/5">
        <div className="flex items-center gap-2">
          <Icon name="LayoutGrid" size={16} className="text-accent-orange" aria-hidden />
          <span className="text-[11px] font-bold text-text-primary uppercase tracking-widest">
            Scene Launcher
          </span>
          <span className="text-[10px] text-text-secondary">
            {scenes.length} scene{scenes.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <NeuButton size="sm" onClick={handleAddScene}>
            <Icon name="Plus" size={12} className="mr-1" aria-hidden />
            Add
          </NeuButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {scenes.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-text-dim">
            <Icon name="LayoutGrid" size={32} className="opacity-40" aria-hidden />
            <span className="text-[11px] uppercase tracking-widest">
              No scenes — press Add to create your first
            </span>
          </div>
        )}
        <div className="grid grid-cols-4 gap-3">
          {scenes.map((scene, index) => {
            const isActive = activeScene?.id === scene.id;
            const isRenaming = renamingIndex === index;

            return (
              // Scene card is a div (not a <button>) because it contains nested
              // interactive controls (rename input, capture/rename/delete
              // buttons) — a <button> may not contain interactive descendants
              // (invalid HTML + a11y violation). role="button" + keyboard
              // handler preserves the activate-on-click/Enter/Space behaviour.
              <div
                key={scene.id}
                role="button"
                tabIndex={isRenaming ? -1 : 0}
                aria-pressed={isActive}
                onClick={() => !isRenaming && handleActivate(index)}
                onKeyDown={(e) => {
                  if (isRenaming) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleActivate(index);
                  }
                }}
                className={[
                  "relative p-3 rounded-lg text-left transition-all border cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-accent-orange",
                  isActive
                    ? "bg-accent-orange/20 border-accent-orange shadow-[0_0_12px_rgba(232,168,56,0.25)]"
                    : "bg-surface border-white/5 hover:border-white/10 hover:bg-elevated",
                ].join(" ")}
              >
                {/* Scene name / rename input */}
                <div className="flex items-center justify-between gap-1">
                  {isRenaming ? (
                    <input
                      autoFocus
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(index)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(index);
                        if (e.key === "Escape") cancelRename();
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-0 bg-pressed text-text-primary text-[11px] font-bold rounded px-1 py-0.5 border border-accent-blue outline-none"
                    />
                  ) : (
                    <span className="text-[11px] font-bold text-text-primary truncate flex-1">
                      {scene.name}
                    </span>
                  )}
                  {scene.hasCapture && !isRenaming ? (
                    <span
                      className="w-2 h-2 rounded-full bg-accent-teal shadow-[0_0_6px_rgba(43,196,196,0.5)] shrink-0"
                      aria-hidden
                    />
                  ) : null}
                </div>

                <div className="mt-2 text-[10px] text-text-secondary uppercase tracking-widest">
                  Slot {index + 1}
                </div>

                {/* Bottom action row */}
                <div className="mt-3 flex items-center justify-between gap-1">
                  <span
                    className={[
                      "text-[10px] font-bold uppercase tracking-widest",
                      isActive ? "text-accent-orange" : "text-text-dim",
                    ].join(" ")}
                  >
                    {isActive ? "Active" : "Ready"}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {/* Capture */}
                    <button
                      type="button"
                      title="Capture current parameters into this scene"
                      className="inline-flex items-center gap-0.5 text-[10px] text-text-secondary hover:text-text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCaptureScene(index);
                      }}
                    >
                      <Icon name="Camera" size={11} aria-label="Capture parameters" />
                    </button>

                    {/* Rename */}
                    {!isRenaming && (
                      <button
                        type="button"
                        title="Rename scene"
                        className="inline-flex items-center gap-0.5 text-[10px] text-text-secondary hover:text-accent-blue"
                        onClick={(e) => beginRename(index, scene.name, e)}
                      >
                        <Icon name="Pencil" size={11} aria-label="Rename scene" />
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      type="button"
                      title="Delete scene"
                      className="inline-flex items-center gap-0.5 text-[10px] text-text-secondary hover:text-error"
                      onClick={(e) => handleDelete(index, e)}
                    >
                      <Icon name="Trash2" size={11} aria-label="Delete scene" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
