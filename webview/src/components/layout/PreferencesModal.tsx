import { useState, useEffect } from "react";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
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

type PrefsTab = "audio" | "midi" | "plugins" | "canvas" | "mapping";

const ICON_SPEAKER =
  "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z";
const ICON_MIDI = "M7 5v14h3v-6h4v6h3V5H7zm10 8H7v-2h10v2z";
const ICON_PLUGIN =
  "M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7s2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z";
const ICON_GRID =
  "M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z";
const ICON_CONTROLLER =
  "M15 7.5V2H9v5.5l3 3 3-3zM7.5 9H2v6h5.5l3-3-3-3zM9 16.5V22h6v-5.5l-3-3-3 3zM16.5 9l-3 3 3 3H22V9h-5.5z";

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

export function PreferencesModal({ onClose }: { onClose: () => void }) {
  const audio = useHostExtrasStore((s) => s.audioSetup);
  const osc = useHostExtrasStore((s) => s.oscHost);
  const canvas = useHostExtrasStore((s) => s.canvas);
  const midiMapping = useHostExtrasStore((s) => s.midiMapping);

  const [activeTab, setActiveTab] = useState<PrefsTab>("audio");
  const [outDev, setOutDev] = useState("");
  const [inDev, setInDev] = useState("");
  const [driver, setDriver] = useState("");
  const [sr, setSr] = useState(0);
  const [buf, setBuf] = useState(0);
  const [oscEn, setOscEn] = useState(false);
  const [oscPort, setOscPort] = useState(9001);
  const learning = midiMapping.learning;
  const [snapGrid, setSnapGrid] = useState(false);
  const [gridSize, setGridSize] = useState(8);

  // Plugin paths state (demo - in real implementation, fetch from host)
  const [vstPaths, setVstPaths] = useState<string[]>([
    "/Library/Audio/Plug-Ins/VST3",
    "~/Library/Audio/Plug-Ins/VST3",
  ]);
  const [newPath, setNewPath] = useState("");
  const [scanOnStartup, setScanOnStartup] = useState(true);
  const [sandboxPlugins, setSandboxPlugins] = useState(true);

  // MIDI devices state
  const [midiInputs] = useState<string[]>(["IAC Driver Bus 1", "USB MIDI Device"]);
  const [midiOutputs] = useState<string[]>(["IAC Driver Bus 1", "USB MIDI Device"]);
  const [enabledMidiInputs, setEnabledMidiInputs] = useState<Set<string>>(new Set(["IAC Driver Bus 1"]));
  const [enabledMidiOutputs, setEnabledMidiOutputs] = useState<Set<string>>(new Set());
  const [midiClockSource, setMidiClockSource] = useState("internal");

  const tabs: { id: PrefsTab; label: string; icon: string }[] = [
    { id: "audio", label: "Audio", icon: ICON_SPEAKER },
    { id: "midi", label: "MIDI", icon: ICON_MIDI },
    { id: "plugins", label: "Plugins", icon: ICON_PLUGIN },
    { id: "canvas", label: "Canvas", icon: ICON_GRID },
    { id: "mapping", label: "Mapping", icon: ICON_CONTROLLER },
  ];

  const addPluginPath = () => {
    if (newPath.trim() && !vstPaths.includes(newPath.trim())) {
      setVstPaths([...vstPaths, newPath.trim()]);
      setNewPath("");
    }
  };

  const removePluginPath = (path: string) => {
    setVstPaths(vstPaths.filter((p) => p !== path));
  };

  const toggleMidiInput = (device: string) => {
    setEnabledMidiInputs((prev) => {
      const next = new Set(prev);
      if (next.has(device)) next.delete(device);
      else next.add(device);
      return next;
    });
  };

  const toggleMidiOutput = (device: string) => {
    setEnabledMidiOutputs((prev) => {
      const next = new Set(prev);
      if (next.has(device)) next.delete(device);
      else next.add(device);
      return next;
    });
  };

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
    if (osc) {
      setOscEn(osc.enabled);
      setOscPort(osc.port);
    }
  }, [osc]);

  useEffect(() => {
    setSnapGrid(canvas.snapToGrid);
    setGridSize(canvas.gridSize);
  }, [canvas.snapToGrid, canvas.gridSize]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label="Preferences"
    >
      <div className="w-[min(640px,92vw)] max-h-[min(720px,85vh)] overflow-hidden flex flex-col rounded-lg bg-surface shadow-[8px_8px_24px_rgba(0,0,0,0.5)] border border-white/5">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span className="text-xs font-bold tracking-widest uppercase text-text-primary">
            Preferences
          </span>
          <button
            type="button"
            className="text-text-secondary hover:text-text-primary text-sm px-2"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-white/10 px-2 bg-pressed">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "flex items-center gap-2 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors",
                activeTab === tab.id
                  ? "text-generator border-b-2 border-generator"
                  : "text-text-secondary hover:text-text-primary",
              ].join(" ")}
            >
              <Icon d={tab.icon} size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 text-[12px]">
          {/* Audio Tab */}
          {activeTab === "audio" && (
            <>
              <section className="space-y-4">
                <h3 className="text-[11px] uppercase tracking-wider text-text-secondary font-bold">
                  Audio Device Configuration
                </h3>
            <label className="block text-text-secondary text-[10px] uppercase">
              Driver type
              <select
                className="mt-1 w-full bg-pressed rounded px-2 py-1.5 text-text-primary border border-white/5"
                value={driver}
                onChange={(e) => setDriver(e.target.value)}
              >
                {(audio?.deviceTypes?.length
                  ? audio.deviceTypes
                  : [driver]
                ).map((d) => (
                  <option key={d || "default"} value={d}>
                    {d || "Default"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-text-secondary text-[10px] uppercase">
              Output
              <select
                className="mt-1 w-full bg-pressed rounded px-2 py-1.5 text-text-primary border border-white/5"
                value={outDev}
                onChange={(e) => setOutDev(e.target.value)}
              >
                {(audio?.outputDevices ?? []).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-text-secondary text-[10px] uppercase">
              Input
              <select
                className="mt-1 w-full bg-pressed rounded px-2 py-1.5 text-text-primary border border-white/5"
                value={inDev}
                onChange={(e) => setInDev(e.target.value)}
              >
                {(audio?.inputDevices ?? []).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-text-secondary text-[10px] uppercase">
                Sample rate
                <select
                  className="mt-1 w-full bg-pressed rounded px-2 py-1.5 text-text-primary border border-white/5"
                  value={sr}
                  onChange={(e) => setSr(Number(e.target.value))}
                >
                  {(audio?.sampleRates ?? []).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-text-secondary text-[10px] uppercase">
                Buffer
                <select
                  className="mt-1 w-full bg-pressed rounded px-2 py-1.5 text-text-primary border border-white/5"
                  value={buf}
                  onChange={(e) => setBuf(Number(e.target.value))}
                >
                  {(audio?.bufferSizes ?? []).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="w-full py-2 rounded bg-elevated shadow-neu-raised text-text-primary text-[11px] font-bold uppercase tracking-wide"
              onClick={() =>
                void nativeAudioApplySetup({
                  outputDeviceName: outDev,
                  inputDeviceName: inDev,
                  audioDeviceType: driver,
                  sampleRate: sr,
                  bufferSize: buf,
                })
              }
            >
                  Apply audio
                </button>
              </section>

              <section className="space-y-3 border-t border-white/10 pt-4">
                <h3 className="text-[10px] uppercase tracking-wider text-text-secondary">
                  OSC Host
                </h3>
                <label className="flex items-center gap-2 text-text-primary">
                  <input
                    type="checkbox"
                    checked={oscEn}
                    onChange={(e) => setOscEn(e.target.checked)}
                  />
                  Enable OSC Server
                </label>
                <label className="block text-text-secondary text-[10px] uppercase">
                  Port
                  <input
                    type="number"
                    className="mt-1 w-full bg-pressed rounded px-2 py-1.5 text-text-primary border border-white/5"
                    value={oscPort}
                    onChange={(e) => setOscPort(Number(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="w-full py-2 rounded bg-elevated shadow-neu-raised text-text-primary text-[11px] font-bold uppercase tracking-wide"
                  onClick={() =>
                    void nativeOscApplyHost({ enabled: oscEn, port: oscPort })
                  }
                >
                  Apply OSC Settings
                </button>
              </section>
            </>
          )}

          {/* MIDI Tab */}
          {activeTab === "midi" && (
            <section className="space-y-4">
            <h3 className="text-[11px] uppercase tracking-wider text-text-secondary font-bold">
              MIDI Devices
            </h3>
            
            <div className="space-y-2">
              <span className="text-[10px] text-text-secondary uppercase">Input Devices</span>
              <div className="space-y-1.5">
                {midiInputs.map((device) => (
                  <label key={device} className="flex items-center gap-2 p-2 rounded bg-pressed border border-white/5">
                    <input
                      type="checkbox"
                      checked={enabledMidiInputs.has(device)}
                      onChange={() => toggleMidiInput(device)}
                    />
                    <span className="text-[11px] text-text-primary">{device}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] text-text-secondary uppercase">Output Devices</span>
              <div className="space-y-1.5">
                {midiOutputs.map((device) => (
                  <label key={device} className="flex items-center gap-2 p-2 rounded bg-pressed border border-white/5">
                    <input
                      type="checkbox"
                      checked={enabledMidiOutputs.has(device)}
                      onChange={() => toggleMidiOutput(device)}
                    />
                    <span className="text-[11px] text-text-primary">{device}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2 border-t border-white/10 pt-4">
              <span className="text-[10px] text-text-secondary uppercase">Clock Sync</span>
              <select
                className="w-full bg-pressed rounded px-2 py-1.5 text-text-primary border border-white/5"
                value={midiClockSource}
                onChange={(e) => setMidiClockSource(e.target.value)}
              >
                <option value="internal">Internal (Master)</option>
                <option value="external">External MIDI Clock</option>
                <option value="host">Host DAW (Plugin mode)</option>
              </select>
            </div>

            <button
              type="button"
              className="w-full py-2 rounded bg-generator text-canvas text-[11px] font-bold uppercase tracking-wide"
            >
              Apply MIDI Settings
            </button>
            </section>
          )}

          {/* Plugins Tab */}
          {activeTab === "plugins" && (
            <section className="space-y-4">
            <h3 className="text-[11px] uppercase tracking-wider text-text-secondary font-bold">
              Plugin Search Paths
            </h3>
            
            <div className="space-y-2">
              {vstPaths.map((path, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded bg-pressed border border-white/5">
                  <span className="flex-1 text-[11px] text-text-primary truncate" title={path}>
                    {path}
                  </span>
                  <button
                    type="button"
                    className="text-[10px] text-error hover:underline"
                    onClick={() => removePluginPath(path)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add plugin path..."
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPluginPath()}
                className="flex-1 bg-pressed rounded px-2 py-1.5 text-text-primary border border-white/5 text-[11px]"
              />
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-elevated text-text-primary text-[11px] font-bold"
                onClick={addPluginPath}
              >
                Add
              </button>
            </div>

            <div className="space-y-2 border-t border-white/10 pt-4">
              <span className="text-[10px] text-text-secondary uppercase">Scan Options</span>
              <label className="flex items-center gap-2 p-2 rounded bg-pressed border border-white/5">
                <input
                  type="checkbox"
                  checked={scanOnStartup}
                  onChange={(e) => setScanOnStartup(e.target.checked)}
                />
                <span className="text-[11px] text-text-primary">Scan plugins on startup</span>
              </label>
              <label className="flex items-center gap-2 p-2 rounded bg-pressed border border-white/5">
                <input
                  type="checkbox"
                  checked={sandboxPlugins}
                  onChange={(e) => setSandboxPlugins(e.target.checked)}
                />
                <span className="text-[11px] text-text-primary">Run plugins in sandbox (recommended)</span>
              </label>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 py-2 rounded bg-elevated text-text-primary text-[11px] font-bold uppercase tracking-wide"
              >
                Rescan All Plugins
              </button>
              <button
                type="button"
                className="flex-1 py-2 rounded bg-generator text-canvas text-[11px] font-bold uppercase tracking-wide"
              >
                Apply Plugin Settings
              </button>
            </div>
            </section>
          )}

          {/* Canvas Tab */}
          {activeTab === "canvas" && (
            <section className="space-y-4">
            <h3 className="text-[11px] uppercase tracking-wider text-text-secondary font-bold">
              Canvas Settings
            </h3>
            <label className="flex items-center gap-2 text-text-primary p-2 rounded bg-pressed border border-white/5">
              <input
                type="checkbox"
                checked={snapGrid}
                onChange={(e) => setSnapGrid(e.target.checked)}
              />
              <span className="text-[11px]">Snap to grid</span>
            </label>
            <label className="block text-text-secondary text-[10px] uppercase">
              Grid size (px)
              <input
                type="number"
                min={4}
                max={128}
                className="mt-1 w-full bg-pressed rounded px-2 py-1.5 text-text-primary border border-white/5"
                value={gridSize}
                onChange={(e) => setGridSize(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="w-full py-2 rounded bg-generator text-canvas text-[11px] font-bold uppercase tracking-wide"
              onClick={() =>
                void nativeGraphSetCanvasOptions(snapGrid, gridSize)
              }
            >
                Apply Canvas Settings
            </button>
            </section>
          )}

          {/* Mapping Tab */}
          {activeTab === "mapping" && (
            <section className="space-y-4">
            <h3 className="text-[11px] uppercase tracking-wider text-text-secondary font-bold">
              MIDI Controller Mapping
            </h3>
            <button
              type="button"
              className={`w-full py-2.5 rounded text-[11px] font-bold uppercase tracking-wide ${
                learning
                  ? "bg-modifier text-canvas"
                  : "bg-elevated shadow-neu-raised text-text-primary"
              }`}
              onClick={() => {
                void nativeMappingSetLearning(!learning);
              }}
            >
              {learning ? "Stop MIDI Learn" : "Start MIDI Learn"}
            </button>
            {midiMapping.maps.length > 0 ? (
              <div className="max-h-64 overflow-y-auto rounded border border-white/10 bg-pressed text-[10px]">
                <table className="w-full text-left border-collapse">
                  <thead className="text-text-dim uppercase tracking-wider sticky top-0 bg-pressed">
                    <tr>
                      <th className="p-2 font-normal">Device</th>
                      <th className="p-2 font-normal">Control</th>
                      <th className="p-2 font-normal">Block</th>
                      <th className="p-2 font-normal w-14"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {midiMapping.maps.map((row) => (
                      <tr
                        key={`${row.index}-${row.nodeId}-${row.parameterIndex}`}
                        className={
                          row.valid
                            ? "border-t border-white/5"
                            : "border-t border-modifier/30 opacity-70"
                        }
                      >
                        <td className="p-2 align-top truncate max-w-[100px]">
                          {row.deviceName || "—"}
                        </td>
                        <td className="p-2 align-top truncate max-w-[80px]">
                          {row.controlName || "—"}
                        </td>
                        <td className="p-2 align-top truncate max-w-[100px]">
                          {row.nodeName || row.nodeId || "—"}
                          <span className="block text-text-dim tabular">
                            param {row.parameterIndex}
                          </span>
                        </td>
                        <td className="p-2 align-top">
                          <button
                            type="button"
                            className="text-error hover:underline uppercase"
                            onClick={() =>
                              void nativeMappingRemoveMap(row.index)
                            }
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[10px] text-text-dim p-4 text-center bg-pressed rounded border border-white/5">
                No controller mappings yet. Click "Start MIDI Learn", then move a MIDI control and click a parameter.
              </p>
            )}

            <div className="space-y-2 border-t border-white/10 pt-4">
              <span className="text-[10px] text-text-secondary uppercase">Host Tools</span>
              <button
                type="button"
                className="w-full py-2 rounded bg-pressed text-text-primary text-[11px] uppercase"
                onClick={() => void nativeOpenLuaConsole()}
              >
                Open Lua Console
              </button>
              <button
                type="button"
                className="w-full py-2 rounded bg-pressed text-text-primary text-[11px] uppercase"
                onClick={() => void nativeOpenGraphMixer()}
              >
                Open Graph Mixer
              </button>
              <button
                type="button"
                className="w-full py-2 rounded bg-pressed text-text-secondary text-[11px] uppercase"
                onClick={() => void nativeWebDismissOverlay()}
              >
                  Dismiss Host Overlay
              </button>
            </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
