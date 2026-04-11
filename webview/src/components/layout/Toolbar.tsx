import { useAppStore } from "../../stores/useAppStore";
import { useGraphStore, selectBreadcrumbs } from "../../stores/useGraphStore";
import {
  usePerformStore,
  selectBpm,
  selectScenes,
  selectActiveScene,
  selectLiveHealth,
} from "../../stores/usePerformStore";
import {
  nativeTransportPanic,
  nativeTransportTogglePlay,
} from "../../bridge/nativeGraph";
import {
  nativeSessionNew,
  nativeSessionOpen,
  nativeSessionSave,
  nativeSessionSaveAs,
  nativeSessionSetActiveGraph,
} from "../../bridge/nativeSession";
import { useSessionStore } from "../../stores/useSessionStore";
import { useState } from "react";
import { PreferencesModal } from "./PreferencesModal";
import { AboutModal } from "./AboutModal";
import {
  nativePerformAddScene,
  nativePerformCaptureScene,
} from "../../bridge/nativePerform";

// ── SVG icon helpers (inline to avoid icon-font dependency) ──

function Icon({
  d,
  size = 16,
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

// Material icon paths
const ICON_SKIP_PREV = "M6 6h2v12H6zm3.5 6l8.5 6V6z";
const ICON_PLAY = "M8 5v14l11-7z";
const ICON_STOP = "M6 6h12v12H6z";
const ICON_CHEVRON_RIGHT = "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z";
const ICON_LAYERS =
  "M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z";
const ICON_SETTINGS =
  "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.61 3.61 0 0112 15.6z";
const ICON_POWER =
  "M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42A6.92 6.92 0 0119 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.27 1.08-4.28 2.59-5.59L6.17 5.17A8.93 8.93 0 003 12a9 9 0 0018 0c0-2.74-1.23-5.18-3.17-6.83z";
const ICON_ARROW_LEFT = "M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z";
const ICON_ARROW_RIGHT = "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z";
const ICON_SCHEDULE =
  "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z";

// ── Toolbar component ──

function sessionDisplayName(filePath: string, dirty: boolean): string {
  if (!filePath || filePath.length === 0)
    return dirty ? "Untitled •" : "Untitled";
  const base = filePath.replace(/^.*[/\\]/, "");
  const stem = base.replace(/\.els$/i, "");
  return dirty ? `${stem} •` : stem;
}

export function Toolbar() {
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const mode = useAppStore((s) => s.mode);
  const toggleMode = useAppStore((s) => s.toggleMode);
  const activeSceneIdx = useAppStore((s) => s.activeScene);
  const setScene = useAppStore((s) => s.setScene);
  const breadcrumbs = useGraphStore(selectBreadcrumbs);
  const bpm = usePerformStore(selectBpm);
  const live = usePerformStore(selectLiveHealth);
  const scenes = usePerformStore(selectScenes);
  const activeSceneData = usePerformStore(selectActiveScene);
  const filePath = useSessionStore((s) => s.filePath);
  const dirty = useSessionStore((s) => s.dirty);
  const sessionGraphs = useSessionStore((s) => s.graphs);

  const isEdit = mode === "edit";
  const sceneCount = Math.max(1, scenes.length);
  const sceneLabel = `SCENE ${activeSceneIdx + 1}/${sceneCount}`;

  return (
    <>
      <div className="w-full h-full flex items-center justify-between tabular text-[12px] tracking-wider uppercase select-none">
        {/* ── Left: Logo + Breadcrumb / Perform badge ── */}
        <div className="flex items-center gap-4">
          <span className="font-black text-lg tracking-tighter text-text-primary normal-case">
            ELEMENT
          </span>

          {isEdit ? (
            /* Edit mode: session file + graph + breadcrumb */
            <div className="flex items-center gap-3 text-text-secondary font-medium border-l border-white/10 pl-4 flex-wrap">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide">
                <button
                  type="button"
                  className="px-1.5 py-0.5 rounded bg-pressed shadow-inner text-text-secondary hover:text-text-primary"
                  onClick={() => void nativeSessionNew()}
                >
                  New
                </button>
                <button
                  type="button"
                  className="px-1.5 py-0.5 rounded bg-pressed shadow-inner text-text-secondary hover:text-text-primary"
                  onClick={() => void nativeSessionOpen()}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="px-1.5 py-0.5 rounded bg-pressed shadow-inner text-text-secondary hover:text-text-primary"
                  onClick={() => void nativeSessionSave()}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="px-1.5 py-0.5 rounded bg-pressed shadow-inner text-text-secondary hover:text-text-primary"
                  onClick={() => void nativeSessionSaveAs()}
                >
                  As…
                </button>
              </div>
              <span
                className="text-[11px] text-modifier max-w-[140px] truncate normal-case"
                title={filePath || "No file on disk"}
              >
                {sessionDisplayName(filePath, dirty)}
              </span>
              {sessionGraphs.length > 1 ? (
                <label className="flex items-center gap-1 text-[10px] normal-case">
                  <span className="opacity-50">Board</span>
                  <select
                    className="bg-pressed text-text-primary rounded px-1 py-0.5 border border-white/10 max-w-[120px]"
                    value={String(
                      sessionGraphs.find((g) => g.active)?.index ?? 0,
                    )}
                    onChange={(e) =>
                      void nativeSessionSetActiveGraph(Number(e.target.value))
                    }
                  >
                    {sessionGraphs.map((g) => (
                      <option key={g.id} value={String(g.index)}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="flex items-center gap-2">
                {breadcrumbs.map((crumb, i) => {
                  const isLast = i === breadcrumbs.length - 1;
                  return (
                    <span key={crumb} className="flex items-center gap-2">
                      {i > 0 && (
                        <Icon
                          d={ICON_CHEVRON_RIGHT}
                          size={14}
                          className="text-text-secondary"
                        />
                      )}
                      <span
                        className={
                          isLast
                            ? "text-generator"
                            : "hover:text-text-primary transition-colors cursor-pointer"
                        }
                      >
                        {crumb}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Perform mode: badge + BPM + LIVE */
            <>
              <div className="h-4 w-px bg-white/10 mx-1" />
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-pressed text-modifier shadow-inner">
                  <Icon d={ICON_PLAY} size={14} />
                  <span className="font-bold">PERFORM</span>
                </div>
                <div className="flex items-center gap-4 text-text-secondary">
                  <span className="flex items-center gap-1">
                    <Icon d={ICON_SCHEDULE} size={14} />
                    {bpm.toFixed(2)} BPM
                  </span>
                  <span>4/4</span>
                  <span>LIVE</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Center: Transport + Metrics + Mode Toggle (Edit only) ── */}
        {isEdit && (
          <div className="flex items-center gap-6">
            {/* Transport */}
            <div className="flex items-center gap-1 bg-pressed px-2 py-0.5 rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]">
              <button className="text-text-secondary hover:text-text-primary transition-colors p-0.5">
                <Icon d={ICON_SKIP_PREV} size={16} />
              </button>
              <button
                type="button"
                className="text-logic hover:text-logic/80 transition-colors p-0.5"
                onClick={() => void nativeTransportTogglePlay()}
                aria-label="Play or pause"
              >
                <Icon d={ICON_PLAY} size={18} />
              </button>
              <button className="text-text-secondary hover:text-text-primary transition-colors p-0.5">
                <Icon d={ICON_STOP} size={16} />
              </button>
            </div>

            {/* Metrics */}
            <div className="flex gap-4 text-text-secondary">
              <div className="flex flex-col items-center">
                <span className="text-[10px] opacity-50">BPM</span>
                <span className="text-modifier font-bold tabular">
                  {bpm.toFixed(2)}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] opacity-50">BUFFER</span>
                <span className="text-text-primary font-bold tabular">
                  {live.buffer > 0 ? `${live.buffer}` : "—"}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] opacity-50">SAMPLE</span>
                <span className="text-text-primary font-bold tabular">
                  {live.timecode || "—"}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] opacity-50">LATENCY</span>
                <span className="text-logic font-bold tabular">
                  {live.latency > 0 ? `${live.latency.toFixed(1)} ms` : "—"}
                </span>
              </div>
            </div>

            {/* Mode toggle */}
            <button
              onClick={toggleMode}
              className="flex items-center gap-1 bg-pressed px-3 py-1 rounded-full shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] border border-white/5"
            >
              <span className="text-[10px] text-generator font-bold">EDIT</span>
              <div className="w-6 h-3 bg-generator rounded-full relative">
                <div className="absolute right-0.5 top-0.5 w-2 h-2 bg-text-primary rounded-full" />
              </div>
              <span className="text-[10px] text-text-secondary">PERFORM</span>
            </button>
          </div>
        )}

        {/* ── Right: Scene + Engine status + Settings ── */}
        <div className="flex items-center gap-3">
          {isEdit ? (
            <>
              {/* Scene selector */}
              <div className="flex items-center gap-2 bg-pressed px-2 py-0.5 rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] text-text-secondary">
                <Icon d={ICON_LAYERS} size={16} />
                <button
                  className="hover:text-text-primary transition-colors"
                  onClick={() =>
                    setScene((activeSceneIdx - 1 + sceneCount) % sceneCount)
                  }
                >
                  <Icon d={ICON_ARROW_LEFT} size={14} />
                </button>
                <span className="inline-flex items-center gap-1">
                  {sceneLabel}
                  {activeSceneData?.hasCapture ? (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-modifier shadow-[0_0_6px_rgba(232,168,56,0.5)]"
                      title="This scene has a stored parameter capture"
                      aria-hidden
                    />
                  ) : null}
                </span>
                <button
                  className="hover:text-text-primary transition-colors"
                  onClick={() => setScene((activeSceneIdx + 1) % sceneCount)}
                >
                  <Icon d={ICON_ARROW_RIGHT} size={14} />
                </button>
                <button
                  type="button"
                  className="ml-1 px-1.5 py-0.5 rounded bg-surface text-[10px] text-generator font-bold hover:bg-elevated"
                  title="Add perform scene (session)"
                  onClick={() =>
                    void nativePerformAddScene(`Scene ${sceneCount + 1}`)
                  }
                >
                  +
                </button>
                <button
                  type="button"
                  disabled={captureBusy}
                  className="ml-1 px-1.5 py-0.5 rounded bg-surface text-[9px] text-modifier font-bold hover:bg-elevated disabled:opacity-40"
                  title="Capture current graph parameters into the active scene"
                  onClick={() => {
                    setCaptureBusy(true);
                    void nativePerformCaptureScene().finally(() =>
                      setCaptureBusy(false),
                    );
                  }}
                >
                  CAP
                </button>
              </div>

              {/* Settings + Power */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-[10px] uppercase tracking-wide text-text-secondary hover:text-text-primary px-1"
                  onClick={() => setAboutOpen(true)}
                >
                  About
                </button>
                <button
                  type="button"
                  className="text-text-secondary hover:text-text-primary transition-colors"
                  aria-label="Preferences"
                  onClick={() => setPrefsOpen(true)}
                >
                  <Icon d={ICON_SETTINGS} size={18} />
                </button>
                <button
                  type="button"
                  className="text-text-secondary hover:text-error transition-colors"
                  aria-label="MIDI panic"
                  onClick={() => void nativeTransportPanic()}
                >
                  <Icon d={ICON_POWER} size={18} />
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Engine status */}
              <div className="flex items-center gap-2 px-3 py-1 bg-pressed rounded-sm text-logic border border-white/5">
                <span className="w-2 h-2 rounded-full bg-logic animate-pulse" />
                <span className="font-bold tracking-widest uppercase">
                  Engine: Live
                </span>
              </div>

              {/* Scene (compact) */}
              {activeSceneData && (
                <span className="text-[10px] text-text-secondary">
                  {activeSceneData.name}
                </span>
              )}

              {/* Settings + Power */}
              <button
                type="button"
                className="text-[10px] uppercase tracking-wide text-text-secondary hover:text-text-primary px-1"
                onClick={() => setAboutOpen(true)}
              >
                About
              </button>
              <button
                type="button"
                className="text-text-secondary hover:text-text-primary transition-colors"
                aria-label="Preferences"
                onClick={() => setPrefsOpen(true)}
              >
                <Icon d={ICON_SETTINGS} size={18} />
              </button>
              <button className="text-text-secondary hover:text-error transition-colors">
                <Icon d={ICON_POWER} size={18} />
              </button>
            </>
          )}
        </div>
      </div>
      {prefsOpen ? (
        <PreferencesModal onClose={() => setPrefsOpen(false)} />
      ) : null}
      {aboutOpen ? <AboutModal onClose={() => setAboutOpen(false)} /> : null}
    </>
  );
}
