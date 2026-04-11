import { useState, useCallback } from "react";
import {
  usePerformStore,
  selectScenes,
  selectActiveScene,
} from "../../stores/usePerformStore";
import { useAppStore } from "../../stores/useAppStore";
import { NeuButton, NeuToggle } from "../neu";
import {
  nativePerformAddScene,
  nativePerformCaptureScene,
  nativePerformRemoveScene,
  nativePerformRenameScene,
  nativePerformSetActiveScene,
} from "../../bridge/nativePerform";

// ── Icons ──

const ICON_GRID =
  "M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z";
const ICON_ADD = "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z";
const ICON_CAMERA =
  "M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm9.5 6.5v3h-3v-3h3M22 11h-6v6h6v-6zm-11 6.5v3h-3v-3h3M11 16H5v6h6v-6zm5-9.5v3h-3v-3h3M18 5h-6v6h6V5z";
const ICON_EDIT =
  "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z";
const ICON_DELETE =
  "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z";
const ICON_MIDI =
  "M7 5v14h3v-6h4v6h3V5H7zm10 8H7v-2h10v2z";

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

// ── Scene card ──

interface SceneCardProps {
  id: string;
  name: string;
  index: number;
  isActive: boolean;
  hasCapture: boolean;
  onActivate: () => void;
  onCapture: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
}

function SceneCard({
  name,
  index,
  isActive,
  hasCapture,
  onActivate,
  onCapture,
  onRename,
  onDelete,
}: SceneCardProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);

  const handleRename = () => {
    if (editName.trim() && editName !== name) {
      onRename(editName.trim());
    }
    setEditing(false);
  };

  return (
    <div
      className={[
        "relative p-3 rounded-lg transition-all cursor-pointer group",
        isActive
          ? "bg-modifier/20 border-2 border-modifier shadow-[0_0_12px_rgba(232,168,56,0.2)]"
          : "bg-surface border border-white/5 hover:border-white/10 hover:bg-elevated",
      ].join(" ")}
      onClick={() => !editing && onActivate()}
    >
      {/* Scene number badge */}
      <div
        className={[
          "absolute -top-2 -left-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black",
          isActive ? "bg-modifier text-[#1A1A1E]" : "bg-pressed text-text-secondary",
        ].join(" ")}
      >
        {index + 1}
      </div>

      {/* Capture indicator */}
      {hasCapture && (
        <div
          className="absolute top-1 right-1 w-2 h-2 rounded-full bg-logic shadow-[0_0_6px_rgba(43,196,196,0.5)]"
          title="Has stored parameter capture"
        />
      )}

      {/* Name */}
      {editing ? (
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
            if (e.key === "Escape") {
              setEditName(name);
              setEditing(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-full bg-pressed px-2 py-1 rounded text-[11px] text-text-primary border border-white/10 focus:border-generator focus:outline-none"
          autoFocus
        />
      ) : (
        <div className="text-[11px] font-bold text-text-primary truncate pr-6">
          {name}
        </div>
      )}

      {/* MIDI program change hint */}
      <div className="flex items-center gap-1 mt-2 text-[9px] text-text-dim">
        <Icon d={ICON_MIDI} size={10} />
        <span>PC {index}</span>
      </div>

      {/* Actions (visible on hover) */}
      <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="p-1 rounded bg-pressed hover:bg-elevated text-text-secondary"
          title="Rename"
        >
          <Icon d={ICON_EDIT} size={10} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCapture();
          }}
          className="p-1 rounded bg-pressed hover:bg-logic/20 text-text-secondary hover:text-logic"
          title="Capture parameters"
        >
          <Icon d={ICON_CAMERA} size={10} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 rounded bg-pressed hover:bg-error/20 text-text-secondary hover:text-error"
          title="Delete"
        >
          <Icon d={ICON_DELETE} size={10} />
        </button>
      </div>
    </div>
  );
}

// ── SceneLauncher component ──

export function SceneLauncher() {
  const scenes = usePerformStore(selectScenes);
  const activeScene = usePerformStore(selectActiveScene);
  const setAppScene = useAppStore((s) => s.setScene);
  const [midiLearn, setMidiLearn] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);

  const handleActivate = useCallback(
    (index: number) => {
      void nativePerformSetActiveScene(index);
      setAppScene(index);
    },
    [setAppScene]
  );

  const handleAddScene = useCallback(() => {
    void nativePerformAddScene(`Scene ${scenes.length + 1}`);
  }, [scenes.length]);

  const handleCapture = useCallback(async (index: number) => {
    setCaptureBusy(true);
    try {
      await nativePerformSetActiveScene(index);
      await nativePerformCaptureScene();
    } finally {
      setCaptureBusy(false);
    }
  }, []);

  const handleRename = useCallback((index: number, newName: string) => {
    void nativePerformRenameScene(index, newName);
  }, []);

  const handleDelete = useCallback((index: number) => {
    if (scenes.length > 1) {
      void nativePerformRemoveScene(index);
    }
  }, [scenes.length]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-pressed border-b border-white/5">
        <div className="flex items-center gap-2">
          <Icon d={ICON_GRID} size={16} className="text-modifier" />
          <span className="text-[11px] font-bold text-text-primary uppercase tracking-widest">
            Scene Launcher
          </span>
          <span className="text-[10px] text-text-secondary">
            {scenes.length} scene{scenes.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* MIDI Learn toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-text-secondary uppercase">MIDI Learn</span>
            <NeuToggle active={midiLearn} onChange={setMidiLearn} color="teal" />
          </div>

          {/* Capture all button */}
          <NeuButton
            size="sm"
            onClick={() => void nativePerformCaptureScene()}
            disabled={captureBusy}
          >
            <Icon d={ICON_CAMERA} size={12} className="mr-1" />
            Capture
          </NeuButton>

          {/* Add scene button */}
          <NeuButton size="sm" onClick={handleAddScene}>
            <Icon d={ICON_ADD} size={12} />
          </NeuButton>
        </div>
      </div>

      {/* Scene grid */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="grid grid-cols-4 gap-3">
          {scenes.map((scene, i) => (
            <SceneCard
              key={scene.id}
              id={scene.id}
              name={scene.name}
              index={i}
              isActive={activeScene?.id === scene.id}
              hasCapture={scene.hasCapture ?? false}
              onActivate={() => handleActivate(i)}
              onCapture={() => void handleCapture(i)}
              onRename={(newName) => handleRename(i, newName)}
              onDelete={() => handleDelete(i)}
            />
          ))}

          {/* Add scene placeholder */}
          <button
            onClick={handleAddScene}
            className="p-3 rounded-lg border-2 border-dashed border-white/10 hover:border-generator/50 flex flex-col items-center justify-center gap-2 text-text-dim hover:text-generator transition-colors min-h-[80px]"
          >
            <Icon d={ICON_ADD} size={20} />
            <span className="text-[10px] font-bold uppercase">Add Scene</span>
          </button>
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 bg-pressed border-t border-white/5 text-[9px] text-text-dim text-center">
        Click to activate. Scenes can be triggered via MIDI Program Change. Double-click to edit
        name.
      </div>
    </div>
  );
}
