import { useAppStore, selectCableRouting } from "../../stores/useAppStore";
import { useGraphStore, selectBreadcrumbs } from "../../stores/useGraphStore";
import { usePerformStore, selectBpm } from "../../stores/usePerformStore";
import {
  useEngineSnapshotStore,
  selectTransportRecording,
  selectTransportPlaying,
  selectSampleRate,
  selectBufferSize,
  selectDeviceLatencyMs,
} from "../../stores/useEngineSnapshotStore";
import {
  nativeTransportPanic,
  nativeTransportTogglePlay,
  nativeTransportStop,
  nativeTransportRewind,
  nativeTransportSetTempo,
  nativeTransportSetRecording,
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
import { useEffect, useRef, useState, useCallback } from "react";
import { PreferencesModal } from "./PreferencesModal";
import { AboutModal } from "./AboutModal";
// SHELVED (D3, hide-UI keep-code) — see FINISH-APP-PLAN. The Perform-mode
// toggle + Scene controls are gone (Wave-0 + Wave-1 U3): no perform path in
// the toolbar, the app is locked to Edit. usePerformStore / nativePerform*
// remain on disk (reversible backlog); they are simply not wired here.
import { EV_OPEN_PREFERENCES } from "../../events";
import { Icon } from "../neu";

// ── Depth-hue breadcrumb pills (W0-TOKENS §6) ──
// Each nesting level paints its pill from a frozen --depth-N token so the
// breadcrumb reads the same depth language as the (later, separate U2) nested
// canvas chrome. We only style the pills here — the dive/exit navigation model
// is a SEPARATE task and is intentionally not built in the toolbar.
const DEPTH_HUES = [
  "var(--depth-0)",
  "var(--depth-1)",
  "var(--depth-2)",
  "var(--depth-3)",
  "var(--depth-4)",
] as const;

// ── Toolbar component ──

function sessionDisplayName(filePath: string, dirty: boolean): string {
  if (!filePath || filePath.length === 0)
    return dirty ? "Untitled •" : "Untitled";
  const base = filePath.replace(/^.*[/\\]/, "");
  const stem = base.replace(/\.els$/i, "");
  return dirty ? `${stem} •` : stem;
}

/**
 * Open the global command palette. The palette's open-state lives in App.tsx
 * (`paletteOpen` useState) and is toggled exclusively through the window-level
 * Cmd/Ctrl+K keydown handler in `useKeyboard`. To trigger it from the toolbar
 * WITHOUT reaching across components (disjoint-file discipline — Toolbar.tsx is
 * the only file this task may touch), we re-dispatch the exact keydown the
 * global handler already listens for. `target` is the window, so the handler's
 * INPUT/TEXTAREA/SELECT guard passes; `metaKey + key:"k"` satisfies its match.
 */
function openCommandPalette(): void {
  if (typeof window === "undefined") return;
  const isMac = /Mac|iPhone|iPad/.test(
    typeof navigator !== "undefined" ? navigator.platform : "",
  );
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true,
    }),
  );
}

/**
 * Top application toolbar: the Edit-mode command centre for the Project. Holds
 * session file actions (new/open/save/as), the depth-hued breadcrumb trail, a
 * Board switcher, transport (rewind/play/stop/record), tempo with tap-tempo,
 * time signature, undo/redo, a Cmd+K command-palette affordance, cable-routing
 * style, the Preferences/About entry points, and the always-visible PANIC. Use
 * it as the persistent header; controls reflect live engine state via the 4 Hz
 * snapshot, so external triggers (Lua, MIDI, native menu) keep them in sync.
 *
 * Perform mode is shelved (D3): the toolbar has no mode toggle and renders only
 * the Edit chassis. Styling follows the locked neumorphic grammar (W0-TOKENS) —
 * raised controls extruded from the chassis, pressed wells for the breadcrumb /
 * search, depth-hue pills, and a big red PANIC.
 */
