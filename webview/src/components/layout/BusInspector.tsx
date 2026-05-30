import { useCallback, useMemo, useState } from "react";
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

// Signal-type colour palette — mirrors cable colours from index.css
const signalColour: Record<string, string> = {
  audio: "#4A90D9",
  midi: "#2BC4C4",
  value: "#E8A838",
};

const signalLabel: Record<string, string> = {
  audio: "AUDIO",
  midi: "MIDI",
  value: "VALUE",
};

// ── Endpoint chip ─────────────────────────────────────────────────────────────
//
// Each cable endpoint renders as a small colour-coded chip.
//   direction="source" → blue  "bus-sender-highlight" class
//   direction="target" → teal  "bus-receiver-highlight" class
//   orphan (block gone from graph) → amber warning chip "bus-orphan-endpoint"
//
// The CSS class names are intentionally public: Storybook play functions and
// future keyboard/AX workflows query them directly.

interface EndpointChipProps {
  label: string;
  portId: string;
  direction: "source" | "target";
  isOrphan: boolean;
}

function EndpointChip({
  label,
  portId,
  direction,
  isOrphan,
}: EndpointChipProps) {
  if (isOrphan) {
    return (
      <span
        className="bus-orphan-endpoint inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium shrink-0"
        style={{
          background: "rgba(232,168,56,0.12)",
          border: "1px solid rgba(232,168,56,0.28)",
          color: "#E8A838",
        }}
        title="Block not found — may have been removed from this Board"
      >
        <span aria-label="Warning">⚠</span>
        <span className="font-bold">?</span>
        <span style={{ opacity: 0.6 }}>:{portId}</span>
      </span>
    );
  }

  const isSender = direction === "source";
  const chipColour = isSender ? "#4A90D9" : "#2BC4C4";
  const dirArrow = isSender ? "↑" : "↓";
  const highlightClass = isSender
    ? "bus-sender-highlight"
    : "bus-receiver-highlight";

  return (
    <span
      className={`${highlightClass} inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium shrink-0`}
      style={{
        background: isSender
          ? "rgba(74,144,217,0.1)"
          : "rgba(43,196,196,0.1)",
        border: `1px solid ${chipColour}28`,
        color: chipColour,
      }}
      title={`${isSender ? "Sends into" : "Receives from"} bus`}
    >
      <span aria-hidden="true">{dirArrow}</span>
      <span className="font-semibold text-[#E5E5EA]">{label}</span>
      <span style={{ opacity: 0.55 }}>:{portId}</span>
    </span>
  );
}

// ── Drag-drop zone ────────────────────────────────────────────────────────────
//
// Story-level affordance — no live C++ wiring (GATE B-C).
// The element carries `data-drag-target="bus-drop"` for Storybook play
// function assertions and future pointer-event listeners.

interface BusDragDropZoneProps {
  busName: string;
  /** Called with the bus name when a drag is dropped. Story-level callback. */
  onDrop?: (busName: string) => void;
}

function BusDragDropZone({ busName, onDrop }: BusDragDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      onDrop?.(busName);
    },
    [busName, onDrop],
  );

  return (
    <div
      role="region"
      aria-label={`Drop signal here to add to ${busName} bus`}
      data-drag-target="bus-drop"
      data-bus-name={busName}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={[
        "flex items-center justify-center gap-2 mt-1",
        "px-3 py-2 rounded",
        "text-[11px] font-medium transition-all duration-150 cursor-default select-none",
        "border border-dashed",
      ].join(" ")}
      style={{
        background: dragOver ? "rgba(74,144,217,0.08)" : "transparent",
        borderColor: dragOver
          ? "rgba(74,144,217,0.55)"
          : "rgba(255,255,255,0.13)",
        color: dragOver ? "#4A90D9" : "#8E8E93",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 14 }}>
        ⊕
      </span>
      <span>Drag a cable here to add to this bus</span>
    </div>
  );
}

// ── Bus row ───────────────────────────────────────────────────────────────────

