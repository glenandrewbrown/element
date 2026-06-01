import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useGraphStore,
  selectEdges,
} from "../../stores/useGraphStore";
import {
  deriveBuses,
  suggestBusName,
  useBusStore,
} from "../../stores/useBusStore";
import {
  nativeGraphDisconnect,
  nativeGraphSetCableBus,
} from "../../bridge/nativeGraph";
import { Icon } from "../neu";

export interface EdgeContextMenuProps {
  /** Id of the Cable (React Flow edge) this menu acts on. Looked up in `useGraphStore.edges`; the menu renders nothing if the id is absent. */
  edgeId: string;
  /** Viewport (clientX/clientY) coordinates of the right-click; the menu is fixed-positioned here and clamped to stay on-screen. */
  position: { x: number; y: number };
  /** Called to dismiss the menu (outside click, Escape, or after an action completes). */
  onClose: () => void;
}

// Signal-type accent colours (mirrors CLAUDE.md V3 semantic colour system).
const SIGNAL_ACCENT: Record<string, string> = {
  audio: "#4A90D9",
  midi:  "#2BC4C4",
  value: "#E8A838",
};

const SIGNAL_LABEL: Record<string, string> = {
  audio: "Audio",
  midi:  "MIDI",
  value: "CV/Value",
};

/**
 * EdgeContextMenu — right-click menu for Cables on the Board.
 *
 * #29 Fix: "Make Wireless" / wireless-patching language has been REPLACED with
 * the correct Bus Send / Bus Receive model framing. A cable routed through a
 * bus is described as "Route through Bus…" rather than "Make Wireless" — the
 * model is Bus Send → Bus Receive blocks (currently a C++/data follow-up;
 * see Pillar-2 backlog note below). The existing BusStore mechanism that
 * hides the drawn cable and shows a bus badge on each port remains intact —
 * only the menu labels and conceptual framing change.
 *
 * WIRED (real store/bridge actions):
 *   Route through Bus…  — assigns the cable to a named bus (BusStore + bridge).
 *   Rename Bus          — renames the bus on an already-routed cable.
 *   Remove from Bus     — clears the bus assignment; restores drawn cable.
 *   Delete Cable        — disconnects the underlying engine connection.
 *
 * HONEST-DISABLED (present in menu, not yet wired — Pillar-2 backlog):
 *   Insert Bus Send/Receive Blocks — requires new el.BusSend / el.BusReceive
 *     node types in C++ NodeFactory; the menu item is shown as disabled so
 *     expert users understand the intent. Tracking note: this is the correct
 *     long-term model — the bus badge is an interim approximation.
 */