export function Toolbar() {
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmInput, setBpmInput] = useState("");
  /**
   * Record button mirrors engine.transportRecording from the engine
   * snapshot. External record triggers (Lua, MIDI, native menu) flip the
   * button automatically since the snapshot polls at 4 Hz.
   */
  const recording = useEngineSnapshotStore(selectTransportRecording);
  /**
   * Play button reads from the engine snapshot directly so external
   * play/stop triggers (Lua, MIDI, native menu) update the icon.
   */
  const isPlaying = useEngineSnapshotStore(selectTransportPlaying);
  /**
   * Time signature + engine metrics (sample rate, buffer, latency) read from
   * the engine snapshot so they reflect real transport / device state.
   */
  const timeSig = useEngineSnapshotStore((s) => s.timeSig);
  /**
   * F-04 FIX: the SAMPLE field must show the real device sample rate from the
   * engine snapshot, NOT the transport timecode (`live.timecode`) it used to
   * mistakenly render. `sampleRate` is in Hz; we format to "44.1k" etc.
   */
  const sampleRate = useEngineSnapshotStore(selectSampleRate);
  const bufferSize = useEngineSnapshotStore(selectBufferSize);
  const latencyMs = useEngineSnapshotStore(selectDeviceLatencyMs);
  /**
   * F-104: Tap tempo. Rolling buffer of click timestamps (ms). On each tap
   * we keep the last N=4 entries; if we have ≥ 2 we compute the median
   * inter-tap interval and derive BPM = 60000 / interval. After 2s of
   * inactivity the buffer is reset.
   */
  const tapTimesRef = useRef<number[]>([]);
  const tapResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = useCallback(() => {
    const now = Date.now();
    const times = tapTimesRef.current;
    times.push(now);
    if (times.length > 4) times.shift();

    if (tapResetTimerRef.current !== null) {
      clearTimeout(tapResetTimerRef.current);
    }
    tapResetTimerRef.current = setTimeout(() => {
      tapTimesRef.current = [];
      tapResetTimerRef.current = null;
    }, 2000);

    if (times.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < times.length; i++) {
        intervals.push(times[i] - times[i - 1]);
      }
      // Median (robust to a single off-tempo tap).
      const sorted = [...intervals].sort((a, b) => a - b);
      const median =
        sorted.length % 2 === 1
          ? sorted[(sorted.length - 1) / 2]
          : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      if (median > 0) {
        const bpm = Math.min(999, Math.max(20, 60000 / median));
        void nativeTransportSetTempo(bpm);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (tapResetTimerRef.current !== null) {
        clearTimeout(tapResetTimerRef.current);
      }
    };
  }, []);

  const handleToggleRecord = useCallback(() => {
    void nativeTransportSetRecording(!recording);
  }, [recording]);

  useEffect(() => {
    const handleOpenPreferences = () => setPrefsOpen(true);
    window.addEventListener(EV_OPEN_PREFERENCES, handleOpenPreferences);
    return () => {
      window.removeEventListener(EV_OPEN_PREFERENCES, handleOpenPreferences);
    };
  }, []);

  const breadcrumbs = useGraphStore(selectBreadcrumbs);
  const bpm = usePerformStore(selectBpm);
  const filePath = useSessionStore((s) => s.filePath);
  const dirty = useSessionStore((s) => s.dirty);
  const sessionGraphs = useSessionStore((s) => s.graphs);

  const cableRouting = useAppStore(selectCableRouting);
  const setCableRouting = useAppStore((s) => s.setCableRouting);

  // F-04: format Hz → compact "44.1k" / "48k" / "96k" label for the SAMPLE
  // field. Falls back to an em-dash when the device hasn't reported a rate.
  const sampleRateLabel =
    sampleRate > 0
      ? `${(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1)}k`
      : "—";

  return (
    <>
      <div className="w-full h-full flex items-center gap-2 tabular text-[12px] tracking-wider select-none">
        {/* ── Left: Wordmark + file actions ── */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-black text-lg tracking-tighter text-text-primary leading-none">
            ELEMENT
          </span>

          {/* File actions — pressed segmented well (neu-pressed-shallow) */}
          <div className="flex items-center rounded-[5px] overflow-hidden neu-pressed-shallow bg-pressed">
            {(
              [
                { label: "New", fn: nativeSessionNew, title: "New Project" },
                { label: "Open", fn: nativeSessionOpen, title: "Open Project…" },
                { label: "Save", fn: nativeSessionSave, title: "Save Project" },
                { label: "As…", fn: nativeSessionSaveAs, title: "Save Project As…" },
              ] as const
            ).map(({ label, fn, title }) => (
              <button
                key={label}
                type="button"
                className="px-2 h-7 text-[10px] font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary hover:bg-elevated transition-colors t-precision"
                title={title}
                onClick={() => void fn()}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Active project file name */}
          <span
            className="text-[11px] text-accent-orange max-w-[150px] truncate"
            title={filePath || "No file on disk"}
          >
            {sessionDisplayName(filePath, dirty)}
          </span>

          {/* Board switcher (only when the Project has > 1 Board) */}
          {sessionGraphs.length > 1 ? (
            <label className="flex items-center gap-1.5 text-[10px]">
              <span className="uppercase tracking-wider text-text-dim">Board</span>
              <select
                className="bg-pressed text-text-primary rounded-[4px] px-1.5 h-7 max-w-[130px] neu-pressed-shallow border-none outline-none focus:ring-1 focus:ring-accent-blue/60"
                value={String(sessionGraphs.find((g) => g.active)?.index ?? 0)}
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
        </div>

        {/* ── Breadcrumb — depth-hued pills in a pressed well (mockup grammar) ──
            The single FLEXIBLE element in the row (flex-1 min-w-0): it absorbs
            slack and is the only thing that shrinks when the window is tight, so
            the controls on either side never get pushed off-screen. Under
            pressure the intermediate crumbs ellipsize (truncate) while the
            active/last pill stays whole (shrink-0) — the deepest level is the
            one that matters, so it is the last to go. With slack, the whole
            trail shows. We only style the pills here; the dive/exit nav model
            (U2) is a separate task and is intentionally not built in the bar. */}
        <div className="flex items-center gap-1 px-2 h-7 rounded-[5px] flex-1 min-w-0 neu-pressed-shallow bg-pressed overflow-hidden">
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            const hue = DEPTH_HUES[Math.min(i, DEPTH_HUES.length - 1)];
            return (
              <span
                key={`${i}-${crumb}`}
                className={`flex items-center gap-1 ${isLast ? "shrink-0" : "min-w-0"}`}
              >
                {i > 0 && (
                  <Icon
                    name="ChevronRight"
                    size={11}
                    className="text-text-secondary/60 shrink-0"
                    aria-hidden
                  />
                )}
                <span
                  className={`flex items-center px-2 h-5 rounded-[3px] text-[10.5px] whitespace-nowrap truncate t-precision ${isLast ? "" : "min-w-0"}`}
                  style={{
                    backgroundColor: isLast ? `hsl(${hue} / 0.18)` : "transparent",
                    color: isLast ? `hsl(${hue})` : "var(--color-text-secondary)",
                    fontWeight: isLast ? 700 : 500,
                    boxShadow: isLast ? `inset 0 0 0 1px hsl(${hue} / 0.5)` : "none",
                    letterSpacing: "0.02em",
                  }}
                >
                  {crumb}
                </span>
              </span>
            );
          })}
        </div>

        {/* ── Center cluster: undo/redo + transport + metrics ── */}
        {/* Undo/Redo — raised pair extruded from the chassis */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            className="w-7 h-7 flex items-center justify-center rounded-[5px] neu-raised bg-surface text-text-secondary hover:text-text-primary t-precision"
            title="Undo (⌘Z)"
            aria-label="Undo"
            onClick={() => void nativeUndo()}
          >
            <Icon name="Undo2" size={13} aria-hidden />
          </button>
          <button
            type="button"
            className="w-7 h-7 flex items-center justify-center rounded-[5px] neu-raised bg-surface text-text-secondary hover:text-text-primary t-precision"
            title="Redo (⌘⇧Z)"
            aria-label="Redo"
            onClick={() => void nativeRedo()}
          >
            <Icon name="Redo2" size={13} aria-hidden />
          </button>
        </div>

        {/* Transport — pressed well grouping the play cluster */}
        <div className="flex items-center gap-0.5 px-1 h-7 rounded-[5px] neu-pressed-shallow bg-pressed shrink-0">
          <button
            type="button"
            className="w-6 h-6 flex items-center justify-center rounded-[4px] text-text-secondary hover:text-text-primary hover:bg-elevated transition-colors t-precision"
            title="Rewind to start"
            aria-label="Rewind to start"
            onClick={() => void nativeTransportRewind()}
          >
            <Icon name="SkipBack" size={15} aria-hidden />
          </button>
          <button
            type="button"
            className="w-6 h-6 flex items-center justify-center rounded-[4px] text-accent-teal hover:bg-elevated transition-colors t-precision"
            onClick={() => void nativeTransportTogglePlay()}
            aria-label={isPlaying ? "Pause" : "Play"}
            title={isPlaying ? "Pause" : "Play"}
          >
            <Icon name={isPlaying ? "Pause" : "Play"} size={17} aria-hidden />
          </button>
          <button
            type="button"
            className="w-6 h-6 flex items-center justify-center rounded-[4px] text-text-secondary hover:text-text-primary hover:bg-elevated transition-colors t-precision"
            title="Stop"
            aria-label="Stop"
            onClick={() => void nativeTransportStop()}
          >
            <Icon name="Square" size={15} aria-hidden />
          </button>
          <button
            type="button"
            className={`w-6 h-6 flex items-center justify-center rounded-[4px] transition-colors t-precision ${recording ? "text-error animate-pulse" : "text-text-secondary hover:text-error hover:bg-elevated"}`}
            title={recording ? "Stop recording" : "Record"}
            aria-label={recording ? "Stop recording" : "Record"}
            aria-pressed={recording}
            onClick={handleToggleRecord}
          >
            <Icon name="Circle" size={15} aria-hidden />
          </button>
        </div>

        {/* Metrics — BPM (editable + tap), buffer, sample rate (F-04), latency */}
        <div className="flex items-center gap-3 shrink-0 text-text-secondary">
          <div className="flex flex-col items-center leading-none">
            <span className="text-[9px] opacity-40 font-bold uppercase tracking-tight">
              BPM
            </span>
            <div className="flex items-center gap-1">
              {editingBpm ? (
                <input
                  type="number"
                  min="20"
                  max="999"
                  step="0.01"
                  autoFocus
                  value={bpmInput}
                  className="bg-pressed text-text-primary text-[11px] tabular-nums w-14 text-center rounded-[3px] neu-pressed-shallow border-none outline-none focus:ring-1 focus:ring-accent-blue"
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
                  className="text-accent-orange font-black tabular-nums text-[11px] cursor-pointer hover:text-accent-orange/80 transition-colors"
                  title="Click to edit tempo"
                  onClick={() => {
                    setBpmInput(bpm.toFixed(2));
                    setEditingBpm(true);
                  }}
                >
                  {bpm.toFixed(2)}
                </span>
              )}
              <button
                type="button"
                className="text-[8px] font-black px-1 py-0.5 rounded-[3px] neu-raised bg-surface text-text-dim hover:text-text-secondary t-precision"
                title="Tap tempo (rolling 4-tap median)"
                aria-label="Tap tempo"
                onClick={handleTap}
              >
                TAP
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center leading-none">
            <span className="text-[9px] opacity-40 font-bold uppercase tracking-tight">
              SIG
            </span>
            <span className="text-text-primary font-black tabular-nums text-[11px]">
              {`${timeSig[0]}/${timeSig[1]}`}
            </span>
          </div>

          <div className="flex flex-col items-center leading-none">
            <span className="text-[9px] opacity-40 font-bold uppercase tracking-tight">
              BUFFER
            </span>
            <span className="text-text-primary font-black tabular-nums text-[11px]">
              {bufferSize > 0 ? `${bufferSize}` : "—"}
            </span>
          </div>

          <div className="flex flex-col items-center leading-none">
            <span className="text-[9px] opacity-40 font-bold uppercase tracking-tight">
              SAMPLE
            </span>
            {/* F-04: real device sample rate (Hz → "44.1k"), not timecode. */}
            <span className="text-text-primary font-black tabular-nums text-[11px]">
              {sampleRateLabel}
            </span>
          </div>

          <div className="flex flex-col items-center leading-none">
            <span className="text-[9px] opacity-40 font-bold uppercase tracking-tight">
              LATENCY
            </span>
            <span className="text-accent-teal font-black tabular-nums text-[11px]">
              {latencyMs > 0 ? `${latencyMs.toFixed(1)}ms` : "—"}
            </span>
          </div>
        </div>

        {/* ── Right cluster: Cmd+K · cable routing · About/Prefs · PANIC ── */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Cmd+K command-palette affordance (re-dispatches the global hotkey) */}
          <button
            type="button"
            onClick={openCommandPalette}
            className="flex items-center gap-2 h-7 px-2 rounded-[5px] neu-pressed-shallow bg-pressed text-text-secondary hover:text-text-primary hover:bg-elevated t-precision min-w-[150px]"
            title="Open command palette (⌘K)"
            aria-label="Open command palette"
          >
            <Icon name="Search" size={12} className="text-text-secondary" aria-hidden />
            <span className="text-[11px] flex-1 text-left normal-case tracking-normal">
              Search…
            </span>
            <kbd className="text-[9px] font-mono tabular-nums px-1 py-0.5 rounded bg-elevated text-text-secondary">
              ⌘K
            </kbd>
          </button>

          {/* Cable routing toggle — pressed segmented well */}
          <div className="flex items-center rounded-[5px] overflow-hidden neu-pressed-shallow bg-pressed">
            <button
              type="button"
              className={`px-2 h-7 text-[9px] font-black tracking-widest uppercase transition-colors t-precision ${cableRouting === "manhattan" ? "text-accent-blue bg-surface" : "text-text-secondary hover:text-text-primary"}`}
              title="Manhattan (stepped) cable routing"
              onClick={() => setCableRouting("manhattan")}
            >
              MAN
            </button>
            <div className="w-px h-3 bg-white/10" />
            <button
              type="button"
              className={`px-2 h-7 text-[9px] font-black tracking-widest uppercase transition-colors t-precision ${cableRouting === "bezier" ? "text-accent-blue bg-surface" : "text-text-secondary hover:text-text-primary"}`}
              title="Bezier (curved) cable routing"
              onClick={() => setCableRouting("bezier")}
            >
              BEZ
            </button>
          </div>

          {/* About + Preferences — raised buttons. NOTE: the mockup uses an
              Info glyph for About, but `Info` is not in the Icon allowlist
              (Icon.tsx — out of scope for this task), so About stays a compact
              text button to avoid the HelpCircle fallback. Flag if an Info
              glyph is wanted: it needs a central Icon.tsx allowlist add. */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className="h-7 px-2 flex items-center justify-center rounded-[5px] neu-raised bg-surface text-[10px] uppercase tracking-wider text-text-secondary hover:text-text-primary t-precision"
              title="About"
              onClick={() => setAboutOpen(true)}
            >
              About
            </button>
            <button
              type="button"
              className="w-7 h-7 flex items-center justify-center rounded-[5px] neu-raised bg-surface text-text-secondary hover:text-text-primary t-precision"
              title="Preferences"
              aria-label="Preferences"
              onClick={() => setPrefsOpen(true)}
            >
              <Icon name="Settings" size={13} aria-hidden />
            </button>
          </div>

          {/* PANIC — big red, always visible (status-clip) */}
          <button
            type="button"
            className="flex items-center h-7 px-3 rounded-[5px] neu-raised t-precision font-bold text-[11px] tracking-wider"
            style={{ backgroundColor: "hsl(var(--status-clip))", color: "#FFFFFF" }}
            aria-label="MIDI panic — all notes off"
            title="PANIC — send all-notes-off"
            onClick={() => void nativeTransportPanic()}
          >
            PANIC
          </button>
        </div>
      </div>
      {prefsOpen ? (
        <PreferencesModal onClose={() => setPrefsOpen(false)} />
      ) : null}
      {aboutOpen ? <AboutModal onClose={() => setAboutOpen(false)} /> : null}
    </>
  );
}
