import {
  usePerformStore,
  selectLiveHealth,
  selectAlerts,
} from "../../stores/usePerformStore";
import { Icon } from "../neu";

// ── I/O meter bars ──
//
// Visual choice: the bridge currently emits a single aggregate output peak
// (`onMetering`). We render the 4-bar group as a graduated bar-graph where
// each bar lights up once the peak crosses its threshold — bar 1 at >0,
// bar 2 at >25 %, bar 3 at >50 %, bar 4 at >75 %. Each bar's height also
// scales with how far past its threshold the signal is, producing a
// classic LED-ladder feel from a single scalar. When future C++ work
// (Q-VU-INPUT) splits input vs output, we can render the same ladder
// against the input scalar.

function levelToLadderHeights(level01: number): number[] {
  const v = Number.isFinite(level01) ? Math.max(0, Math.min(1, level01)) : 0;
  // Each bar is mapped from its threshold to the peak. A bar at threshold
  // 25 % shows 0 below 0.25 and ramps to 100 % at 1.0.
  const thresholds = [0, 0.25, 0.5, 0.75];
  return thresholds.map((t) => {
    if (v <= t) return 0;
    const denom = 1 - t || 1;
    return Math.round(((v - t) / denom) * 100);
  });
}

function MeterBars({ heights, color }: { heights: number[]; color: string }) {
  return (
    <div className="flex gap-1 h-10 items-end">
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-1 rounded-full"
          style={{
            height: `${h}%`,
            backgroundColor: color,
            opacity: h < 15 ? 0.2 : h < 50 ? 0.6 : 1,
          }}
        />
      ))}
    </div>
  );
}

/**
 * At-a-glance engine vitals panel: CPU load, I/O metering ladders, buffer size,
 * latency, and any active alerts. Use it as a persistent monitor so the user
 * can spot dropouts or runaway CPU mid-session without opening settings.
 * Read-only — it reflects the live engine snapshot from the perform store and
 * surfaces warning/critical alerts inline.
 */
export function LiveHealth() {
  const health = usePerformStore(selectLiveHealth);
  const alerts = usePerformStore(selectAlerts);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/5">
        <span className="text-[11px] font-bold text-text-primary uppercase tracking-widest">
          Live Health
        </span>
        <Icon name="HeartPulse" size={16} className="text-logic" aria-label="Live health monitor" />
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-6 overflow-y-auto">
        {/* CPU Load */}
        <div>
          <div className="flex justify-between text-[10px] mb-2">
            <span className="text-text-secondary uppercase font-bold">
              CPU Load
            </span>
            <span className="text-logic tabular">{health.cpu}%</span>
          </div>
          <div className="h-3 bg-pressed shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-gradient-to-r from-logic to-generator rounded-full"
              style={{ width: `${health.cpu}%` }}
            />
          </div>
        </div>

        {/* I/O Activity */}
        <div>
          <div className="text-[10px] text-text-secondary uppercase font-bold mb-3">
            I/O Activity
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div
              className="bg-pressed p-2 rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] opacity-40"
              title="Input metering not yet exposed by host bridge (Q-VU-INPUT)"
            >
              <span className="text-[10px] text-text-secondary block mb-1">
                INPUT <span className="text-text-dim">(n/a)</span>
              </span>
              {/* T-P1-5: Bridge does not yet emit an input peak. Render
                  the ladder dimmed (opacity-40 + grey color + n/a label
                  + tooltip) so it cannot be confused for an "active and
                  silent" meter. Restore live colour once Q-VU-INPUT lands. */}
              <MeterBars heights={levelToLadderHeights(0)} color="#4A4A4A" />
            </div>
            <div className="bg-pressed p-2 rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]">
              <span className="text-[10px] text-text-secondary block mb-1">
                OUTPUT
              </span>
              <MeterBars
                heights={levelToLadderHeights(health.outputPeak)}
                color="#2BC4C4"
              />
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 bg-surface border border-white/5 rounded">
            <span className="text-[10px] text-text-secondary uppercase">
              Buffer
            </span>
            <div className="text-xs font-bold text-text-primary tabular">
              {health.buffer} smp
            </div>
          </div>
          <div className="p-2 bg-surface border border-white/5 rounded">
            <span className="text-[10px] text-text-secondary uppercase">
              Latency
            </span>
            <div className="text-xs font-bold text-text-primary tabular">
              {health.latency} ms
            </div>
          </div>
        </div>

        {/* Alerts */}
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="p-3 bg-[#3d2600]/30 border border-[#c08512]/30 rounded flex items-start gap-3"
          >
            <Icon
              name="TriangleAlert"
              size={18}
              className="text-modifier shrink-0 mt-0.5"
              aria-label="Alert"
            />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-modifier">
                {alert.title}
              </span>
              <span className="text-[10px] text-modifier/80">
                {alert.message}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
