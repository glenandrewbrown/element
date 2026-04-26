import { usePerformStore, selectLiveHealth } from "../../stores/usePerformStore";

const ICON_SPEAKER =
  "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z";
const ICON_CLOCK =
  "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z";
const ICON_MEMORY =
  "M15 9H9v6h6V9zm-2 4h-2v-2h2v2zm8-2V9h-2V7c0-1.1-.9-2-2-2h-2V3h-2v2h-2V3H9v2H7c-1.1 0-2 .9-2 2v2H3v2h2v2H3v2h2v2c0 1.1.9 2 2 2h2v2h2v-2h2v2h2v-2h2c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2zm-4 6H7V7h10v10z";

function Icon({
  d,
  size = 14,
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

export function StatusBar() {
  const health = usePerformStore(selectLiveHealth);

  const deviceName =
    health.clock && health.clock !== "—" ? health.clock : "Default Device";
  const sampleRate = health.sampleRateLabel || "—";
  const buffer =
    typeof health.buffer === "number" && health.buffer > 0
      ? `${health.buffer} spl`
      : "—";
  const latency =
    typeof health.latency === "number" && health.latency > 0
      ? `${health.latency.toFixed(1)} ms`
      : "—";
  const cpuPercent = health.cpu;
  const engineRunning = cpuPercent > 0;

  return (
    <div className="h-6 bg-pressed border-t border-white/5 flex items-center justify-between px-4 text-[10px] select-none">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 text-text-secondary min-w-0">
          <Icon d={ICON_SPEAKER} size={12} />
          <span className="font-medium truncate max-w-[140px]" title={deviceName}>
            {deviceName}
          </span>
        </div>

        <div className="h-3 w-px bg-white/10" />

        <div className="flex items-center gap-1.5">
          <div
            className={[
              "w-2 h-2 rounded-full",
              engineRunning
                ? "bg-logic shadow-[0_0_6px_rgba(43,196,196,0.5)]"
                : "bg-text-secondary",
            ].join(" ")}
          />
          <span className={engineRunning ? "text-logic font-bold" : "text-text-secondary"}>
            {engineRunning ? "RUNNING" : "STOPPED"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1.5 text-text-secondary">
          <span className="opacity-60">SAMPLE</span>
          <span className="text-text-primary font-bold">{sampleRate}</span>
        </div>
        <div className="flex items-center gap-1.5 text-text-secondary">
          <span className="opacity-60">BUFFER</span>
          <span className="text-text-primary font-bold">{buffer}</span>
        </div>
        <div className="flex items-center gap-1.5 text-text-secondary">
          <span className="opacity-60">LATENCY</span>
          <span className="text-logic font-bold">{latency}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Icon d={ICON_MEMORY} size={12} className="text-text-secondary" />
          <div className="flex items-center gap-1">
            <span className="text-text-secondary opacity-60">CPU</span>
            <span
              className={[
                "font-bold",
                cpuPercent > 80
                  ? "text-error"
                  : cpuPercent > 50
                    ? "text-modifier"
                    : "text-logic",
              ].join(" ")}
            >
              {cpuPercent.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="h-3 w-px bg-white/10" />

        <div className="flex items-center gap-1.5">
          <Icon d={ICON_CLOCK} size={12} className="text-text-secondary" />
          <span className="text-text-primary font-bold tabular">
            {health.timecode || "00:00:00:00"}
          </span>
        </div>
      </div>
    </div>
  );
}
