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

const ICON_BROADCAST =
  "M7.76 16.24l1.42-1.42a4 4 0 0 1 0-5.66L7.76 7.76a6 6 0 0 0 0 8.48zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm4.24-6.24l-1.42 1.42a4 4 0 0 1 0 5.66l1.42 1.42a6 6 0 0 0 0-8.48zM4.93 4.93a8 8 0 0 0 0 11.31l1.42-1.41a6 6 0 0 1 0-8.49L4.93 4.93zm14.14 0L17.66 6.34a6 6 0 0 1 0 8.49l1.41 1.41a8 8 0 0 0 0-11.31z";
const ICON_RENAME =
  "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z";
const ICON_DELETE =
  "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z";
const ICON_WIRED =
  "M4 12h16M2 9l3 3-3 3M22 9l-3 3 3 3";

function Icon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d={d} />
    </svg>
  );
}

export interface EdgeContextMenuProps {
  edgeId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

/**
 * Phase 5B — right-click context menu for cables.
 *
 * Provides four operations matching the wireless patching UX:
 *   • Make Wireless          — moves the cable to a named bus (auto-named if
 *                              no other buses exist; otherwise the user types
 *                              one or picks an existing name).
 *   • Rename Bus             — only when the cable is already wireless.
 *   • Make Wired             — drops the bus name; cable visual returns.
 *   • Delete                 — removes the underlying engine connection.
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
  const isWireless = Boolean(currentBus);

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

  const handleMakeWireless = useCallback(() => {
    setName(suggestBusName(buses.map((b) => b.name)));
    setEditing(true);
  }, [buses]);

  const handleRenameBus = useCallback(() => {
    setName(currentBus ?? "");
    setEditing(true);
  }, [currentBus]);

  const handleMakeWired = useCallback(() => {
    persist("");
    onClose();
  }, [persist, onClose]);

  const handleDelete = useCallback(() => {
    if (!edge) return;
    void nativeGraphDisconnect(edge.source, edge.sourcePort, edge.target, edge.targetPort);
    persist(""); // clean up the bus map even if the engine call lags
    onClose();
  }, [edge, persist, onClose]);

  const submitName = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed.length > 0) persist(trimmed);
    setEditing(false);
    onClose();
  }, [name, persist, onClose]);

  if (!edge) return null;

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.min(position.x, window.innerWidth - 240),
    top: Math.min(position.y, window.innerHeight - 220),
    zIndex: 9999,
  };

  return (
    <div
      ref={ref}
      style={menuStyle}
      className="w-56 bg-panel border border-white/10 rounded-lg shadow-[-4px_-4px_8px_rgba(255,255,255,0.04),8px_8px_24px_rgba(0,0,0,0.5)] overflow-hidden"
    >
      <div className="px-3 py-2 bg-pressed border-b border-white/5">
        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
          {isWireless ? `Bus · ${currentBus}` : "Cable"}
        </span>
      </div>

      {editing ? (
        <div className="p-2 space-y-1.5">
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
            placeholder="Bus name (e.g. Reverb Send A)"
            className="w-full bg-surface px-2 py-1 rounded text-[11px] text-text-primary border border-generator focus:outline-none"
            autoFocus
          />
          {buses.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {buses.map((b) => (
                <button
                  key={b.name}
                  type="button"
                  onClick={() => setName(b.name)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-text-secondary hover:text-text-primary border border-white/5"
                >
                  {b.name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                onClose();
              }}
              className="text-[10px] px-2 py-0.5 text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitName}
              className="text-[10px] px-2 py-0.5 rounded bg-generator/20 text-generator hover:bg-generator/30"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="py-1">
          {isWireless ? (
            <>
              <MenuItem
                icon={ICON_RENAME}
                label="Rename Bus"
                onClick={handleRenameBus}
              />
              <MenuItem
                icon={ICON_WIRED}
                label="Make Wired"
                onClick={handleMakeWired}
              />
            </>
          ) : (
            <MenuItem
              icon={ICON_BROADCAST}
              label="Make Wireless…"
              onClick={handleMakeWireless}
            />
          )}
          <MenuItem
            icon={ICON_DELETE}
            label="Delete Cable"
            onClick={handleDelete}
            danger
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors",
        danger
          ? "text-error hover:bg-error/10"
          : "text-text-primary hover:bg-white/5",
      ].join(" ")}
    >
      <Icon d={icon} size={14} />
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}
