import { useState, useCallback, useEffect, useRef } from "react";
import { useGraphStore } from "../../stores/useGraphStore";
import {
  nativeGraphSetNodeColor,
  nativeGraphDuplicateNodes,
  nativeGraphRemoveNodes,
  nativeGraphRenameNode,
} from "../../bridge/nativeGraph";

// ── Icons ──

const ICON_PALETTE =
  "M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z";
const ICON_COPY =
  "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z";
const ICON_DELETE =
  "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z";
const ICON_EDIT =
  "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z";
const ICON_BYPASS =
  "M13 7.83c.85.3 1.53.98 1.83 1.83L21 3l-6.5 6.5c-.3-.85-.98-1.53-1.83-1.83L13 7.83zm-6.83 3.5c-.3.85-.98 1.53-1.83 1.83L10 18.67c.85-.3 1.53-.98 1.83-1.83l-5.66-5.51zm10.5 2c-.85.3-1.53.98-1.83 1.83L21 21l-6.5-6.5c.3-.85.98-1.53 1.83-1.83l-.66-.67z";
const ICON_MUTE =
  "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z";
const ICON_SOLO =
  "M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z";

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

// ── Node color presets (matching JUCE comment box colors) ──

const NODE_COLORS = [
  { name: "Default", hex: "" },
  { name: "Blue", hex: "#4A90D9" },
  { name: "Orange", hex: "#E8A838" },
  { name: "Teal", hex: "#2BC4C4" },
  { name: "Purple", hex: "#9B59B6" },
  { name: "Green", hex: "#27AE60" },
  { name: "Red", hex: "#E74C3C" },
  { name: "Yellow", hex: "#F1C40F" },
];

// ── Context Menu ──

interface NodeContextMenuProps {
  nodeId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function NodeContextMenu({ nodeId, position, onClose }: NodeContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  const node = useGraphStore((s) => s.blocks.find((b) => b.id === nodeId));
  const toggleBypass = useGraphStore((s) => s.toggleBypass);
  const toggleMute = useGraphStore((s) => s.toggleMute);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Position adjustment to keep menu in viewport
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.min(position.x, window.innerWidth - 200),
    top: Math.min(position.y, window.innerHeight - 300),
    zIndex: 9999,
  };

  const handleSetColor = useCallback(
    (color: string) => {
      void nativeGraphSetNodeColor(nodeId, color);
      setShowColorPicker(false);
      onClose();
    },
    [nodeId, onClose]
  );

  const handleDuplicate = useCallback(() => {
    void nativeGraphDuplicateNodes([nodeId]);
    onClose();
  }, [nodeId, onClose]);

  const handleDelete = useCallback(() => {
    void nativeGraphRemoveNodes([nodeId]);
    onClose();
  }, [nodeId, onClose]);

  const handleRename = useCallback(() => {
    if (node) {
      setNewName(node.name);
      setRenaming(true);
    }
  }, [node]);

  const submitRename = useCallback(() => {
    if (newName.trim()) {
      void nativeGraphRenameNode(nodeId, newName.trim());
    }
    setRenaming(false);
    onClose();
  }, [nodeId, newName, onClose]);

  const handleBypass = useCallback(() => {
    toggleBypass(nodeId);
    onClose();
  }, [nodeId, toggleBypass, onClose]);

  const handleMute = useCallback(() => {
    toggleMute(nodeId);
    onClose();
  }, [nodeId, toggleMute, onClose]);

  if (!node) return null;

  const menuItems = [
    {
      icon: ICON_EDIT,
      label: "Rename",
      action: handleRename,
      shortcut: "R",
    },
    {
      icon: ICON_PALETTE,
      label: "Color",
      action: () => setShowColorPicker(true),
      shortcut: "",
      hasSubmenu: true,
    },
    { divider: true },
    {
      icon: ICON_BYPASS,
      label: node.bypassed ? "Enable" : "Bypass",
      action: handleBypass,
      shortcut: "B",
      active: node.bypassed,
    },
    {
      icon: ICON_MUTE,
      label: node.muted ? "Unmute" : "Mute",
      action: handleMute,
      shortcut: "M",
      active: node.muted,
    },
    { divider: true },
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
      className="w-48 bg-panel border border-white/10 rounded-lg shadow-[8px_8px_24px_rgba(0,0,0,0.5)] overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 py-2 bg-pressed border-b border-white/5">
        {renaming ? (
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") {
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

      {/* Color picker submenu */}
      {showColorPicker ? (
        <div className="p-2">
          <button
            type="button"
            className="w-full text-left text-[10px] text-text-secondary hover:text-text-primary mb-2"
            onClick={() => setShowColorPicker(false)}
          >
            &larr; Back
          </button>
          <div className="grid grid-cols-4 gap-1.5">
            {NODE_COLORS.map((color) => (
              <button
                key={color.name}
                type="button"
                className={[
                  "w-8 h-8 rounded border-2 transition-all",
                  color.hex
                    ? "hover:scale-110"
                    : "bg-surface border-dashed border-white/20",
                  node.hostColor === color.hex
                    ? "border-white ring-2 ring-white/30"
                    : "border-transparent",
                ].join(" ")}
                style={color.hex ? { backgroundColor: color.hex } : undefined}
                title={color.name}
                onClick={() => handleSetColor(color.hex)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="py-1">
          {menuItems.map((item, i) =>
            "divider" in item ? (
              <div key={i} className="h-px bg-white/5 my-1" />
            ) : (
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
                {item.shortcut && (
                  <span className="text-[9px] text-text-dim">{item.shortcut}</span>
                )}
                {item.hasSubmenu && (
                  <span className="text-text-dim">&rarr;</span>
                )}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