function BusRow({
  bus,
  blockNames,
  onSelect,
  onDissolve,
  onDrop,
}: {
  bus: BusEntry;
  blockNames: Map<string, string>;
  onSelect: () => void;
  onDissolve: () => void;
  onDrop?: (busName: string) => void;
}) {
  const colour = signalColour[bus.signalType] ?? signalColour.audio;
  const sigLabel = signalLabel[bus.signalType] ?? "AUDIO";

  const sources = bus.endpoints.filter((e) => e.direction === "source");
  const targets = bus.endpoints.filter((e) => e.direction === "target");

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: "#222226",
        boxShadow:
          "inset 2px 2px 6px rgba(0,0,0,0.4), inset -1px -1px 4px rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* ── Row header ── */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Name button — selects first cable */}
        <button
          type="button"
          onClick={onSelect}
          title="Select cable"
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
        >
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{
              background: colour,
              boxShadow: `0 0 6px ${colour}55`,
            }}
          />
          <span
            className="text-[13px] font-bold uppercase tracking-tight truncate"
            style={{ color: colour }}
          >
            {bus.name}
          </span>
        </button>

        {/* Signal type badge */}
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
          style={{
            background: `${colour}18`,
            color: colour,
            border: `1px solid ${colour}2E`,
          }}
        >
          {sigLabel}
        </span>

        {/* Cable count */}
        <span className="text-[11px] text-text-secondary tabular shrink-0">
          {bus.cableIds.length} cbl
        </span>

        {/* Dissolve */}
        <button
          type="button"
          onClick={onDissolve}
          title="Make all wired"
          aria-label="Dissolve bus"
          className="text-[13px] text-text-dim hover:text-error transition-colors ml-0.5 shrink-0 leading-none"
        >
          ✕
        </button>
      </div>

      {/* ── Senders / Receivers ── */}
      <div
        className="px-3 pb-3 space-y-2.5"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        {/* Senders section */}
        {sources.length > 0 && (
          <div className="pt-2.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-1.5">
              Senders
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sources.map((ep) => {
                const name = blockNames.get(ep.blockId);
                return (
                  <EndpointChip
                    key={`src-${ep.blockId}-${ep.portId}`}
                    label={name ?? "?"}
                    portId={ep.portId}
                    direction="source"
                    isOrphan={name === undefined}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Receivers section */}
        {targets.length > 0 && (
          <div className={sources.length === 0 ? "pt-2.5" : ""}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-1.5">
              Receivers
            </div>
            <div className="flex flex-wrap gap-1.5">
              {targets.map((ep) => {
                const name = blockNames.get(ep.blockId);
                return (
                  <EndpointChip
                    key={`tgt-${ep.blockId}-${ep.portId}`}
                    label={name ?? "?"}
                    portId={ep.portId}
                    direction="target"
                    isOrphan={name === undefined}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* No endpoints yet — show placeholder row */}
        {sources.length === 0 && targets.length === 0 && (
          <div className="pt-2.5 text-[11px] text-text-dim italic">
            No endpoints resolved.
          </div>
        )}

        {/* Drop zone — always shown */}
        <BusDragDropZone busName={bus.name} onDrop={onDrop} />
      </div>
    </div>
  );
}

// ── BusInspector (public export) ─────────────────────────────────────────────

/**
 * G-05 — Wireless Bus Inspector (blueprint §7.2.8, Wave B / Task 14).
 *
 * Lists every named wireless bus active on the current Board. Rendered
 * inside the InspectorHub empty-state alongside the Project Overview.
 *
 * Each bus row shows:
 *   • Bus name + signal-type glow swatch + type badge
 *   • Cable count
 *   • Senders section — source-side endpoint chips (`.bus-sender-highlight`)
 *   • Receivers section — target-side endpoint chips (`.bus-receiver-highlight`)
 *   • Orphan endpoints (block removed) → amber warning chip
 *   • Drag-drop zone (`data-drag-target="bus-drop"`) for future cable
 *     assignment — story-level only; live C++ wiring confirmed at GATE B-C.
 *
 * Interaction:
 *   • Click bus name → select its first cable
 *   • ✕ button → dissolve (all cables back to wired)
 */
export function BusInspector() {
  const edges = useGraphStore(selectEdges);
  const nodes = useGraphStore(selectNodes);
  const cableBus = useBusStore(selectCableBusMap);
  const setBusForCable = useBusStore((s) => s.setBusForCable);
  const selectEdgeOnGraph = useGraphStore((s) => s.selectEdge);

  const buses = useMemo(
    () => deriveBuses(edges, cableBus),
    [edges, cableBus],
  );

  const blockNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) m.set(n.id, n.name);
    return m;
  }, [nodes]);

  const dissolveBus = useCallback(
    (bus: BusEntry) => {
      for (const cableId of bus.cableIds) {
        setBusForCable(cableId, undefined);
        void nativeGraphSetCableBus(cableId, "");
      }
    },
    [setBusForCable],
  );

  // ── Empty state ──────────────────────────────────────────────────────────
  if (buses.length === 0) {
    return (
      <div className="space-y-3">
        <div className="text-[12px] font-bold text-text-secondary uppercase tracking-widest">
          Wireless Buses
        </div>
        <div
          className="rounded-lg p-4 text-center space-y-2"
          style={{
            background: "#1E1E22",
            border: "1px dashed rgba(255,255,255,0.11)",
          }}
        >
          <div
            className="text-[22px] leading-none"
            style={{ opacity: 0.18 }}
            aria-hidden="true"
          >
            ⊃⊂
          </div>
          <div className="text-[12px] text-text-secondary leading-relaxed">
            No named buses on this Board.
          </div>
          <div className="text-[11px] text-text-dim leading-relaxed">
            Right-click a cable and choose{" "}
            <em className="text-text-secondary not-italic font-semibold">
              Make Wireless…
            </em>{" "}
            to route signal through a named bus. Ideal for reverb sends and
            dense parallel chains.
          </div>
        </div>
      </div>
    );
  }

  // ── Populated state ──────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold text-text-secondary uppercase tracking-widest">
          Wireless Buses
        </span>
        <span
          className="text-[11px] font-bold px-1.5 py-0.5 rounded tabular"
          style={{
            background: "rgba(255,255,255,0.06)",
            color: "#8E8E93",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {buses.length}
        </span>
      </div>

      {/* Bus rows */}
      <div className="space-y-2">
        {buses.map((bus) => (
          <BusRow
            key={bus.name}
            bus={bus}
            blockNames={blockNames}
            onSelect={() => {
              if (bus.cableIds.length > 0)
                selectEdgeOnGraph(bus.cableIds[0]);
            }}
            onDissolve={() => dissolveBus(bus)}
          />
        ))}
      </div>
    </div>
  );
}
