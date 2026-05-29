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
                iconName="Pencil"
                label="Rename Bus"
                onClick={handleRenameBus}
              />
              <MenuItem
                iconName="Plug"
                label="Make Wired"
                onClick={handleMakeWired}
              />
            </>
          ) : (
            <MenuItem
              iconName="Radio"
              label="Make Wireless…"
              onClick={handleMakeWireless}
            />
          )}
          <MenuItem
            iconName="Trash2"
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
  iconName,
  label,
  onClick,
  danger = false,
}: {
  iconName: string;
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
      <Icon name={iconName} size={14} aria-hidden />
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}
