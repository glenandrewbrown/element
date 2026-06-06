import { usePerformStore } from "../../../stores/usePerformStore";

/**
 * CPU meter footer — the only item in the footer strip.
 * "Recent Projects" moves to the Projects tab; nothing else lives here.
 */
export function PaletteFooter() {
  const cpuLoad = usePerformStore((s) => s.liveHealth.cpu);

  return (
    <div className="p-4 border-t border-white/5 bg-pressed shrink-0">
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-end">
          <span className="text-[10px] text-text-secondary">CPU LOAD</span>
          <span className="text-[10px] text-accent-teal font-bold tabular">
            {cpuLoad.toFixed(1)}%
          </span>
        </div>
        <div className="w-full h-1.5 bg-[#131317] rounded-full neu-inset overflow-hidden">
          <div
            className="h-full bg-accent-teal rounded-full"
            style={{
              width: `${Math.min(100, Math.max(0, cpuLoad))}%`,
              boxShadow: "0 0 8px rgba(43, 196, 196, 0.4)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
