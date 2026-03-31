import {
  usePerformStore,
  selectLiveHealth,
  selectAlerts,
} from "../../stores/usePerformStore";

// ── Icons ──

const ICON_HEART =
  "M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z";
const ICON_WARNING = "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z";

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

// ── I/O meter bars ──

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
        <Icon d={ICON_HEART} size={16} className="text-logic" />
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
            <div className="bg-pressed p-2 rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]">
              <span className="text-[10px] text-text-secondary block mb-1">
                INPUT
              </span>
              <MeterBars heights={[20, 60, 45, 10]} color="#4A90D9" />
            </div>
            <div className="bg-pressed p-2 rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]">
              <span className="text-[10px] text-text-secondary block mb-1">
                OUTPUT
              </span>
              <MeterBars heights={[80, 55, 70, 5]} color="#2BC4C4" />
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
              {health.buffer} SPL
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
              d={ICON_WARNING}
              size={18}
              className="text-modifier shrink-0 mt-0.5"
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
