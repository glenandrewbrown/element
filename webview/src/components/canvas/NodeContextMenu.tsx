import { useCallback, useEffect, useRef, useState } from "react";
import { useGraphStore } from "../../stores/useGraphStore";
import {
  nativeGraphDuplicateNodes,
  nativeGraphRemoveNode,
  nativeGraphRenameNode,
} from "../../bridge/nativeGraph";

const ICON_COPY =
  "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z";
const ICON_DELETE =
  "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z";
const ICON_EDIT =
  "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z";
const ICON_BYPASS =
  "M13 7.83c.85.3 1.53.98 1.83 1.83L21 3l-6.5 6.5c-.3-.85-.98-1.53-1.83-1.83L13 7.83zm-6.83 3.5c-.3.85-.98 1.53-1.83 1.83L10 18.67c.85-.3 1.53-.98 1.83-1.83l-5.66-5.51zm10.5 2c-.85.3-1.53.98-1.83 1.83L21 21l-6.5-6.5c.3-.85.98-1.53 1.83-1.83l-.66-.67z";
const ICON_MUTE =
  "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3z";
const ICON_INPUT =
  "M3 13h8v8h2v-8h8v-2h-8V3h-2v8H3v2z";

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

interface NodeContextMenuProps {
  nodeId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function NodeContextMenu({
  nodeId,
  position,
  onClose,
}: NodeContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId));
  const toggleBypass = useGraphStore((s) => s.toggleBypass);
  const toggleMute = useGraphStore((s) => s.toggleMute);
  const toggleMuteInput = useGraphStore((s) => s.toggleMuteInput);

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

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.min(position.x, window.innerWidth - 220),
    top: Math.min(position.y, window.innerHeight - 260),
    zIndex: 9999,
  };

  const handleDuplicate = useCallback(() => {
    void nativeGraphDuplicateNodes([nodeId]);
    onClose();
  }, [nodeId, onClose]);

  const handleDelete = useCallback(() => {
    void nativeGraphRemoveNode(nodeId);
    onClose();
  }, [nodeId, onClose]);

  const handleRename = useCallback(() => {
    if (!node) return;
    setNewName(node.name);
    setRenaming(true);
  }, [node]);

  const submitRename = useCallback(() => {
    const trimmed = newName.trim();
    if (trimmed.length > 0) {
      void nativeGraphRenameNode(nodeId, trimmed);
    }
    setRenaming(false);
    onClose();
  }, [newName, nodeId, onClose]);

  if (!node) return null;

  const items = [
    {
      icon: ICON_EDIT,
      label: "Rename",
      action: handleRename,
      shortcut: "R",
    },
    {
      icon: ICON_BYPASS,
      label: node.bypassed ? "Enable" : "Bypass",
      action: () => {
        toggleBypass(nodeId);
        onClose();
      },
      shortcut: "B",
      active: node.bypassed,
    },
    {
      icon: ICON_MUTE,
      label: node.muted ? "Unmute" : "Mute",
      action: () => {
        toggleMute(nodeId);
        onClose();
      },
      shortcut: "M",
      active: !!node.muted,
    },
    {
      icon: ICON_INPUT,
      label: node.muteInput ? "Unmute Input" : "Mute Input",
      action: () => {
        toggleMuteInput(nodeId);
        onClose();
      },
      shortcut: "I",
      active: !!node.muteInput,
    },
    {
      icon: ICON_COPY,
      label: "Duplicate",
      action: handleDuplicate,
      shortcut: "D",
    },
    {
      icon: ICON_DELETE,
      label: "Delete",
      action: handleDelete,
      shortcut: "Del",
      danger: true,
    },
  ];

  return (
    <div
      ref={ref}
      style={menuStyle}
      className="w-52 bg-panel border border-white/10 rounded-lg shadow-[-4px_-4px_8px_rgba(255,255,255,0.04),8px_8px_24px_rgba(0,0,0,0.5)] overflow-hidden"
    >
      <div className="px-3 py-2 bg-pressed border-b border-white/5">
        {renaming ? (
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onBlur={submitRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitRename();
              if (event.key === "Escape") {
                setRenaming(false);
                onClose();
              }
            }}
            className="w-full bg-surface px-2 py-1 rounded text-[11px] text-text-primary border border-generator focus:outline-none"
            autoFocus
          />
        ) : (
          <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest truncate block">
            {node.name}
          </span>
        )}
      </div>

      {!renaming && (
        <div className="py-1">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              className={[
                "w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors",
                item.danger
                  ? "text-error hover:bg-error/10"
                  : item.active
                    ? "text-modifier hover:bg-modifier/10"
                    : "text-text-primary hover:bg-white/5",
              ].join(" ")}
            >
              <Icon d={item.icon} size={14} />
              <span className="flex-1 text-left">{item.label}</span>
              <span className="text-[10px] text-text-dim">{item.shortcut}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