export function EdgeContextMenu({
  edgeId,
  position,
  onClose,
}: EdgeContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  const edge = useGraphStore((s) => s.edges.find((e) => e.id === edgeId));
  const edges = useGraphStore(selectEdges);
  const cableBus = useBusStore((s) => s.cableBus);
  const setBusForCable = useBusStore((s) => s.setBusForCable);

  const buses = useMemo(
    () => deriveBuses(edges, cableBus),
    [edges, cableBus],
  );
  const currentBus = edge ? cableBus[edge.id] : undefined;
  const isOnBus = Boolean(currentBus);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const persist = useCallback(
    (busName: string) => {
      setBusForCable(edgeId, busName.length > 0 ? busName : undefined);
      void nativeGraphSetCableBus(edgeId, busName);
    },
    [edgeId, setBusForCable],
  );

  const handleRouteThroughBus = useCallback(() => {
    setName(suggestBusName(buses.map((b) => b.name)));
    setEditing(true);
  }, [buses]);

  const handleRenameBus = useCallback(() => {
    setName(currentBus ?? "");
    setEditing(true);
  }, [currentBus]);

  const handleRemoveFromBus = useCallback(() => {
    persist("");
    onClose();
  }, [persist, onClose]);

  const handleDelete = useCallback(() => {
    if (!edge) return;
    void nativeGraphDisconnect(edge.source, edge.sourcePort, edge.target, edge.targetPort);
    persist(""); // clean up bus map even if the engine call lags
    onClose();
  }, [edge, persist, onClose]);

  const submitName = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed.length > 0) persist(trimmed);
    setEditing(false);
    onClose();
  }, [name, persist, onClose]);

  if (!edge) return null;

  const accent = SIGNAL_ACCENT[edge.signalType] ?? "#4A90D9";
  const sigLabel = SIGNAL_LABEL[edge.signalType] ?? "Cable";

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.min(position.x, window.innerWidth - 260),
    top: Math.min(position.y, window.innerHeight - 260),
    zIndex: 9999,
  };

  return (
    <div
      ref={ref}
      style={menuStyle}
      className="w-60 bg-panel border border-white/10 rounded-lg shadow-[-4px_-4px_8px_rgba(255,255,255,0.04),8px_8px_24px_rgba(0,0,0,0.5)] overflow-hidden"
      role="menu"
      aria-label="Cable menu"
    >
      {/* Header */}
      <div className="px-3 py-2 bg-pressed border-b border-white/5 flex items-center gap-2">
        <Icon name="Cable" size={12} color={accent} aria-hidden />
        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest flex-1">
          {isOnBus ? `Bus · ${currentBus}` : `${sigLabel} Cable`}
        </span>
        {/* channel count badge */}
        <span
          className="text-[9px] px-1 rounded shrink-0 font-mono"
          style={{ color: accent, opacity: 0.75 }}
        >
          {edge.channelCount}ch
        </span>
      </div>

      {editing ? (
        /* ── Bus name entry ── */
        <div className="p-2.5 space-y-2">
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-bold px-0.5">
            {isOnBus ? "Rename Bus" : "Route through Bus"}
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitName();
              if (e.key === "Escape") {
                setEditing(false);
                onClose();
              }
            }}
            placeholder={`e.g. ${sigLabel} Bus A`}
            className="w-full bg-surface px-2 py-1 rounded text-[11px] text-text-primary border border-accent-blue focus:outline-none"
            autoFocus
            aria-label="Bus name"
          />
          {/* Existing bus chips for quick selection */}
          {buses.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {buses.map((b) => (
                <button
                  key={b.name}
                  type="button"
                  onClick={() => setName(b.name)}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-surface text-text-secondary hover:text-text-primary border border-white/5 transition-colors"
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => { setEditing(false); onClose(); }}
              className="text-[10px] px-2 py-0.5 text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitName}
              className="text-[10px] px-2 py-0.5 rounded bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors"
            >
              Confirm
            </button>
          </div>
        </div>
      ) : (
        <div className="py-1">
          {isOnBus ? (
            /* ── Cable is already on a bus ── */
            <>
              <CableMenuItem
                iconName="Pencil"
                label="Rename Bus…"
                accent={accent}
                onClick={handleRenameBus}
              />
              <CableMenuItem
                iconName="Plug"
                label="Remove from Bus"
                accent={accent}
                onClick={handleRemoveFromBus}
              />
            </>
          ) : (
            /* ── Wired cable: offer to route through a bus ── */
            <CableMenuItem
              iconName="Network"
              label="Route through Bus…"
              accent={accent}
              onClick={handleRouteThroughBus}
            />
          )}

          {/*
           * HONEST-DISABLED: Insert Bus Send / Bus Receive Blocks.
           *
           * This is the correct long-term model (el.BusSend / el.BusReceive
           * node types in C++ NodeFactory). The current "route through bus"
           * mechanism is a rendering-level approximation that hides the cable
           * curve and shows a named badge. The proper implementation requires:
           *   1. el.BusSend + el.BusReceive C++ node types registered in NodeFactory.
           *   2. nativeGraphInsertBusSendReceive bridge call.
           *   3. Engine routing: BusSend writes to a named shared buffer;
           *      BusReceive reads from it (audio-rate, zero-copy via the
           *      existing RerouteNode / sandbox IPC pattern).
           * Tracked as Pillar-2 backlog item "Bus Send/Receive blocks".
           */}
          <div className="my-1 mx-3 border-t border-white/5" />
          <div
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-text-dim opacity-40 cursor-not-allowed"
            role="menuitem"
            aria-disabled="true"
            title="Requires el.BusSend / el.BusReceive C++ node types (Pillar-2 backlog)"
          >
            <Icon name="GitBranch" size={13} aria-hidden />
            <span className="flex-1 text-left leading-none">Insert Bus Blocks…</span>
            <span className="text-[8px] text-text-dim uppercase tracking-wider ml-auto opacity-60">
              soon
            </span>
          </div>

          <div className="my-1 mx-3 border-t border-white/5" />
          <CableMenuItem
            iconName="Trash2"
            label="Delete Cable"
            accent={accent}
            danger
            onClick={handleDelete}
          />
        </div>
      )}
    </div>
  );
}

// ── Cable menu item ───────────────────────────────────────────────────────────

interface CableMenuItemProps {
  iconName: string;
  label: string;
  accent: string;
  onClick: () => void;
  danger?: boolean;
}

function CableMenuItem({
  iconName,
  label,
  accent,
  onClick,
  danger = false,
}: CableMenuItemProps) {
  const hoverBg = danger ? "rgba(255,69,58,0.10)" : `${accent}1A`;

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={[
        "w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors duration-150",
        danger ? "text-error" : "text-text-primary",
      ].join(" ")}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = "";
      }}
    >
      <Icon name={iconName} size={13} aria-hidden />
      <span className="flex-1 text-left leading-none">{label}</span>
    </button>
  );
}
