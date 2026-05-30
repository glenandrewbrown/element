import { useGraphStore, selectNodes } from "../../stores/useGraphStore";
import {
  usePerformStore,
  selectSessionName,
  selectLiveHealth,
  selectOutputPeak,
} from "../../stores/usePerformStore";
import { NeuBadge, Icon } from "../neu";
import { catConfig } from "../canvas/Block";

/**
 * Perform-mode left rail: flat, read-only roster of every Block on the
 * active Board ordered by canvas position (top → bottom, left → right).
 * Each entry surfaces category colour, name, format, per-block CPU load and
 * latency so the user can scan the signal chain at a glance without opening
 * the Board. Footer mirrors the LiveHealth CPU gradient bar + a 4-bar output
 * peak LED so engine health is always visible without switching panels.
 */
export function QuickAccess() {
  const nodes = useGraphStore(selectNodes);
  const projectName = usePerformStore(selectSessionName);
  const health = usePerformStore(selectLiveHealth);
  const outputPeak = usePerformStore(selectOutputPeak);

  const ordered = [...nodes].sort((a, b) => {
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    return a.position.x - b.position.x;
  });

  return (
    <div className="flex flex-col h-full">
      {/* ── Project header ── */}
      <div className="px-3 py-2 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
            Quick Access
          </span>
          <Icon name="Search" size={14} className="text-text-dim" aria-hidden />
        </div>

        {/* Active project card */}
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-white/5 bg-surface"
          style={{
            boxShadow:
              "-2px -2px 8px rgba(255,255,255,0.04), 2px 2px 8px rgba(0,0,0,0.35)",
          }}
        >
          <Icon
            name="Network"
            size={13}
            className="text-accent-blue shrink-0"
            aria-hidden
          />
          <span className="text-[11px] font-medium text-text-primary truncate flex-1">
            {projectName}
          </span>
          <NeuBadge text="Live" color="blue" />
        </div>
      </div>

      {/* ── Block roster ── */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="text-[10px] text-text-secondary uppercase tracking-widest px-1 pb-1.5">
          Blocks{ordered.length > 0 ? ` · ${ordered.length}` : ""}
        </div>

        {ordered.length === 0 ? (
          <div className="px-2 py-5 text-[10px] text-text-dim text-center leading-relaxed">
            No blocks yet —
            <br />
            add from the palette or use QuickAdd.
          </div>
        ) : (
          <ul className="space-y-1 list-none p-0 m-0">
            {ordered.map((entry) => {
              const cat = catConfig[entry.category];
              const hasCpu = entry.cpuLoad > 0;
              const hasLatency = entry.latencyMs > 0;

              return (
                <li
                  key={entry.id}
                  className={`flex items-start gap-2 px-2 py-2 rounded border transition-colors ${
                    entry.bypassed
                      ? "border-white/5 opacity-50"
                      : "border-white/5 bg-surface/50 hover:bg-elevated hover:border-white/10"
                  }`}
                >
                  {/* Category colour bar — narrow vertical swatch */}
                  <div
                    className="w-0.5 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: cat?.hex ?? "#5a5a5e" }}
                    aria-hidden
                  />

                  <div className="flex-1 min-w-0">
                    {/* Name + status badges */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="text-[11px] text-text-primary font-medium leading-tight">
                        {entry.name}
                      </span>
                      {entry.format && (
                        <span className="text-[9px] text-text-dim uppercase tracking-wide">
                          {entry.format}
                        </span>
                      )}
                      {entry.bypassed && (
                        <span className="text-[9px] text-accent-orange/70 uppercase tracking-wide">
                          BYP
                        </span>
                      )}
                      {entry.muted && (
                        <span className="text-[9px] text-text-dim uppercase tracking-wide">
                          MUTE
                        </span>
                      )}
                    </div>

                    {/* Metrics row — CPU bar + latency (or category label if idle) */}
                    <div className="flex items-center gap-2">
                      {hasCpu ? (
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          {/* Mini CPU bar (inset-shadowed track) */}
                          <div
                            className="flex-1 h-1 rounded-full overflow-hidden"
                            style={{
                              backgroundColor: "#141418",
                              boxShadow:
                                "inset 1px 1px 3px rgba(0,0,0,0.5)",
                            }}
                          >
                            <div
                              className={`h-full rounded-full ${
                                entry.cpuLoad > 15
                                  ? "bg-gradient-to-r from-accent-orange to-error"
                                  : "bg-gradient-to-r from-accent-teal to-accent-blue"
                              }`}
                              style={{
                                width: `${Math.min(100, entry.cpuLoad * 5)}%`,
                              }}
                            />
                          </div>
                          <span className="text-[9px] text-text-dim tabular shrink-0">
                            {entry.cpuLoad.toFixed(1)}%
                          </span>
                        </div>
                      ) : null}
                      {hasLatency ? (
                        <span className="text-[9px] text-text-dim shrink-0 tabular">
                          {entry.latencyMs.toFixed(1)} ms
                        </span>
                      ) : null}
                      {!hasCpu && !hasLatency && (
                        <span className="text-[9px] text-text-dim">
                          {cat?.label ?? entry.category}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Footer health bar (mirrors LiveHealth CPU meter style) ── */}
      <div
        className="px-3 py-2.5 border-t border-white/5 shrink-0"
        style={{ backgroundColor: "#1a1a1e" }}
      >
        {/* CPU label + value */}
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-text-secondary uppercase tracking-wide">
            CPU
          </span>
          <span
            className={`tabular font-medium ${
              health.cpu > 85 ? "text-error" : "text-accent-teal"
            }`}
          >
            {health.cpu.toFixed(0)}%
          </span>
        </div>

        {/* CPU gradient bar — same visual language as LiveHealth */}
        <div
          className="h-1.5 rounded-full overflow-hidden mb-2.5"
          style={{
            backgroundColor: "#141418",
            boxShadow:
              "inset 2px 2px 4px rgba(0,0,0,0.4), inset -1px -1px 3px rgba(255,255,255,0.05)",
          }}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${
              health.cpu > 85
                ? "bg-gradient-to-r from-accent-orange to-error"
                : "bg-gradient-to-r from-accent-teal to-accent-blue"
            }`}
            style={{ width: `${health.cpu}%` }}
            role="progressbar"
            aria-valuenow={health.cpu}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="CPU load"
          />
        </div>

        {/* Device name + sample rate + output peak LED */}
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              health.cpu > 85 ? "bg-error" : "bg-accent-teal"
            }`}
          />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium text-text-primary truncate block">
              {health.clock !== "—" ? health.clock : "Audio device"}
            </span>
            <span className="text-[10px] text-text-secondary tracking-tight truncate block">
              {health.sampleRateLabel !== "—" ? health.sampleRateLabel : "—"}
              {typeof health.buffer === "number" && health.buffer > 0
                ? ` · ${health.buffer} smp`
                : ""}
            </span>
          </div>

          {/* 4-bar output peak ladder (same LED-ladder idiom as LiveHealth) */}
          <div
            className="flex gap-0.5 h-4 items-end shrink-0"
            aria-label={`Output peak: ${Math.round(outputPeak * 100)}%`}
          >
            {([0, 0.25, 0.5, 0.75] as const).map((threshold, i) => {
              const active = outputPeak > threshold;
              return (
                <div
                  key={i}
                  className="w-1 rounded-full"
                  style={{
                    height: `${25 + i * 20}%`,
                    backgroundColor:
                      active
                        ? outputPeak > 0.9
                          ? "#ef4444"
                          : "#2BC4C4"
                        : "#3a3a3e",
                    opacity: active ? 0.5 + i * 0.15 : 0.25,
                    transition: "background-color 100ms ease",
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
