import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Icon } from "../../neu/Icon";
import { usePluginScanStore } from "../../../stores/usePluginScanStore";
import type { ScanPluginFormat } from "../../../bridge/nativePluginScan";
import { EV_OPEN_PREFERENCES } from "../../../events";

const PLUGIN_FORMATS: ScanPluginFormat[] = ["VST3", "AU", "CLAP", "LV2"];

function formatBadgeColor(format: string): string {
  const f = format.toUpperCase();
  if (f === "VST3" || f === "VST") return "var(--color-badge-vst3)";
  if (f === "AU" || f === "AUDIOUNIT") return "var(--color-badge-au)";
  if (f === "CLAP") return "var(--color-badge-clap)";
  return "var(--color-badge-lv2)";
}

/**
 * Plugin scan / rescan / paths / format-toggle controls.
 * Moved from ToolPalette.tsx into its own file; behaviour unchanged.
 * Rendered inside the gear-disclosure affordance on the search row.
 */
export function ScanControls() {
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

  const formats = supportedFormats.length > 0 ? supportedFormats : PLUGIN_FORMATS;

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
    <div className="mb-3 pb-3 border-b border-white/5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold text-text-secondary tracking-widest uppercase">
          Plugin Scan
        </span>
        <span className="text-[8px] font-bold text-text-dim tabular tracking-wider">
          {pluginCount > 0 ? `${pluginCount} plugins` : ""}
        </span>
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={scanning}
          onClick={() => void scan()}
          className="flex-1 flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wider py-1.5 rounded-md bg-pressed neu-inset text-accent-blue hover:bg-elevated hover:neu-raised transition-[box-shadow,background-color] duration-150 ease-out disabled:opacity-60 disabled:cursor-not-allowed disabled:text-text-dim"
          title="Scan all enabled plugin formats (elementScanPlugins)"
        >
          <Icon name="Search" size={10} aria-hidden />
          Scan
        </button>
        <button
          type="button"
          disabled={scanning}
          onClick={() => void rescan()}
          className="flex-1 flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wider py-1.5 rounded-md bg-pressed neu-inset text-text-secondary hover:bg-elevated hover:neu-raised hover:text-text-primary transition-[box-shadow,background-color] duration-150 ease-out disabled:opacity-60 disabled:cursor-not-allowed disabled:text-text-dim"
          title="Rescan all enabled plugin formats (elementRescanPlugins)"
        >
          <Icon name="RefreshCw" size={10} aria-hidden />
          Rescan
        </button>
      </div>

      {scanning ? (
        <div className="flex items-center gap-1.5 text-[9px] text-accent-blue px-1">
          <Icon name="RefreshCw" size={10} aria-hidden className="animate-spin" />
          <span className="truncate" title={currentPlugin}>
            Scanning{currentPlugin ? `: ${currentPlugin}` : "…"}
          </span>
        </div>
      ) : null}

      <div>
        <div className="text-[8px] font-bold text-text-dim tracking-widest uppercase mb-1">
          Formats
        </div>
        <div className="flex flex-wrap gap-1">
          {formats.map((f) => {
            const isOn = enabled[f] ?? true;
            return (
              <button
                key={f}
                type="button"
                disabled={scanning}
                aria-pressed={isOn}
                onClick={() => void setFormatEnabled(f, !isOn)}
                className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-[3px] rounded-sm neu-inset transition-colors disabled:cursor-not-allowed ${
                  isOn ? "bg-pressed" : "bg-pressed opacity-40"
                }`}
                title={`${isOn ? "Disable" : "Enable"} ${f} scanning (elementSetPluginFormatEnabled)`}
                style={{
                  color: isOn
                    ? formatBadgeColor(f)
                    : `color-mix(in srgb, ${formatBadgeColor(f)} 45%, var(--color-text-dim))`,
                }}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        {formats.map((f) => {
          const dirs = paths[f] ?? [];
          return (
            <div key={f}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[8px] font-bold text-text-dim tracking-widest uppercase flex items-center gap-1">
                  <Icon name="Folder" size={9} aria-hidden />
                  {f} paths
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAddTarget(addTarget === f ? null : f);
                    setAddValue("");
                    setAddError(false);
                  }}
                  className="text-[8px] font-bold uppercase tracking-wider text-accent-blue hover:text-accent-teal transition-colors flex items-center gap-0.5"
                  title={`Add a scan directory for ${f} (elementAddPluginPath)`}
                >
                  <Icon name="Plus" size={9} aria-hidden />
                  Add
                </button>
              </div>

              {dirs.length === 0 ? (
                <div className="text-[9px] text-text-dim px-2 py-1 rounded-md bg-pressed neu-inset">
                  Default locations.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {dirs.map((dir) => (
                    <div
                      key={dir}
                      className="group flex items-center gap-1 text-[9px] text-text-secondary px-2 py-1 rounded-md bg-pressed neu-inset"
                      title={dir}
                    >
                      <span className="truncate flex-1">{dir}</span>
                      <button
                        type="button"
                        onClick={() => void removePath(f, dir)}
                        className="shrink-0 text-text-dim hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                        aria-label={`Remove ${dir}`}
                        title={`Remove this ${f} scan path (elementRemovePluginPath)`}
                      >
                        <Icon name="Trash2" size={10} aria-hidden />
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
                    className={`flex-1 bg-pressed neu-inset rounded px-2 py-1 text-[9px] text-text-primary border focus:outline-none transition-colors ${
                      addError ? "border-error/60" : "border-white/5 focus:border-accent-blue/40"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => void submitAddPath()}
                    className="px-2 py-1 rounded text-[8px] font-bold uppercase tracking-wider bg-pressed neu-inset text-accent-blue hover:bg-elevated transition-colors"
                  >
                    Add
                  </button>
                </div>
              ) : null}
              {addTarget === f && addError ? (
                <div className="text-[8px] text-error mt-0.5 px-1">
                  Not a directory on this system.
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="w-full text-[9px] font-bold uppercase tracking-widest py-1.5 rounded-md bg-pressed text-text-secondary hover:bg-elevated hover:neu-raised hover:text-text-primary transition-[box-shadow,background-color,color] duration-150 ease-out"
        onClick={() => window.dispatchEvent(new Event(EV_OPEN_PREFERENCES))}
      >
        Advanced (Preferences)
      </button>
    </div>
  );
}
