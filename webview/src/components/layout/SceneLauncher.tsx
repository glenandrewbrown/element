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
import { NeuButton } from "../neu";

const ICON_GRID =
  "M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z";
const ICON_ADD = "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z";
const ICON_CAMERA =
  "M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm9.5 6.5v3h-3v-3h3M22 11h-6v6h6v-6zm-11 6.5v3h-3v-3h3M11 16H5v6h6v-6zm5-9.5v3h-3v-3h3M18 5h-6v6h6V5z";
const ICON_DELETE = "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z";
const ICON_EDIT = "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z";

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

export function SceneLauncher() {
  const scenes = usePerformStore(selectScenes);
  const activeScene = usePerformStore(selectActiveScene);
  const setScene = useAppStore((s) => s.setScene);

  // Inline rename state: null = not renaming, number = index being renamed
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleActivate = useCallback(
    (index: number) => {
      void nativePerformSetActiveScene(index);
      setScene(index);
    },
    [setScene],
  );

  const handleAddScene = useCallback(() => {
    void nativePerformAddScene(`Scene ${scenes.length + 1}`);
  }, [scenes.length]);

  const handleCaptureScene = useCallback(
    (index: number) => {
      void nativePerformSetActiveScene(index)
        .then(() => nativePerformCaptureScene())
        .then(() => setScene(index));
    },
    [setScene],
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
          <Icon d={ICON_GRID} size={16} className="text-modifier" />
          <span className="text-[11px] font-bold text-text-primary uppercase tracking-widest">
            Scene Launcher
          </span>
          <span className="text-[10px] text-text-secondary">
            {scenes.length} scene{scenes.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <NeuButton size="sm" onClick={handleAddScene}>
            <Icon d={ICON_ADD} size={12} className="mr-1" />
            Add
          </NeuButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {scenes.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-text-dim">
            <Icon d={ICON_GRID} size={32} className="opacity-40" />
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
              <button
                key={scene.id}
                type="button"
                onClick={() => !isRenaming && handleActivate(index)}
                className={[
                  "relative p-3 rounded-lg text-left transition-all border",
                  isActive
                    ? "bg-modifier/20 border-modifier shadow-[0_0_12px_rgba(232,168,56,0.25)]"
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
                      className="flex-1 min-w-0 bg-pressed text-text-primary text-[11px] font-bold rounded px-1 py-0.5 border border-generator outline-none"
                    />
                  ) : (
                    <span className="text-[11px] font-bold text-text-primary truncate flex-1">
                      {scene.name}
                    </span>
                  )}
                  {scene.hasCapture && !isRenaming ? (
                    <span
                      className="w-2 h-2 rounded-full bg-logic shadow-[0_0_6px_rgba(43,196,196,0.5)] shrink-0"
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
                      isActive ? "text-modifier" : "text-text-dim",
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
                      <Icon d={ICON_CAMERA} size={11} />
                    </button>

                    {/* Rename */}
                    {!isRenaming && (
                      <button
                        type="button"
                        title="Rename scene"
                        className="inline-flex items-center gap-0.5 text-[10px] text-text-secondary hover:text-generator"
                        onClick={(e) => beginRename(index, scene.name, e)}
                      >
                        <Icon d={ICON_EDIT} size={11} />
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      type="button"
                      title="Delete scene"
                      className="inline-flex items-center gap-0.5 text-[10px] text-text-secondary hover:text-error"
                      onClick={(e) => handleDelete(index, e)}
                    >
                      <Icon d={ICON_DELETE} size={11} />
                    </button>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
