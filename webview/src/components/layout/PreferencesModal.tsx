import { useState, useEffect, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { useAppStore } from "../../stores/useAppStore";
import type { CableRouting } from "../../stores/useAppStore";
import {
  nativeAudioApplySetup,
  nativeMappingRemoveMap,
  nativeMappingSetLearning,
  nativeOpenGraphMixer,
  nativeOpenLuaConsole,
  nativeOscApplyHost,
  nativeWebDismissOverlay,
} from "../../bridge/nativePrefs";
import { nativeGraphSetCanvasOptions } from "../../bridge/nativeGraph";
import { usePluginScanStore } from "../../stores/usePluginScanStore";
import type { ScanPluginFormat } from "../../bridge/nativePluginScan";
import { Icon } from "../neu/Icon";

// ── Tab types ────────────────────────────────────────────────────────────────

type TabId = "audio" | "midi" | "appearance" | "shortcuts";

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: "audio",      label: "Audio",      icon: "AudioWaveform" },
  { id: "midi",       label: "MIDI",        icon: "Music"         },
  { id: "appearance", label: "Appearance",  icon: "SlidersHorizontal" },
  { id: "shortcuts",  label: "Shortcuts",   icon: "Command"       },
];

// ── Keyboard shortcut definitions (read from useKeyboard source of truth) ────
// This is a READ-ONLY representation of the live key-command registry.
// A full editable keymap editor is tracked as U9 (follow-up task).

interface ShortcutEntry {
  keys: string[];
  description: string;
  section: string;
}

const SHORTCUTS: ShortcutEntry[] = [
  // Navigation
  { section: "Navigation", keys: ["Cmd", "K"],       description: "Command palette" },
  { section: "Navigation", keys: ["Cmd", "1"],        description: "Toggle left panel" },
  { section: "Navigation", keys: ["Cmd", "2"],        description: "Toggle right panel" },
  { section: "Navigation", keys: ["Cmd", "3"],        description: "Toggle bottom panel" },
  { section: "Navigation", keys: ["Cmd", "F"],        description: "Focus block search" },
  { section: "Navigation", keys: ["Escape"],          description: "Deselect / back out one level" },
  { section: "Navigation", keys: ["Tab"],             description: "Jump to next block in signal chain" },
  { section: "Navigation", keys: ["Shift", "Tab"],    description: "Jump to previous block" },
  // View
  { section: "View", keys: ["Cmd", "0"],              description: "Fit graph to view" },
  { section: "View", keys: ["Cmd", "="],              description: "Zoom in" },
  { section: "View", keys: ["Cmd", "-"],              description: "Zoom out" },
  { section: "View", keys: ["Shift", "M"],            description: "Toggle minimap" },
  // Blocks
  { section: "Blocks", keys: ["Cmd", "D"],            description: "Duplicate selected block" },
  { section: "Blocks", keys: ["Cmd", "R"],            description: "Rename selected block" },
  { section: "Blocks", keys: ["Cmd", "C"],            description: "Copy selected block" },
  { section: "Blocks", keys: ["Cmd", "V"],            description: "Paste" },
  { section: "Blocks", keys: ["Delete"],              description: "Delete selected block / cable" },
  { section: "Blocks", keys: ["Shift", "C"],          description: "Add comment box at center" },
  // Cables
  { section: "Cables", keys: ["W"],                   description: "Toggle wireless on selected cable" },
  // Alignment (multi-select)
  { section: "Alignment", keys: ["Cmd", "Shift", "L"], description: "Align left" },
  { section: "Alignment", keys: ["Cmd", "Shift", "R"], description: "Align right" },
  { section: "Alignment", keys: ["Cmd", "Shift", "T"], description: "Align top" },
  { section: "Alignment", keys: ["Cmd", "Shift", "B"], description: "Align bottom" },
  { section: "Alignment", keys: ["Cmd", "Shift", "H"], description: "Distribute horizontal" },
  { section: "Alignment", keys: ["Cmd", "Shift", "V"], description: "Distribute vertical" },
  // Bookmarks
  { section: "Bookmarks", keys: ["Ctrl", "0–9"],      description: "Save spatial bookmark" },
  { section: "Bookmarks", keys: ["Shift", "0–9"],     description: "Recall spatial bookmark" },
  // Session
  { section: "Session", keys: ["Cmd", "S"],           description: "Save project" },
  { section: "Session", keys: ["Cmd", "Shift", "S"],  description: "Save project as…" },
  { section: "Session", keys: ["Cmd", "Z"],           description: "Undo" },
  { section: "Session", keys: ["Cmd", "Shift", "Z"],  description: "Redo" },
  // UI
  { section: "UI", keys: ["Shift", "K"],              description: "Toggle virtual keyboard" },
];

