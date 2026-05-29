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

interface PreferencesModalProps {
  /**
   * Invoked when the user dismisses the modal (Close button). The parent owns
   * open/closed state — this component never unmounts itself.
   */
  onClose: () => void;
}

/**
 * Full-screen modal for host-wide preferences: audio device + driver, OSC host,
 * Board canvas snap grid, and MIDI controller mapping/learn. Reach for it when
 * the user needs to change the audio interface, scan for OSC, or inspect/clear
 * the MIDI maps that drive Block parameters from a hardware controller. Settings
 * are staged locally and pushed to the C++ host only on each section's Apply
 * button, so opening it is non-destructive.
 */
export function PreferencesModal({ onClose }: PreferencesModalProps) {
  const audio = useHostExtrasStore((s) => s.audioSetup);
  const osc = useHostExtrasStore((s) => s.oscHost);
  const canvas = useHostExtrasStore((s) => s.canvas);
  const midiMapping = useHostExtrasStore((s) => s.midiMapping);

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
      <div className="w-[min(520px,92vw)] max-h-[min(640px,85vh)] overflow-hidden flex flex-col rounded-lg bg-surface shadow-[8px_8px_24px_rgba(0,0,0,0.5)] border border-white/5">
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

        <div className="flex-1 overflow-y-auto p-4 space-y-6 text-[12px]">
          <section className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-wider text-text-secondary">
              Audio device
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

          <section className="space-y-2 border-t border-white/10 pt-4">
            <h3 className="text-[10px] uppercase tracking-wider text-text-secondary">
              OSC host
            </h3>
            <label className="flex items-center gap-2 text-text-primary">
              <input
                type="checkbox"
                checked={oscEn}
                onChange={(e) => setOscEn(e.target.checked)}
              />
              Enabled
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
              Apply OSC
            </button>
          </section>

          <section className="space-y-2 border-t border-white/10 pt-4">
            <h3 className="text-[10px] uppercase tracking-wider text-text-secondary">
              Board canvas
            </h3>
            <label className="flex items-center gap-2 text-text-primary">
              <input
                type="checkbox"
                checked={snapGrid}
                onChange={(e) => setSnapGrid(e.target.checked)}
              />
              Snap to grid (Web board)
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
              className="w-full py-2 rounded bg-elevated shadow-neu-raised text-text-primary text-[11px] font-bold uppercase tracking-wide"
              onClick={() =>
                void nativeGraphSetCanvasOptions(snapGrid, gridSize)
              }
            >
              Apply canvas
            </button>
          </section>

          <section className="space-y-2 border-t border-white/10 pt-4">
            <h3 className="text-[10px] uppercase tracking-wider text-text-secondary">
              MIDI mapping & tools
            </h3>
            <button
              type="button"
              className={`w-full py-2 rounded text-[11px] font-bold uppercase tracking-wide ${
                learning
                  ? "bg-modifier text-canvas"
                  : "bg-elevated shadow-neu-raised text-text-primary"
              }`}
              onClick={() => {
                void nativeMappingSetLearning(!learning);
              }}
            >
              {learning ? "Stop MIDI learn" : "MIDI learn"}
            </button>
            {midiMapping.maps.length > 0 ? (
              <div className="max-h-48 overflow-y-auto rounded border border-white/10 bg-pressed text-[10px]">
                <table className="w-full text-left border-collapse">
                  <thead className="text-text-dim uppercase tracking-wider sticky top-0 bg-pressed">
                    <tr>
                      <th className="p-1.5 font-normal">Device</th>
                      <th className="p-1.5 font-normal">Control</th>
                      <th className="p-1.5 font-normal">Block</th>
                      <th className="p-1.5 font-normal w-14"> </th>
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
                        <td className="p-1.5 align-top truncate max-w-[100px]">
                          {row.deviceName || "—"}
                        </td>
                        <td className="p-1.5 align-top truncate max-w-[80px]">
                          {row.controlName || "—"}
                        </td>
                        <td className="p-1.5 align-top truncate max-w-[100px]">
                          {row.nodeName || row.nodeId || "—"}
                          <span className="block text-text-dim tabular">
                            param {row.parameterIndex}
                          </span>
                        </td>
                        <td className="p-1.5 align-top">
                          <button
                            type="button"
                            className="text-error hover:underline uppercase"
                            onClick={() =>
                              void nativeMappingRemoveMap(row.index)
                            }
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[10px] text-text-dim">
                No controller maps in the session snapshot yet.
              </p>
            )}
            <button
              type="button"
              className="w-full py-2 rounded bg-pressed text-text-primary text-[11px] uppercase"
              onClick={() => void nativeOpenLuaConsole()}
            >
              Lua console (overlay)
            </button>
            <button
              type="button"
              className="w-full py-2 rounded bg-pressed text-text-primary text-[11px] uppercase"
              onClick={() => void nativeOpenGraphMixer()}
            >
              Graph mixer (overlay)
            </button>
            <button
              type="button"
              className="w-full py-2 rounded bg-pressed text-text-secondary text-[11px] uppercase"
              onClick={() => void nativeWebDismissOverlay()}
            >
              Dismiss overlay
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
