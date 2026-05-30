import { useGraphStore, selectNodes } from "../../stores/useGraphStore";
import {
  usePerformStore,
  selectSessionName,
  selectLiveHealth,
} from "../../stores/usePerformStore";
import { NeuBadge, Icon } from "../neu";

const categoryDot: Record<string, string> = {
  generator: "bg-generator",
  modifier: "bg-modifier",
  logic: "bg-logic",
};

/**
 * Perform-mode left rail giving a flat, read-only roster of every Block on the
 * active Board, ordered top-to-bottom / left-to-right by canvas position and
 * colour-dotted by category (generator/modifier/logic). Use it on stage to scan
 * the signal chain at a glance and watch the live audio-device/CPU footer
 * without diving into the Board. It surfaces state — it does not edit the graph.
 */
export function QuickAccess() {
  const nodes = useGraphStore(selectNodes);
  const projectName = usePerformStore(selectSessionName);
  const health = usePerformStore(selectLiveHealth);

  const ordered = [...nodes].sort((a, b) => {
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    return a.position.x - b.position.x;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">
            Quick Access
          </span>
          <Icon name="Search" size={16} className="text-text-secondary" aria-hidden />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between p-2 rounded bg-surface text-generator shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)]">
            <div className="flex items-center gap-2 min-w-0">
              <Icon name="Network" size={16} className="shrink-0" aria-hidden />
              <span className="text-[11px] font-medium truncate">
                {projectName}
              </span>
            </div>
            <NeuBadge text="Active" color="blue" />
          </div>

          <div className="p-2 rounded text-text-secondary opacity-60 hover:opacity-100 hover:bg-elevated cursor-pointer flex items-center gap-2 transition-opacity">
            <Icon name="Folder" size={16} aria-hidden />
            <span className="text-[11px]">User Presets (File menu)</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="text-[10px] text-text-secondary uppercase tracking-widest px-2 py-3">
          Blocks on board
        </div>
        <div className="space-y-1">
          {ordered.length === 0 ? (
            <div className="px-3 py-4 text-[10px] text-text-dim text-center">
              No blocks yet — add from the palette or QuickAdd.
            </div>
          ) : (
            ordered.map((entry) => (
              <div
                key={entry.id}
                className="group flex items-center gap-3 px-3 py-2 bg-surface/50 hover:bg-elevated rounded border border-white/5 transition-all cursor-default"
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${categoryDot[entry.category] ?? "bg-text-dim"}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-text-primary truncate">
                    {entry.name}
                  </div>
                  <div className="text-[10px] text-text-secondary">
                    {entry.format}
                    {entry.bypassed ? " · bypassed" : ""}
                  </div>
                </div>
                <span className="text-text-secondary hidden group-hover:block shrink-0">
                  <Icon name="GripVertical" size={14} aria-label="Drag handle" />
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="p-3 bg-pressed border-t border-white/5">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${health.cpu > 85 ? "bg-error" : "bg-logic"}`}
          />
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-bold text-text-primary tracking-tight truncate">
              {health.clock !== "—" ? health.clock : "Audio device"}
            </span>
            <span className="text-[10px] text-text-secondary uppercase tracking-tighter truncate">
              CPU {health.cpu.toFixed(0)}% · {health.sampleRateLabel} ·{" "}
              {typeof health.buffer === "number" && health.buffer > 0
                ? `${health.buffer} smp`
                : "buffer —"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
