import { invokeElementNative } from "./juceBackend";

// ── Plugin scan / paths / format-enable bridge (Pillar-2 — the #1 native gap) ──
//
// Backing C++ (element_webview_host.cpp): PluginManager::scanAudioPlugins (the
// out-of-process child scanner — message-thread, non-blocking, self-guards
// against concurrent scans) + the persisted scan-path / format-enabled settings
// keys (the SAME keys the native PluginListComponent reads/writes).
//
// Scan progress is HONEST-INDETERMINATE: the C++ scanner exposes only the name
// of the plugin currently being validated, not a total, so there is no fake
// percentage — the UI shows a spinner + the current plugin name and refreshes
// the plugin list when `scanning` flips true → false.

/** The compact format tokens the UI + bridge speak. Mirrors C++ kWebScanFormats. */
export type ScanPluginFormat = "VST3" | "AU" | "CLAP" | "LV2";

export interface PluginScanStatus {
  /** True while the out-of-process scan is running. */
  scanning: boolean;
  /** File/plugin currently being validated (empty when idle). Honest progress. */
  currentPlugin: string;
  /** Total known plugins after the last scan tick (for a "N plugins" readout). */
  pluginCount: number;
}

export interface PluginPathsSnapshot {
  /** Per-format scan directories (persisted FileSearchPath, split into dirs). */
  paths: Partial<Record<ScanPluginFormat, string[]>>;
  /** Per-format enabled flag (gates which formats a scan actually visits). */
  enabled: Partial<Record<ScanPluginFormat, boolean>>;
  /** The formats the host actually supports on this build/platform. */
  formats: ScanPluginFormat[];
}

const EMPTY_STATUS: PluginScanStatus = {
  scanning: false,
  currentPlugin: "",
  pluginCount: 0,
};

const EMPTY_PATHS: PluginPathsSnapshot = {
  paths: {},
  enabled: {},
  formats: [],
};

/** Parse a host JSON-or-object payload, returning `fallback` on any failure. */
function parsePayload<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === "object") return raw as T;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * Start a plugin scan. With no `formats`, scans every *enabled* format; pass a
 * subset to scan only those (still intersected with the enabled set host-side).
 * Returns true if a scan was issued (false if one is already running or no
 * enabled formats remain).
 */
export async function nativeScanPlugins(
  formats?: ScanPluginFormat[],
): Promise<boolean> {
  const args = formats && formats.length > 0 ? [formats] : [];
  const r = await invokeElementNative("elementScanPlugins", args);
  return r === true;
}

/** Rescan all enabled formats. Returns true if a scan was issued. */
export async function nativeRescanPlugins(): Promise<boolean> {
  const r = await invokeElementNative("elementRescanPlugins", []);
  return r === true;
}

/** Poll the live scan status (scanning flag + current plugin name + count). */
export async function nativeGetScanStatus(): Promise<PluginScanStatus> {
  const raw = await invokeElementNative("elementGetScanStatus", []);
  return parsePayload<PluginScanStatus>(raw, EMPTY_STATUS);
}

/** Read the persisted scan paths + enabled flags for every supported format. */
export async function nativeGetPluginPaths(): Promise<PluginPathsSnapshot> {
  const raw = await invokeElementNative("elementGetPluginPaths", []);
  const parsed = parsePayload<Partial<PluginPathsSnapshot>>(raw, EMPTY_PATHS);
  return {
    paths: parsed.paths ?? {},
    enabled: parsed.enabled ?? {},
    formats: parsed.formats ?? [],
  };
}

/**
 * Add an absolute directory to a format's scan path. Returns true only if the
 * format is supported, the directory exists, and it was newly added.
 */
export async function nativeAddPluginPath(
  format: ScanPluginFormat,
  path: string,
): Promise<boolean> {
  const r = await invokeElementNative("elementAddPluginPath", [format, path]);
  return r === true;
}

/** Remove a directory from a format's scan path. True if it was present. */
export async function nativeRemovePluginPath(
  format: ScanPluginFormat,
  path: string,
): Promise<boolean> {
  const r = await invokeElementNative("elementRemovePluginPath", [
    format,
    path,
  ]);
  return r === true;
}

/** Read the per-format enabled flags (subset of nativeGetPluginPaths). */
export async function nativeGetPluginFormatsEnabled(): Promise<
  Partial<Record<ScanPluginFormat, boolean>>
> {
  const raw = await invokeElementNative("elementGetPluginFormatsEnabled", []);
  return parsePayload<Partial<Record<ScanPluginFormat, boolean>>>(raw, {});
}

/**
 * Enable/disable a plugin format for scanning. Returns true if the format is
 * supported and the flag was written. Disabling genuinely skips the format on
 * the next scan (the flag gates the scan format list host-side).
 */
export async function nativeSetPluginFormatEnabled(
  format: ScanPluginFormat,
  on: boolean,
): Promise<boolean> {
  const r = await invokeElementNative("elementSetPluginFormatEnabled", [
    format,
    on,
  ]);
  return r === true;
}