// ── Sub-components ───────────────────────────────────────────────────────────

/** Neumorphic select — pressed-inset styled. */
function NeuSelect({
  label,
  value,
  onChange,
  children,
  className,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block${className ? ` ${className}` : ""}`}>
      <span className="block text-[9px] font-bold uppercase tracking-widest text-text-secondary mb-1">
        {label}
      </span>
      <select
        className="w-full bg-pressed neu-inset rounded px-2 py-1.5 text-[11px] text-text-primary border border-white/5 cursor-pointer focus:outline-none focus:border-accent-blue/40 transition-colors"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

/** Section heading with optional divider. */
function SectionHeading({ children, divider = true }: { children: React.ReactNode; divider?: boolean }) {
  return (
    <div className={divider ? "pt-4 border-t border-white/8 first:border-t-0 first:pt-0" : ""}>
      <h3 className="text-[9px] font-bold uppercase tracking-widest text-text-dim mb-3">
        {children}
      </h3>
    </div>
  );
}

/** Honest-disabled control with tooltip naming the missing bridge. */
function DisabledBadge({ bridge }: { bridge: string }) {
  return (
    <span
      className="text-[8px] font-bold uppercase tracking-wider text-text-dim bg-pressed neu-inset rounded px-1.5 py-0.5 cursor-help"
      title={`Not wired: ${bridge} bridge not yet exposed (Pillar-2 backlog)`}
    >
      Pending bridge
    </span>
  );
}

/** Apply button — neumorphic raised, full width. */
function ApplyButton({
  onClick,
  label,
  active,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`w-full py-2 rounded text-[11px] font-bold uppercase tracking-wide transition-colors cursor-pointer ${
        active
          ? "bg-accent-orange text-canvas"
          : "bg-elevated neu-raised text-text-primary hover:bg-surface-elevated"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** Inline toggle row — checkbox with label. */
function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
  disabledBridge,
}: {
  label: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  disabledBridge?: string;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-2 group ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      title={disabled && disabledBridge ? `Not wired: ${disabledBridge} (Pillar-2 backlog)` : undefined}
    >
      <span className="text-[11px] text-text-primary">{label}</span>
      {disabled && disabledBridge ? (
        <DisabledBadge bridge={disabledBridge} />
      ) : (
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange?.(!checked)}
          className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent-blue/40 disabled:cursor-not-allowed ${
            checked ? "bg-accent-blue" : "bg-pressed neu-inset"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-text-primary shadow-[0_1px_3px_rgba(0,0,0,0.5)] transition-transform ${
              checked ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      )}
    </label>
  );
}

/**
 * Plugin scan section (Audio tab) — REAL, wired to usePluginScanStore.
 * Scan/Rescan trigger the out-of-process PluginManager scanner; format toggles
 * gate which formats scan; per-format scan paths are editable (type an absolute
 * path — the host validates it exists; the webview has no native folder picker).
 * Scan progress is honest-indeterminate (spinner + current plugin, NO fake %).
 */
const SCAN_FORMATS: ScanPluginFormat[] = ["VST3", "AU", "CLAP", "LV2"];

function PluginScanSection() {
  const scanning = usePluginScanStore((s) => s.scanning);
  const currentPlugin = usePluginScanStore((s) => s.currentPlugin);
  const pluginCount = usePluginScanStore((s) => s.pluginCount);
  const paths = usePluginScanStore(useShallow((s) => s.paths));
  const enabled = usePluginScanStore(useShallow((s) => s.enabled));
  const supportedFormats = usePluginScanStore(useShallow((s) => s.formats));
  const pathsLoaded = usePluginScanStore((s) => s.pathsLoaded);
  const refreshPaths = usePluginScanStore((s) => s.refreshPaths);
  const refreshStatus = usePluginScanStore((s) => s.refreshStatus);
  const scan = usePluginScanStore((s) => s.scan);
  const rescan = usePluginScanStore((s) => s.rescan);
  const addPath = usePluginScanStore((s) => s.addPath);
  const removePath = usePluginScanStore((s) => s.removePath);
  const setFormatEnabled = usePluginScanStore((s) => s.setFormatEnabled);

  const [addTarget, setAddTarget] = useState<ScanPluginFormat | null>(null);
  const [addValue, setAddValue] = useState("");
  const [addError, setAddError] = useState(false);

  useEffect(() => {
    if (!pathsLoaded) void refreshPaths();
    void refreshStatus();
  }, [pathsLoaded, refreshPaths, refreshStatus]);

  const formats = supportedFormats.length > 0 ? supportedFormats : SCAN_FORMATS;

  const submitAddPath = async () => {
    if (addTarget == null) return;
    const ok = await addPath(addTarget, addValue.trim());
    if (ok) {
      setAddValue("");
      setAddTarget(null);
      setAddError(false);
    } else {
      setAddError(true);
    }
  };

  return (
    <div>
      <SectionHeading>Plugin scan</SectionHeading>
      <div className="space-y-3">
        {/* Scan / Rescan */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={scanning}
            onClick={() => void scan()}
            className="flex-1 py-2 rounded text-[11px] font-bold uppercase tracking-wide bg-elevated neu-raised text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            title="Scan all enabled plugin formats (elementScanPlugins)"
          >
            Scan
          </button>
          <button
            type="button"
            disabled={scanning}
            onClick={() => void rescan()}
            className="flex-1 py-2 rounded text-[11px] font-bold uppercase tracking-wide bg-pressed neu-inset text-text-secondary hover:text-text-primary transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            title="Rescan all enabled plugin formats (elementRescanPlugins)"
          >
            Rescan
          </button>
        </div>

        {/* Honest indeterminate scan status */}
        {scanning ? (
          <div className="flex items-center gap-2 text-[10px] text-accent-blue">
            <Icon name="RefreshCw" size={12} aria-hidden className="animate-spin" />
            <span className="truncate" title={currentPlugin}>
              Scanning{currentPlugin ? `: ${currentPlugin}` : "…"}
            </span>
          </div>
        ) : (
          <p className="text-[9px] text-text-dim">
            {pluginCount > 0
              ? `${pluginCount} plugins known. Disabled formats are skipped.`
              : "No plugins scanned yet."}
          </p>
        )}

        {/* Format enable toggles */}
        <div>
          <span className="block text-[9px] font-bold uppercase tracking-widest text-text-secondary mb-2">
            Formats
          </span>
          <div className="space-y-2">
            {formats.map((f) => (
              <ToggleRow
                key={f}
                label={f}
                checked={enabled[f] ?? true}
                disabled={scanning}
                onChange={(v) => void setFormatEnabled(f, v)}
              />
            ))}
          </div>
        </div>

        {/* Per-format scan paths */}
        <div className="space-y-3">
          {formats.map((f) => {
            const dirs = paths[f] ?? [];
            return (
              <div key={f}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-text-secondary">
                    {f} search paths
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAddTarget(addTarget === f ? null : f);
                      setAddValue("");
                      setAddError(false);
                    }}
                    className="text-[9px] font-bold uppercase tracking-wider text-accent-blue hover:text-accent-teal transition-colors flex items-center gap-0.5 cursor-pointer"
                    title={`Add a scan directory for ${f} (elementAddPluginPath)`}
                  >
                    <Icon name="Plus" size={10} aria-hidden />
                    Add
                  </button>
                </div>

                {dirs.length === 0 ? (
                  <div className="text-[10px] text-text-dim bg-pressed rounded px-2 py-1">
                    Default locations.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {dirs.map((dir) => (
                      <div
                        key={dir}
                        className="group flex items-center gap-2 text-[10px] text-text-secondary bg-pressed rounded px-2 py-1"
                        title={dir}
                      >
                        <span className="truncate flex-1">{dir}</span>
                        <button
                          type="button"
                          onClick={() => void removePath(f, dir)}
                          className="shrink-0 text-text-dim hover:text-error transition-colors cursor-pointer"
                          aria-label={`Remove ${dir}`}
                          title="Remove this scan path (elementRemovePluginPath)"
                        >
                          <Icon name="X" size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {addTarget === f ? (
                  <div className="flex gap-1 mt-1">
                    <input
                      type="text"
                      autoFocus
                      value={addValue}
                      onChange={(e) => {
                        setAddValue(e.target.value);
                        setAddError(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submitAddPath();
                        if (e.key === "Escape") setAddTarget(null);
                      }}
                      placeholder="/absolute/path/to/folder"
                      className={`flex-1 bg-pressed neu-inset rounded px-2 py-1 text-[10px] text-text-primary border focus:outline-none transition-colors ${
                        addError
                          ? "border-error/60"
                          : "border-white/5 focus:border-accent-blue/40"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => void submitAddPath()}
                      className="px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider bg-elevated neu-raised text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                ) : null}
                {addTarget === f && addError ? (
                  <div className="text-[9px] text-error mt-0.5">
                    Not a directory on this system.
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Tab panels ───────────────────────────────────────────────────────────────

function AudioTab() {
  const audio = useHostExtrasStore((s) => s.audioSetup);
  const osc   = useHostExtrasStore((s) => s.oscHost);
  const canvas = useHostExtrasStore((s) => s.canvas);

  const [outDev,   setOutDev]   = useState("");
  const [inDev,    setInDev]    = useState("");
  const [driver,   setDriver]   = useState("");
  const [sr,       setSr]       = useState(0);
  const [buf,      setBuf]      = useState(0);
  const [oscEn,    setOscEn]    = useState(false);
  const [oscPort,  setOscPort]  = useState(9001);
  const [snapGrid, setSnapGrid] = useState(false);
  const [gridSize, setGridSize] = useState(8);

  useEffect(() => {
    if (audio) {
      setOutDev(audio.outputDeviceName);
      setInDev(audio.inputDeviceName);
      setDriver(audio.audioDeviceType);
      setSr(audio.sampleRate);
      setBuf(audio.bufferSize);
    }
  }, [audio]);

  useEffect(() => {
    if (osc) { setOscEn(osc.enabled); setOscPort(osc.port); }
  }, [osc]);

  useEffect(() => {
    setSnapGrid(canvas.snapToGrid);
    setGridSize(canvas.gridSize);
  }, [canvas.snapToGrid, canvas.gridSize]);

  return (
    <div className="space-y-5">
      {/* Audio device */}
      <div>
        <SectionHeading divider={false}>Audio device</SectionHeading>
        <div className="space-y-2.5">
          <NeuSelect label="Driver type" value={driver} onChange={setDriver}>
            {(audio?.deviceTypes?.length ? audio.deviceTypes : [driver || "Default"]).map((d) => (
              <option key={d || "default"} value={d}>{d || "Default"}</option>
            ))}
          </NeuSelect>
          <NeuSelect label="Output" value={outDev} onChange={setOutDev}>
            {(audio?.outputDevices ?? [outDev]).map((d) => (
              <option key={d} value={d}>{d || "—"}</option>
            ))}
          </NeuSelect>
          <NeuSelect label="Input" value={inDev} onChange={setInDev}>
            {(audio?.inputDevices ?? [inDev]).map((d) => (
              <option key={d} value={d}>{d || "—"}</option>
            ))}
          </NeuSelect>
          <div className="grid grid-cols-2 gap-2">
            <NeuSelect label="Sample rate" value={sr} onChange={(v) => setSr(Number(v))}>
              {(audio?.sampleRates ?? [sr]).map((r) => (
                <option key={r} value={r}>{r} Hz</option>
              ))}
            </NeuSelect>
            <NeuSelect label="Buffer" value={buf} onChange={(v) => setBuf(Number(v))}>
              {(audio?.bufferSizes ?? [buf]).map((b) => (
                <option key={b} value={b}>{b} samples</option>
              ))}
            </NeuSelect>
          </div>
          <ApplyButton
            label="Apply audio"
            onClick={() =>
              void nativeAudioApplySetup({
                outputDeviceName: outDev,
                inputDeviceName: inDev,
                audioDeviceType: driver,
                sampleRate: sr,
                bufferSize: buf,
              })
            }
          />
        </div>
      </div>

      {/* Plugin scan — REAL (Pillar-2 bridge) */}
      <PluginScanSection />

      {/* OSC host */}
      <div>
        <SectionHeading>OSC host</SectionHeading>
        <div className="space-y-2.5">
          <ToggleRow label="Enable OSC" checked={oscEn} onChange={setOscEn} />
          <label className="block">
            <span className="block text-[9px] font-bold uppercase tracking-widest text-text-secondary mb-1">
              Port
            </span>
            <input
              type="number"
              className="w-full bg-pressed neu-inset rounded px-2 py-1.5 text-[11px] text-text-primary border border-white/5 focus:outline-none focus:border-accent-blue/40 transition-colors"
              value={oscPort}
              onChange={(e) => setOscPort(Number(e.target.value))}
            />
          </label>
          <ApplyButton
            label="Apply OSC"
            onClick={() => void nativeOscApplyHost({ enabled: oscEn, port: oscPort })}
          />
        </div>
      </div>

      {/* Board canvas */}
      <div>
        <SectionHeading>Board canvas</SectionHeading>
        <div className="space-y-2.5">
          <ToggleRow label="Snap to grid" checked={snapGrid} onChange={setSnapGrid} />
          <label className="block">
            <span className="block text-[9px] font-bold uppercase tracking-widest text-text-secondary mb-1">
              Grid size (px)
            </span>
            <input
              type="number"
              min={4}
              max={128}
              className="w-full bg-pressed neu-inset rounded px-2 py-1.5 text-[11px] text-text-primary border border-white/5 focus:outline-none focus:border-accent-blue/40 transition-colors"
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
            />
          </label>
          <ApplyButton
            label="Apply canvas"
            onClick={() => void nativeGraphSetCanvasOptions(snapGrid, gridSize)}
          />
        </div>
      </div>

      {/* Developer tools */}
      <div>
        <SectionHeading>Developer tools</SectionHeading>
        <div className="space-y-2">
          <button
            type="button"
            className="w-full py-1.5 rounded bg-pressed neu-inset text-text-primary text-[11px] uppercase tracking-wide hover:text-text-primary transition-colors cursor-pointer"
            onClick={() => void nativeOpenLuaConsole()}
          >
            Lua console
          </button>
          <button
            type="button"
            className="w-full py-1.5 rounded bg-pressed neu-inset text-text-primary text-[11px] uppercase tracking-wide hover:text-text-primary transition-colors cursor-pointer"
            onClick={() => void nativeOpenGraphMixer()}
          >
            Graph mixer
          </button>
          <button
            type="button"
            className="w-full py-1.5 rounded bg-pressed neu-inset text-text-secondary text-[11px] uppercase tracking-wide hover:text-text-primary transition-colors cursor-pointer"
            onClick={() => void nativeWebDismissOverlay()}
          >
            Dismiss overlay
          </button>
        </div>
      </div>
    </div>
  );
}

function MidiTab() {
  const midiMapping = useHostExtrasStore((s) => s.midiMapping);
  const learning = midiMapping.learning;

  return (
    <div className="space-y-5">
      {/* MIDI mapping */}
      <div>
        <SectionHeading divider={false}>MIDI mapping</SectionHeading>
        <div className="space-y-2.5">
          <ApplyButton
            label={learning ? "Stop MIDI learn" : "MIDI learn"}
            active={learning}
            onClick={() => void nativeMappingSetLearning(!learning)}
          />
          {learning && (
            <p className="text-[10px] text-accent-orange leading-relaxed">
              Armed — wiggle a hardware control to bind it to the last touched Block parameter.
            </p>
          )}

          {midiMapping.maps.length > 0 ? (
            <div className="rounded border border-white/8 bg-pressed neu-inset overflow-hidden">
              <table className="w-full text-left border-collapse text-[10px]">
                <thead className="text-text-dim text-[9px] uppercase tracking-wider sticky top-0 bg-pressed">
                  <tr>
                    <th className="p-1.5 font-bold">Device</th>
                    <th className="p-1.5 font-bold">Control</th>
                    <th className="p-1.5 font-bold">Block</th>
                    <th className="p-1.5 font-bold w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {midiMapping.maps.map((row) => (
                    <tr
                      key={`${row.index}-${row.nodeId}-${row.parameterIndex}`}
                      className={
                        row.valid
                          ? "border-t border-white/5"
                          : "border-t border-accent-orange/30 opacity-60"
                      }
                    >
                      <td className="p-1.5 truncate max-w-[90px]">{row.deviceName || "—"}</td>
                      <td className="p-1.5 truncate max-w-[70px]">{row.controlName || "—"}</td>
                      <td className="p-1.5 truncate max-w-[90px]">
                        {row.nodeName || row.nodeId || "—"}
                        <span className="block text-text-dim tabular">p{row.parameterIndex}</span>
                      </td>
                      <td className="p-1.5">
                        <button
                          type="button"
                          className="text-error hover:text-text-primary transition-colors cursor-pointer"
                          aria-label={`Remove map for ${row.controlName}`}
                          onClick={() => void nativeMappingRemoveMap(row.index)}
                        >
                          <Icon name="X" size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[10px] text-text-dim">
              No controller maps in the session snapshot yet. Enable MIDI learn and wiggle a control.
            </p>
          )}
        </div>
      </div>

      {/* MIDI devices — honest-disabled (no bridge yet) */}
      <div>
        <SectionHeading>MIDI devices</SectionHeading>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-primary">MIDI inputs</span>
            <DisabledBadge bridge="elementGetMidiInputs" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-primary">MIDI outputs</span>
            <DisabledBadge bridge="elementGetMidiOutputs" />
          </div>
          <p className="text-[9px] text-text-dim leading-relaxed">
            Per-device enable/disable will be available once elementGetMidiInputs /
            elementGetMidiOutputs are exposed in nativePrefs (Pillar-2 backlog).
          </p>
        </div>
      </div>
    </div>
  );
}

function AppearanceTab() {
  const cableRouting = useAppStore((s) => s.cableRouting);
  const toggleCableRouting = useAppStore((s) => s.toggleCableRouting);

  return (
    <div className="space-y-5">
      {/* Cable routing — REAL (wired to useAppStore + persisted) */}
      <div>
        <SectionHeading divider={false}>Board</SectionHeading>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="block text-[11px] text-text-primary">Cable routing</span>
              <span className="block text-[9px] text-text-dim mt-0.5">
                Manhattan = right-angle; Bezier = smooth curves
              </span>
            </div>
            <div
              className="flex rounded overflow-hidden border border-white/8 text-[9px] font-bold uppercase tracking-wider"
              role="group"
              aria-label="Cable routing style"
            >
              {(["manhattan", "bezier"] as CableRouting[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => { if (cableRouting !== opt) toggleCableRouting(); }}
                  className={`px-2.5 py-1 transition-colors cursor-pointer focus:outline-none ${
                    cableRouting === opt
                      ? "bg-elevated neu-raised text-text-primary"
                      : "bg-pressed text-text-secondary hover:text-text-primary"
                  }`}
                  aria-pressed={cableRouting === opt}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Theme — honest-disabled */}
      <div>
        <SectionHeading>Theme</SectionHeading>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="block text-[11px] text-text-primary">Colour scheme</span>
              <span className="block text-[9px] text-text-dim mt-0.5">Single dark chassis — the Instrument Paradigm</span>
            </div>
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-elevated neu-raised text-text-secondary cursor-default"
              title="Element uses one unified dark palette. Theme switching is not planned for V3."
            >
              Dark only
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-primary">UI density</span>
            <DisabledBadge bridge="elementSetUIDensity" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-primary">Font size scale</span>
            <DisabledBadge bridge="elementSetFontScale" />
          </div>
        </div>
      </div>

      {/* Animations */}
      <div>
        <SectionHeading>Animations</SectionHeading>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-primary">Reduce motion</span>
            <DisabledBadge bridge="elementSetReduceMotion" />
          </div>
          <p className="text-[9px] text-text-dim leading-relaxed">
            Respects the OS-level prefers-reduced-motion media query automatically.
            Per-user override available once elementSetReduceMotion is bridged.
          </p>
        </div>
      </div>
    </div>
  );
}

function ShortcutsTab() {
  // Group shortcuts by section
  const sections = Array.from(new Set(SHORTCUTS.map((s) => s.section)));

  return (
    <div className="space-y-5">
      <p className="text-[9px] text-text-dim leading-relaxed">
        Read-only key-command reference derived from{" "}
        <span className="text-text-secondary font-mono">useKeyboard.ts</span>.
        Full rebinding editor is tracked as U9.
      </p>

      {sections.map((section) => (
        <div key={section}>
          <SectionHeading divider={section !== sections[0]}>{section}</SectionHeading>
          <div className="space-y-1">
            {SHORTCUTS.filter((s) => s.section === section).map((entry, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 py-1 border-b border-white/4 last:border-0"
              >
                <span className="text-[11px] text-text-primary">{entry.description}</span>
                <div className="flex items-center gap-0.5 shrink-0">
                  {entry.keys.map((k, ki) => (
                    <span key={ki} className="inline-flex items-center">
                      <kbd
                        className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-elevated neu-raised text-text-secondary min-w-[22px] text-center leading-none"
                      >
                        {k}
                      </kbd>
                      {ki < entry.keys.length - 1 && (
                        <span className="text-text-dim text-[9px] mx-0.5">+</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export interface PreferencesModalProps {
  /**
   * Invoked when the user dismisses the modal (Close button or Escape key).
   * The parent owns open/closed state — this component never unmounts itself.
   */
  onClose: () => void;
}

/**
 * Tabbed Preferences modal — Appearance / Audio / MIDI / Shortcuts.
 *
 * Audio: device enumeration + sample-rate/buffer + OSC + canvas (all bridged).
 * Plugin scan/paths/format-toggles are honest-disabled: the bridge calls
 * (elementScanPlugins / elementGetPluginPaths / elementSetPluginFormatEnabled)
 * are not yet exposed (Pillar-2 backlog). A tooltip on each disabled control
 * names the target bridge call.
 *
 * MIDI: mapping table + MIDI-learn (bridged). Per-device enable is
 * honest-disabled pending elementGetMidiInputs / elementGetMidiOutputs.
 *
 * Appearance: cable routing toggle (wired, persisted in useAppStore).
 * Theme/density/font-scale controls are honest-disabled.
 *
 * Shortcuts: read-only key-command list derived from useKeyboard.ts.
 * Full rebinding editor tracked as U9.
 *
 * Settings are staged locally; pushed to C++ host only on each section's
 * Apply button — opening is non-destructive.
 */
export function PreferencesModal({ onClose }: PreferencesModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("audio");

  // ESC dismisses (a11y parity with AboutModal / NeuPromptModal)
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label="Preferences"
    >
      <div
        className="w-[min(560px,95vw)] max-h-[min(680px,88vh)] flex flex-col rounded-xl bg-surface border border-white/5"
        style={{ boxShadow: "8px 8px 32px rgba(0,0,0,0.6), -2px -2px 8px rgba(255,255,255,0.03)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="Settings" size={14} className="text-text-secondary" />
            <span className="text-[11px] font-bold tracking-widest uppercase text-text-primary">
              Preferences
            </span>
          </div>
          <button
            type="button"
            className="w-6 h-6 flex items-center justify-center rounded bg-pressed neu-inset text-text-secondary hover:text-text-primary transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
            onClick={onClose}
            aria-label="Close preferences"
          >
            <Icon name="X" size={12} />
          </button>
        </div>

        {/* Tab bar */}
        <div
          className="flex shrink-0 border-b border-white/8 bg-panel px-2 gap-0.5 pt-2"
          role="tablist"
          aria-label="Preferences sections"
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`pref-panel-${tab.id}`}
                id={`pref-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider rounded-t transition-colors cursor-pointer focus:outline-none relative ${
                  isActive
                    ? "text-text-primary bg-surface"
                    : "text-text-secondary hover:text-text-primary hover:bg-elevated"
                }`}
              >
                <Icon name={tab.icon} size={12} />
                {tab.label}
                {/* Active indicator bar */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-px bg-accent-blue"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div
            id={`pref-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`pref-tab-${activeTab}`}
          >
            {activeTab === "audio"      && <AudioTab />}
            {activeTab === "midi"       && <MidiTab />}
            {activeTab === "appearance" && <AppearanceTab />}
            {activeTab === "shortcuts"  && <ShortcutsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
