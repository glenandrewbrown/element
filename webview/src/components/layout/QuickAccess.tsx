import { useGraphStore, selectNodes } from "../../stores/useGraphStore";
import {
  usePerformStore,
  selectSessionName,
  selectLiveHealth,
} from "../../stores/usePerformStore";
import { NeuBadge } from "../neu";

const ICON_TREE = "M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3z";
const ICON_FOLDER =
  "M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z";
const ICON_SEARCH =
  "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z";
const ICON_DRAG =
  "M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z";

function Icon({
  d,
  size = 16,
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

const categoryDot: Record<string, string> = {
  generator: "bg-generator",
  modifier: "bg-modifier",
  logic: "bg-logic",
};

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
          <Icon d={ICON_SEARCH} size={16} className="text-text-secondary" />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between p-2 rounded bg-surface text-generator shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)]">
            <div className="flex items-center gap-2 min-w-0">
              <Icon d={ICON_TREE} size={16} className="shrink-0" />
              <span className="text-[11px] font-medium truncate">
                {projectName}
              </span>
            </div>
            <NeuBadge text="Active" color="blue" />
          </div>

          <div className="p-2 rounded text-text-secondary opacity-60 hover:opacity-100 hover:bg-elevated cursor-pointer flex items-center gap-2 transition-opacity">
            <Icon d={ICON_FOLDER} size={16} />
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
                  <Icon d={ICON_DRAG} size={14} />
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
                ? `${health.buffer} spl`
                : "buffer —"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
