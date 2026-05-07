import { useAppStore, selectCableRouting } from "../../stores/useAppStore";
import { useGraphStore, selectBreadcrumbs } from "../../stores/useGraphStore";
import {
  usePerformStore,
  selectBpm,
  selectScenes,
  selectActiveScene,
  selectLiveHealth,
  selectIsPlaying,
} from "../../stores/usePerformStore";
import {
  nativeTransportPanic,
  nativeTransportTogglePlay,
  nativeTransportStop,
  nativeTransportRewind,
  nativeTransportSetTempo,
} from "../../bridge/nativeGraph";
import {
  nativeSessionNew,
  nativeSessionOpen,
  nativeSessionSave,
  nativeSessionSaveAs,
  nativeSessionSetActiveGraph,
} from "../../bridge/nativeSession";
import { useSessionStore } from "../../stores/useSessionStore";
import { useEffect, useState } from "react";
import { PreferencesModal } from "./PreferencesModal";
import { AboutModal } from "./AboutModal";
import {
  nativePerformAddScene,
  nativePerformCaptureScene,
} from "../../bridge/nativePerform";
import { EV_OPEN_PREFERENCES } from "../../events";
import { Icon } from "../neu";

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
  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmInput, setBpmInput] = useState("");

  useEffect(() => {
    const handleOpenPreferences = () => setPrefsOpen(true);
    window.addEventListener(EV_OPEN_PREFERENCES, handleOpenPreferences);
    return () => {
      window.removeEventListener(
        EV_OPEN_PREFERENCES,
        handleOpenPreferences,
      );
    };
  }, []);
  const mode = useAppStore((s) => s.mode);
  const toggleMode = useAppStore((s) => s.toggleMode);
  const activeSceneIdx = useAppStore((s) => s.activeScene);
  const setScene = useAppStore((s) => s.setScene);
  const breadcrumbs = useGraphStore(selectBreadcrumbs);
  const bpm = usePerformStore(selectBpm);
  const live = usePerformStore(selectLiveHealth);
  const isPlaying = usePerformStore(selectIsPlaying);
  const scenes = usePerformStore(selectScenes);
  const activeSceneData = usePerformStore(selectActiveScene);
  const filePath = useSessionStore((s) => s.filePath);
  const dirty = useSessionStore((s) => s.dirty);
  const sessionGraphs = useSessionStore((s) => s.graphs);

  const cableRouting = useAppStore(selectCableRouting);
  const setCableRouting = useAppStore((s) => s.setCableRouting);

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
                          name="ChevronRight"
                          size={14}
                          className="text-text-secondary"
                          aria-hidden
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
                  <Icon name="Play" size={14} aria-hidden />
                  <span className="font-bold">PERFORM</span>
                </div>
                <div className="flex items-center gap-4 text-text-secondary">
                  <span className="flex items-center gap-1">
                    <Icon name="Clock" size={14} aria-hidden />
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
            {/* Undo/Redo — Section 7.8 */}
            <div className="flex items-center gap-1 bg-pressed px-1.5 py-0.5 rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] border border-white/5">
              <button className="text-text-secondary hover:text-text-primary p-1 flex items-center gap-1" title="Undo">
                <Icon name="Undo2" size={14} aria-label="Undo" />
              </button>
              <button className="text-text-secondary hover:text-text-primary p-1" title="Redo">
                <Icon name="Redo2" size={14} aria-label="Redo" />
              </button>
            </div>

            {/* Transport */}
            <div className="flex items-center gap-1 bg-pressed px-2 py-0.5 rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] border border-white/5">
              <button
                type="button"
                className="text-text-secondary hover:text-text-primary transition-colors p-0.5"
                title="Rewind"
                aria-label="Rewind to start"
                onClick={() => void nativeTransportRewind()}
              >
                <Icon name="SkipBack" size={16} aria-hidden />
              </button>
              <button
                type="button"
                className="text-logic hover:text-logic/80 transition-colors p-0.5"
                onClick={() => void nativeTransportTogglePlay()}
                aria-label={isPlaying ? "Pause" : "Play"}
                title={isPlaying ? "Pause" : "Play"}
              >
                <Icon name={isPlaying ? "Pause" : "Play"} size={18} aria-hidden />
              </button>
              <button
                type="button"
                className="text-text-secondary hover:text-text-primary transition-colors p-0.5"
                title="Stop"
                aria-label="Stop"
                onClick={() => void nativeTransportStop()}
              >
                <Icon name="Square" size={16} aria-hidden />
              </button>
            </div>

            {/* Metrics */}
            <div className="flex gap-4 text-text-secondary">
              <div className="flex flex-col items-center">
                <span className="text-[9px] opacity-40 font-bold uppercase tracking-tight">BPM</span>
                <div className="flex items-center gap-1.5">
                  {editingBpm ? (
                    <input
                      type="number"
                      min="20"
                      max="999"
                      step="0.01"
                      autoFocus
                      value={bpmInput}
                      className="bg-pressed text-text-primary text-[11px] tabular-nums w-14 text-center rounded border border-generator outline-none"
                      onChange={(e) => setBpmInput(e.target.value)}
                      onBlur={() => {
                        const parsed = parseFloat(bpmInput);
                        if (!isNaN(parsed)) {
                          const clamped = Math.min(999, Math.max(20, parsed));
                          void nativeTransportSetTempo(clamped);
                        }
                        setEditingBpm(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const parsed = parseFloat(bpmInput);
                          if (!isNaN(parsed)) {
                            const clamped = Math.min(999, Math.max(20, parsed));
                            void nativeTransportSetTempo(clamped);
                          }
                          setEditingBpm(false);
                        } else if (e.key === "Escape") {
                          setEditingBpm(false);
                        }
                      }}
                    />
                  ) : (
                    <span
                      className="text-modifier font-black tabular-nums text-[11px] cursor-pointer hover:text-modifier/80 transition-colors"
                      title="Click to edit tempo"
                      onClick={() => {
                        setBpmInput(bpm.toFixed(2));
                        setEditingBpm(true);
                      }}
                    >
                      {bpm.toFixed(2)}
                    </span>
                  )}
                  <button className="text-[8px] font-black px-1 py-0.5 bg-surface rounded hover:bg-elevated transition-colors text-text-dim hover:text-text-secondary">TAP</button>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[9px] opacity-40 font-bold uppercase tracking-tight">BUFFER</span>
                <span className="text-text-primary font-black tabular-nums text-[11px]">
                  {live.buffer > 0 ? `${live.buffer}` : "—"}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[9px] opacity-40 font-bold uppercase tracking-tight">SAMPLE</span>
                <span className="text-text-primary font-black tabular-nums text-[11px]">
                  {live.timecode || "—"}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[9px] opacity-40 font-bold uppercase tracking-tight">LATENCY</span>
                <span className="text-logic font-black tabular-nums text-[11px]">
                  {live.latency > 0 ? `${live.latency.toFixed(1)}ms` : "—"}
                </span>
              </div>
            </div>

            {/* Mode toggle */}
            <button
              onClick={toggleMode}
              className="flex items-center gap-1.5 bg-pressed px-3 py-1 rounded-full shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] border border-white/5 transition-all hover:border-white/10"
            >
              <span className="text-[9px] text-generator font-black tracking-widest">EDIT</span>
              <div className="w-6 h-3 bg-generator rounded-full relative">
                <div className="absolute right-0.5 top-0.5 w-2 h-2 bg-text-primary rounded-full shadow-sm" />
              </div>
              <span className="text-[9px] text-text-secondary font-black tracking-widest">PERFORM</span>
            </button>
          </div>
        )}

        {/* ── Right: Scene + Engine status + Settings ── */}
        <div className="flex items-center gap-3">
          {isEdit ? (
            <>
              {/* Cable routing toggle */}
              <div className="flex items-center bg-pressed rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] border border-white/5 overflow-hidden">
                <button
                  type="button"
                  className={`px-2 py-0.5 text-[9px] font-black tracking-widest uppercase transition-colors ${cableRouting === "manhattan" ? "text-generator bg-surface shadow-[2px_2px_6px_rgba(0,0,0,0.4),-1px_-1px_4px_rgba(255,255,255,0.05)]" : "text-text-secondary hover:text-text-primary"}`}
                  title="Manhattan (stepped) cable routing"
                  onClick={() => setCableRouting("manhattan")}
                >
                  MAN
                </button>
                <div className="w-px h-3 bg-white/10" />
                <button
                  type="button"
                  className={`px-2 py-0.5 text-[9px] font-black tracking-widest uppercase transition-colors ${cableRouting === "bezier" ? "text-generator bg-surface shadow-[2px_2px_6px_rgba(0,0,0,0.4),-1px_-1px_4px_rgba(255,255,255,0.05)]" : "text-text-secondary hover:text-text-primary"}`}
                  title="Bezier (curved) cable routing"
                  onClick={() => setCableRouting("bezier")}
                >
                  BEZ
                </button>
              </div>

              {/* Scene selector */}
              <div className="flex items-center gap-2 bg-pressed px-2 py-0.5 rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] text-text-secondary border border-white/5">
                <Icon name="Layers" size={16} aria-hidden />
                <button
                  className="hover:text-text-primary transition-colors"
                  onClick={() =>
                    setScene((activeSceneIdx - 1 + sceneCount) % sceneCount)
                  }
                  aria-label="Previous scene"
                >
                  <Icon name="ChevronLeft" size={14} aria-hidden />
                </button>
                <span className="inline-flex items-center gap-1 tabular-nums font-bold">
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
                  aria-label="Next scene"
                >
                  <Icon name="ChevronRight" size={14} aria-hidden />
                </button>
                <div className="flex items-center gap-1 border-l border-white/10 ml-1 pl-1">
                  <button
                    type="button"
                    className="px-1.5 py-0.5 rounded bg-surface text-[10px] text-generator font-bold hover:bg-elevated"
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
                    className="px-1.5 py-0.5 rounded bg-surface text-[9px] text-modifier font-bold hover:bg-elevated disabled:opacity-40"
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
              </div>

              {/* Settings + Panic — Section 7.8 */}
              <div className="flex items-center gap-3 ml-2">
                <button
                  type="button"
                  className="text-[10px] uppercase tracking-wide text-text-secondary hover:text-text-primary transition-colors px-1"
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
                  <Icon name="Settings" size={18} aria-label="Preferences" />
                </button>
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-error/10 text-error border border-error/20 hover:bg-error/20 hover:border-error/40 transition-all shadow-[0_0_8px_rgba(239,68,68,0.2)]"
                  aria-label="MIDI panic"
                  title="PANIC - All Notes Off"
                  onClick={() => void nativeTransportPanic()}
                >
                  <Icon name="Power" size={18} aria-hidden />
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
                <Icon name="Settings" size={18} aria-label="Preferences" />
              </button>
              <button
                type="button"
                className="text-text-secondary hover:text-error transition-colors"
                aria-label="MIDI panic - all notes off"
                title="PANIC - All Notes Off"
                onClick={() => void nativeTransportPanic()}
              >
                <Icon name="Power" size={18} aria-hidden />
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
