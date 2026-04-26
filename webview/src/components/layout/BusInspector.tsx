import { useMemo } from "react";
import {
  useGraphStore,
  selectEdges,
  selectNodes,
} from "../../stores/useGraphStore";
import {
  deriveBuses,
  selectCableBusMap,
  useBusStore,
  type BusEntry,
} from "../../stores/useBusStore";
import { nativeGraphSetCableBus } from "../../bridge/nativeGraph";

const portColorMap: Record<string, string> = {
  audio: "#4A90D9",
  midi: "#2BC4C4",
  value: "#E8A838",
};

/**
 * Phase 5B — Wireless bus inspector (blueprint §7.2.8).
 *
 * Lists every named bus currently active on the board. Renders inside the
 * Inspector empty-state, alongside the Project Overview, so the user has a
 * single place to audit "where is signal going wirelessly?". Each row shows:
 *   • Bus name + signal-type colour swatch
 *   • Cable count
 *   • Endpoints (block name + port direction)
 *   • Click bus → select first cable on the bus
 *   • Click trash → drop every cable from the bus (back to wired)
 *
 * Selection drives Cable.tsx's "ghost preview" so the user sees exactly which
 * route the bus represents.
 */
export function BusInspector() {
  const edges = useGraphStore(selectEdges);
  const nodes = useGraphStore(selectNodes);
  const cableBus = useBusStore(selectCableBusMap);
  const setBusForCable = useBusStore((s) => s.setBusForCable);
  const selectEdgeOnGraph = useGraphStore((s) => s.selectEdge);

  const buses = useMemo(() => deriveBuses(edges, cableBus), [edges, cableBus]);
  const blockNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) m.set(n.id, n.name);
    return m;
  }, [nodes]);

  if (buses.length === 0) {
    return (
      <div className="space-y-2">
        <div className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">
          Wireless Buses
        </div>
        <div className="text-[10px] text-text-dim leading-relaxed">
          Right-click a cable and choose <em>Make Wireless…</em> to reroute
          signal through a named bus instead of a drawn cable. Useful for
          reverb/delay sends and complex parallel chains.
        </div>
      </div>
    );
  }

  const dissolveBus = (bus: BusEntry) => {
    for (const cableId of bus.cableIds) {
      setBusForCable(cableId, undefined);
      void nativeGraphSetCableBus(cableId, "");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-text-secondary uppercase tracking-widest">
          Wireless Buses
        </span>
        <span className="text-[10px] text-text-dim tabular">{buses.length}</span>
      </div>

      <div className="space-y-1.5">
        {buses.map((bus) => (
          <BusRow
            key={bus.name}
            bus={bus}
            blockNames={blockNames}
            onSelect={() => {
              if (bus.cableIds.length > 0) selectEdgeOnGraph(bus.cableIds[0]);
            }}
            onDissolve={() => dissolveBus(bus)}
          />
        ))}
      </div>
    </div>
  );
}

function BusRow({
  bus,
  blockNames,
  onSelect,
  onDissolve,
}: {
  bus: BusEntry;
  blockNames: Map<string, string>;
  onSelect: () => void;
  onDissolve: () => void;
}) {
  const color = portColorMap[bus.signalType] ?? portColorMap.audio;

  // Group endpoints into source/target lists for legibility.
  const sources = bus.endpoints
    .filter((e) => e.direction === "source")
    .map((e) => `${blockNames.get(e.blockId) ?? "?"} → ${e.portId}`);
  const targets = bus.endpoints
    .filter((e) => e.direction === "target")
    .map((e) => `${blockNames.get(e.blockId) ?? "?"} ← ${e.portId}`);

  return (
    <div className="bg-pressed rounded p-2 space-y-1 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSelect}
          className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-80"
          title="Select cable"
        >
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: color, boxShadow: `0 0 4px ${color}80` }}
          />
          <span
            className="text-[11px] font-bold uppercase tracking-tight truncate"
            style={{ color }}
          >
            {bus.name}
          </span>
        </button>
        <span className="text-[10px] text-text-dim tabular shrink-0">
          {bus.cableIds.length} cbl
        </span>
        <button
          type="button"
          onClick={onDissolve}
          title="Make all wired"
          className="text-[10px] text-text-dim hover:text-error transition-colors"
        >
          ✕
        </button>
      </div>
      <div className="text-[9px] text-text-secondary leading-snug">
        {sources.length > 0 ? (
          <div className="truncate">↑ {sources.join(" · ")}</div>
        ) : null}
        {targets.length > 0 ? (
          <div className="truncate">↓ {targets.join(" · ")}</div>
        ) : null}
      </div>
    </div>
  );
}
