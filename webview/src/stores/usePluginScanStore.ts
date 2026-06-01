// Pillar-2 — plugin scan / paths / format-enable store.
//
// Single source of truth for the scan controls shared by ToolPalette
// ("PLUGIN SCAN & PATHS") and PreferencesModal (Audio tab). Holds:
//   - live scan status (scanning flag + current plugin name — honest
//     indeterminate progress, NO fake percentage)
//   - persisted per-format scan paths + enabled flags (read from the host,
//     written back through the bridge)
//
// While a scan is running the store polls `elementGetScanStatus` at ~3 Hz; when
// the scan flips true → false it refreshes BOTH the plugin browser list and the
// paths snapshot, then stops polling. No new C++ push channel is needed (matches
// the existing plugin-list back-off poll in useJuceBridge).
import { create } from "zustand";
import {
  nativeScanPlugins,
  nativeRescanPlugins,
  nativeGetScanStatus,
  nativeGetPluginPaths,
  nativeAddPluginPath,
  nativeRemovePluginPath,
  nativeSetPluginFormatEnabled,
  type ScanPluginFormat,
  type PluginScanStatus,
  type PluginPathsSnapshot,
} from "../bridge/nativePluginScan";
import { usePluginBrowserStore } from "./usePluginBrowserStore";

interface PluginScanState {
  scanning: boolean;
  currentPlugin: string;
  pluginCount: number;
  paths: Partial<Record<ScanPluginFormat, string[]>>;
  enabled: Partial<Record<ScanPluginFormat, boolean>>;
  /** Supported formats reported by the host (drives which toggles render). */
  formats: ScanPluginFormat[];
  /** Whether the paths snapshot has ever loaded from the host. */
  pathsLoaded: boolean;
}

interface PluginScanActions {
  /** Refresh the persisted paths + enabled flags from the host. */
  refreshPaths: () => Promise<void>;
  /** Poll a single scan-status tick; auto-handles scan completion. */
  refreshStatus: () => Promise<void>;
  /** Start a scan (optionally restricted to `formats`); begins status polling. */
  scan: (formats?: ScanPluginFormat[]) => Promise<void>;
  /** Rescan all enabled formats; begins status polling. */
  rescan: () => Promise<void>;
  /** Add a directory to a format's scan path (then refresh paths). */
  addPath: (format: ScanPluginFormat, path: string) => Promise<boolean>;
  /** Remove a directory from a format's scan path (then refresh paths). */
  removePath: (format: ScanPluginFormat, path: string) => Promise<boolean>;
  /** Toggle a format on/off (then refresh paths). */
  setFormatEnabled: (format: ScanPluginFormat, on: boolean) => Promise<boolean>;
}

type PluginScanStore = PluginScanState & PluginScanActions;

// Module-level poll handle so scan-status polling is a singleton.
let pollHandle: ReturnType<typeof setInterval> | null = null;
const POLL_MS = 350;

const initialState: PluginScanState = {
  scanning: false,
  currentPlugin: "",
  pluginCount: 0,
  paths: {},
  enabled: {},
  formats: [],
  pathsLoaded: false,
};

function stopPolling(): void {
  if (pollHandle != null) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

export const usePluginScanStore = create<PluginScanStore>()((set, get) => {
  function applyStatus(status: PluginScanStatus, wasScanning: boolean): void {
    set({
      scanning: status.scanning,
      currentPlugin: status.currentPlugin,
      pluginCount: status.pluginCount,
    });
    // Scan just finished: refresh the plugin list + paths, then stop polling.
    if (wasScanning && !status.scanning) {
      stopPolling();
      void usePluginBrowserStore.getState().refresh();
      void get().refreshPaths();
    }
  }

  function startPolling(): void {
    if (pollHandle != null) return;
    pollHandle = setInterval(() => {
      void get().refreshStatus();
    }, POLL_MS);
  }

  return {
    ...initialState,

    refreshPaths: async () => {
      const snap: PluginPathsSnapshot = await nativeGetPluginPaths();
      set({
        paths: snap.paths,
        enabled: snap.enabled,
        formats: snap.formats,
        pathsLoaded: true,
      });
    },

    refreshStatus: async () => {
      const wasScanning = get().scanning;
      const status = await nativeGetScanStatus();
      applyStatus(status, wasScanning);
    },

    scan: async (formats?: ScanPluginFormat[]) => {
      const issued = await nativeScanPlugins(formats);
      if (issued) {
        set({ scanning: true });
        startPolling();
      }
    },

    rescan: async () => {
      const issued = await nativeRescanPlugins();
      if (issued) {
        set({ scanning: true });
        startPolling();
      }
    },

    addPath: async (format, path) => {
      const ok = await nativeAddPluginPath(format, path);
      if (ok) await get().refreshPaths();
      return ok;
    },

    removePath: async (format, path) => {
      const ok = await nativeRemovePluginPath(format, path);
      if (ok) await get().refreshPaths();
      return ok;
    },

    setFormatEnabled: async (format, on) => {
      const ok = await nativeSetPluginFormatEnabled(format, on);
      if (ok) await get().refreshPaths();
      return ok;
    },
  };
});

// ── Selectors ──
export const selectScanning = (s: PluginScanStore) => s.scanning;
export const selectCurrentPlugin = (s: PluginScanStore) => s.currentPlugin;
export const selectScanPluginCount = (s: PluginScanStore) => s.pluginCount;
