import { usePerformStore, selectLiveHealth } from "../../stores/usePerformStore";
import {
  useEngineSnapshotStore,
  selectEngineRunning,
} from "../../stores/useEngineSnapshotStore";
import { useAppStore } from "../../stores/useAppStore";
import { Icon } from "../neu";

/**
 * Slim 24px footer bar showing global engine vitals: audio device, engine
 * RUNNING/STOPPED state, sample rate, buffer, latency, CPU load (colour-coded
 * by severity), and transport timecode. Use it as the persistent at-a-glance
 * health readout across both Edit and Perform modes. Reads engine-running from
 * the C++ snapshot, falling back to the perform store's isPlaying.
 *
 * Known issue F-04: the SAMPLE field can show the version string instead of the
 * sample rate — tracked separately; not addressed here.
 */
export function StatusBar() {
  const health = usePerformStore(selectLiveHealth);
  const isPlaying = usePerformStore(s => s.isPlaying);
  // US-002: real engine-running state from the C++ snapshot — replaces the
  // old `cpu > 0` heuristic, which read STOPPED while audio sat idle even
  // though a device was open and the engine was live.
  // Fall back to usePerformStore.isPlaying when the snapshot store hasn't
  // received a push yet (fixes inconsistency with Perform header ENGINE: LIVE).
  const engineRunning = useEngineSnapshotStore(selectEngineRunning) || isPlaying;

  // T3 — transient canvas coaching hint (cable-drag affordance / alt-drop nudge).
  // When set it temporarily REPLACES the left vitals cluster (device + engine
  // state) so the contextual instruction reads cleanly without crowding the bar.
  const canvasHint = useAppStore((s) => s.canvasHint);

  const deviceName =
    health.clock && health.clock !== "—" ? health.clock : "Default Device";
  const sampleRate = health.sampleRateLabel || "—";
  const buffer =
    typeof health.buffer === "number" && health.buffer > 0
      ? `${health.buffer} smp`
      : "—";
  const latency =
    typeof health.latency === "number" && health.latency > 0
      ? `${health.latency.toFixed(1)} ms`
      : "—";
  const cpuPercent = health.cpu;

  return (
    <div className="h-6 bg-pressed border-t border-white/5 flex items-center justify-between px-4 text-[10px] select-none">
      {canvasHint ? (
        <div className="flex items-center gap-2 min-w-0" role="status" aria-live="polite">
          <span
            className="w-2 h-2 rounded-full bg-accent-blue shadow-[0_0_6px_rgba(74,144,217,0.5)] shrink-0"
            aria-hidden
          />
          <span className="font-medium text-text-primary truncate">
            {canvasHint}
          </span>
        </div>
      ) : (
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 text-text-secondary min-w-0">
          <Icon name="Volume2" size={12} aria-hidden />
          <span className="font-medium truncate max-w-[140px]" title={deviceName}>
            {deviceName}
          </span>
        </div>

        <div className="h-3 w-px bg-white/10" />

        <div
          className="flex items-center gap-1.5"
          role="status"
          aria-live="polite"
          aria-label={engineRunning ? "Engine running" : "Engine stopped"}
        >
          <div
            className={[
              "w-2 h-2 rounded-full",
              engineRunning
                ? "bg-accent-teal shadow-[0_0_6px_rgba(43,196,196,0.5)]"
                : "bg-text-secondary",
            ].join(" ")}
            aria-hidden
          />
          <span className={engineRunning ? "text-accent-teal font-bold" : "text-text-secondary"}>
            {engineRunning ? "RUNNING" : "STOPPED"}
          </span>
        </div>
      </div>
      )}

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1.5 text-text-secondary">
          <span className="opacity-60">SAMPLE</span>
          <span className="text-text-primary font-bold tabular">{sampleRate}</span>
        </div>
        <div className="flex items-center gap-1.5 text-text-secondary">
          <span className="opacity-60">BUFFER</span>
          <span className="text-text-primary font-bold tabular">{buffer}</span>
        </div>
        <div className="flex items-center gap-1.5 text-text-secondary">
          <span className="opacity-60">LATENCY</span>
          <span className="text-accent-teal font-bold tabular">{latency}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Icon name="Cpu" size={12} className="text-text-secondary" aria-hidden />
          <div className="flex items-center gap-1">
            <span className="text-text-secondary opacity-60">CPU</span>
            <span
              className={[
                "font-bold tabular",
                cpuPercent > 80
                  ? "text-error"
                  : cpuPercent > 50
                    ? "text-accent-orange"
                    : "text-accent-teal",
              ].join(" ")}
            >
              {cpuPercent.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="h-3 w-px bg-white/10" />

        <div className="flex items-center gap-1.5">
          <Icon name="Clock" size={12} className="text-text-secondary" aria-hidden />
          <span className="text-text-primary font-bold tabular">
            {health.timecode || "00:00:00:00"}
          </span>
        </div>
      </div>
    </div>
  );
}
