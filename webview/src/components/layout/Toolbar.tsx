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
  nativeUndo,
  nativeRedo,
} from "../../bridge/nativeGraph";
import {
  nativeSessionNew,
  nativeSessionOpen,
  nativeSessionSave,
  nativeSessionSaveAs,
  nativeSessionSetActiveGraph,
} from "../../bridge/nativeSession";
import { useSessionStore } from "../../stores/useSessionStore";
import { useState, useRef, useCallback } from "react";
import { PreferencesModal } from "./PreferencesModal";
import { AboutModal } from "./AboutModal";
import {
  nativePerformAddScene,
  nativePerformCaptureScene,
} from "../../bridge/nativePerform";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";

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
const ICON_ARROW_LEFT = "M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z";
const ICON_ARROW_RIGHT = "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z";
const ICON_SCHEDULE =
  "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z";
const ICON_UNDO = "M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z";
const ICON_REDO = "M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z";
const ICON_PANIC = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z";
const ICON_SYNC = "M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z";
const ICON_TAP = "M8 11h2v10H8zm4-4h2v14h-2zm4-2h2v16h-2z";

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
  const undoDepth = useHostExtrasStore((s) => s.undoDepth);
  const redoDepth = useHostExtrasStore((s) => s.redoDepth);
  const externalSync = useHostExtrasStore((s) => s.externalSync);
  const timeSig = useHostExtrasStore((s) => s.timeSig);

  // TAP tempo logic
  const tapTimesRef = useRef<number[]>([]);
  const [lastTapBpm, setLastTapBpm] = useState<number | null>(null);

  const handleTap = useCallback(() => {
    const now = performance.now();
    const taps = tapTimesRef.current;
    taps.push(now);
    // Keep only taps within last 3 seconds
    const cutoff = now - 3000;
    while (taps.length > 0 && taps[0] < cutoff) taps.shift();
    if (taps.length >= 2) {
      const intervals = [];
      for (let i = 1; i < taps.length; i++) {
        intervals.push(taps[i] - taps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const tapBpm = 60000 / avgInterval;
      if (tapBpm > 30 && tapBpm < 300) {
        setLastTapBpm(Math.round(tapBpm * 10) / 10);
      }
    }
  }, []);

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
            /* Perform mode: badge + BPM + LIVE + Mode toggle */
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
                {/* Mode toggle - back to Edit */}
                <button
                  onClick={toggleMode}
                  className="flex items-center gap-1 bg-pressed px-3 py-1 rounded-full shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] border border-white/5"
                >
                  <span className="text-[10px] text-text-secondary">EDIT</span>
                  <div className="w-6 h-3 bg-modifier rounded-full relative">
                    <div className="absolute left-0.5 top-0.5 w-2 h-2 bg-text-primary rounded-full" />
                  </div>
                  <span className="text-[10px] text-modifier font-bold">PERFORM</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Center: Transport + Tempo + Undo/Redo + PANIC + Mode Toggle ── */}
        {isEdit && (
          <div className="flex items-center gap-4">
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

            {/* BPM + Time Sig + TAP */}
            <div className="flex items-center gap-2 text-text-secondary">
              <div className="flex flex-col items-center">
                <span className="text-modifier font-bold tabular text-[13px]">
                  {lastTapBpm ?? bpm.toFixed(2)}
                </span>
                <span className="text-[8px] opacity-50">BPM</span>
              </div>
              <div className="flex flex-col items-center px-1">
                <span className="text-text-primary font-bold tabular text-[12px]">
                  {timeSig || "4/4"}
                </span>
              </div>
              <button
                type="button"
                onClick={handleTap}
                className="px-2 py-1 text-[9px] font-bold uppercase rounded bg-surface shadow-[-2px_-2px_6px_rgba(255,255,255,0.04),2px_2px_6px_rgba(0,0,0,0.35)] hover:bg-elevated active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)] border border-white/5 text-text-secondary hover:text-text-primary"
              >
                TAP
              </button>
              {/* EXT sync indicator */}
              {externalSync && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-logic/20 border border-logic/30">
                  <Icon d={ICON_SYNC} size={12} className="text-logic" />
                  <span className="text-[9px] font-bold text-logic">EXT</span>
                </div>
              )}
            </div>

            {/* Undo/Redo */}
            <div className="flex items-center gap-1 bg-pressed px-2 py-0.5 rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]">
              <button
                type="button"
                onClick={() => void nativeUndo()}
                disabled={undoDepth === 0}
                className="text-text-secondary hover:text-text-primary transition-colors p-0.5 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-0.5"
                title={`Undo (${undoDepth})`}
              >
                <Icon d={ICON_UNDO} size={16} />
                {undoDepth > 0 && (
                  <span className="text-[9px] tabular text-generator">{undoDepth}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => void nativeRedo()}
                disabled={redoDepth === 0}
                className="text-text-secondary hover:text-text-primary transition-colors p-0.5 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-0.5"
                title={`Redo (${redoDepth})`}
              >
                <Icon d={ICON_REDO} size={16} />
                {redoDepth > 0 && (
                  <span className="text-[9px] tabular text-logic">{redoDepth}</span>
                )}
              </button>
            </div>

            {/* PANIC button - RED, always visible, prominent */}
            <button
              type="button"
              onClick={() => void nativeTransportPanic()}
              className="px-3 py-1 rounded-full bg-error/20 border-2 border-error/50 text-error font-black text-[10px] uppercase tracking-wider shadow-[-2px_-2px_6px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] hover:bg-error/30 hover:border-error active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)] transition-all"
              aria-label="MIDI panic - send all notes off"
            >
              PANIC
            </button>

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
              {/* PANIC button - prominent in Perform mode, essential for live safety */}
              <button
                type="button"
                onClick={() => void nativeTransportPanic()}
                className="px-4 py-1.5 rounded-full bg-error/30 border-2 border-error text-error font-black text-[11px] uppercase tracking-wider shadow-[-2px_-2px_6px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] hover:bg-error/50 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)] transition-all"
                aria-label="MIDI panic - send all notes off"
              >
                PANIC
              </button>

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

              {/* Settings */}
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
