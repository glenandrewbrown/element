import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGraphStore } from "../../stores/useGraphStore";
import type { AlignDirection, DistributeAxis } from "../../stores/useGraphStore";
import {
  nativeGraphDuplicateNodes,
  nativeGraphRemoveNode,
  nativeGraphRenameNode,
} from "../../bridge/nativeGraph";
import { Icon } from "../neu";

interface NodeContextMenuProps {
  /** Id of the right-clicked Block. Looked up in `useGraphStore.nodes`; the menu renders nothing if the id is absent. */
  nodeId: string;
  /** Viewport (clientX/clientY) coordinates of the right-click; the menu is fixed-positioned here and clamped to stay on-screen. */
  position: { x: number; y: number };
  /** Called to dismiss the menu (outside click, Escape, or after an action completes). */
  onClose: () => void;
}

/**
 * NodeContextMenu — the right-click action menu for a Block on the Board. Use
 * it to give expert users fast per-Block operations without leaving the
 * canvas: rename, bypass/enable, mute/unmute (output and input), duplicate, and
 * delete, each with its keyboard shortcut shown. When two or more Blocks are
 * selected it additionally surfaces alignment and (at 3+) distribution tools,
 * read live from React Flow's selection state.
 *
 * Mount it transiently from `GraphCanvas`'s `onNodeContextMenu` handler at the
 * click position; mutations go through `useGraphStore` and the native bridge.
 */
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
  const alignSelectedNodes = useGraphStore((s) => s.alignSelectedNodes);
  const distributeSelectedNodes = useGraphStore(
    (s) => s.distributeSelectedNodes,
  );

  // Multi-selection awareness — block-type only. We re-read on every render
  // because React Flow's selected flags live outside our zustand store.
  const reactFlow = useReactFlow();
  const selectedBlockIds = useMemo(() => {
    return reactFlow
      .getNodes()
      .filter((n) => n.selected && n.type === "block")
      .map((n) => n.id);
    // The right-clicked nodeId changes per menu open, which is exactly when
    // we want to recompute selection — so it's a cheap useful dep.
  }, [reactFlow, nodeId]);
  const multiSelect = selectedBlockIds.length >= 2;
  const canDistribute = selectedBlockIds.length >= 3;

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

  // Estimated menu height: 260px base + ~270px for align/distribute when shown.
  // Slight padding so the menu never clips against the viewport bottom edge.
  const estimatedHeight = multiSelect ? 530 : 260;
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.min(position.x, window.innerWidth - 220),
    top: Math.min(position.y, window.innerHeight - estimatedHeight),
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
      iconName: "Pencil",
      label: "Rename",
      action: handleRename,
      shortcut: "R",
    },
    {
      iconName: "Power",
      label: node.bypassed ? "Enable" : "Bypass",
      action: () => {
        toggleBypass(nodeId);
        onClose();
      },
      shortcut: "B",
      active: node.bypassed,
    },
    {
      iconName: "VolumeX",
      label: node.muted ? "Unmute" : "Mute",
      action: () => {
        toggleMute(nodeId);
        onClose();
      },
      shortcut: "M",
      active: !!node.muted,
    },
    {
      iconName: "LogIn",
      label: node.muteInput ? "Unmute Input" : "Mute Input",
      action: () => {
        toggleMuteInput(nodeId);
        onClose();
      },
      shortcut: "I",
      active: !!node.muteInput,
    },
    {
      iconName: "Copy",
      label: "Duplicate",
      action: handleDuplicate,
      shortcut: "D",
    },
    {
      iconName: "Trash2",
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
              <Icon name={item.iconName} size={14} aria-hidden />
              <span className="flex-1 text-left">{item.label}</span>
              <span className="text-[10px] text-text-dim">{item.shortcut}</span>
            </button>
          ))}

          {multiSelect && (
            <>
              <div className="my-1 mx-3 border-t border-white/5" />
              <div className="px-3 py-0.5 text-[9px] uppercase tracking-widest text-text-dim font-bold">
                Align ({selectedBlockIds.length})
              </div>
              {alignItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    alignSelectedNodes(item.direction, selectedBlockIds);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors text-text-primary hover:bg-white/5"
                >
                  <Icon name={item.iconName} size={14} aria-hidden />
                  <span className="flex-1 text-left">{item.label}</span>
                  <span className="text-[10px] text-text-dim">
                    {item.shortcut}
                  </span>
                </button>
              ))}

              <div className="my-1 mx-3 border-t border-white/5" />
              <div className="px-3 py-0.5 text-[9px] uppercase tracking-widest text-text-dim font-bold">
                Distribute
              </div>
              {distributeItems.map((item) => {
                const enabled = canDistribute;
                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled={!enabled}
                    onClick={() => {
                      if (!enabled) return;
                      distributeSelectedNodes(item.axis, selectedBlockIds);
                      onClose();
                    }}
                    className={[
                      "w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors",
                      enabled
                        ? "text-text-primary hover:bg-white/5"
                        : "text-text-dim opacity-40 cursor-not-allowed",
                    ].join(" ")}
                  >
                    <Icon name={item.iconName} size={14} aria-hidden />
                    <span className="flex-1 text-left">{item.label}</span>
                    <span className="text-[10px] text-text-dim">
                      {item.shortcut}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Align/Distribute item definitions (module scope; pure data) ──

const alignItems: ReadonlyArray<{
  iconName: string;
  label: string;
  direction: AlignDirection;
  shortcut: string;
}> = [
  { iconName: "AlignStartVertical", label: "Align Left", direction: "left", shortcut: "⌘⇧L" },
  { iconName: "AlignCenterVertical", label: "Align Center", direction: "center", shortcut: "" },
  { iconName: "AlignEndVertical", label: "Align Right", direction: "right", shortcut: "⌘⇧R" },
  { iconName: "AlignStartHorizontal", label: "Align Top", direction: "top", shortcut: "⌘⇧T" },
  { iconName: "AlignCenterHorizontal", label: "Align Middle", direction: "middle", shortcut: "" },
  { iconName: "AlignEndHorizontal", label: "Align Bottom", direction: "bottom", shortcut: "⌘⇧B" },
];

const distributeItems: ReadonlyArray<{
  iconName: string;
  label: string;
  axis: DistributeAxis;
  shortcut: string;
}> = [
  { iconName: "AlignHorizontalDistributeCenter", label: "Distribute Horizontally", axis: "horizontal", shortcut: "⌘⇧H" },
  { iconName: "AlignVerticalDistributeCenter", label: "Distribute Vertically", axis: "vertical", shortcut: "⌘⇧V" },
];
