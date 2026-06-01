import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGraphStore } from "../../stores/useGraphStore";
import type { AlignDirection, DistributeAxis } from "../../stores/useGraphStore";
import {
  nativeGraphCopyNodes,
  nativeGraphDuplicateNodes,
  nativeGraphRemoveNode,
  nativeGraphRenameNode,
} from "../../bridge/nativeGraph";
import { Icon } from "../neu";
import { iconForCategory } from "../neu/iconForCategory";

interface NodeContextMenuProps {
  /** Id of the right-clicked Block. Looked up in `useGraphStore.nodes`; the menu renders nothing if the id is absent. */
  nodeId: string;
  /** Viewport (clientX/clientY) coordinates of the right-click; the menu is fixed-positioned here and clamped to stay on-screen. */
  position: { x: number; y: number };
  /** Called to dismiss the menu (outside click, Escape, or after an action completes). */
  onClose: () => void;
}

// ── Category accent colours (mirrors CLAUDE.md V3 taxonomy) ──────────────────
const CATEGORY_ACCENT: Record<string, string> = {
  instrument: "#4A90D9",
  audiofx:    "#E8A838",
  midifx:     "#2BC4C4",
  modulator:  "#A87FE0",
};

/**
 * NodeContextMenu — the right-click action menu for a Block on the Board.
 *
 * Native parity with `src/ui/contextmenus.hpp` NodePopupMenu:
 *   WIRED (real store/bridge action):
 *     Rename, Enable/Bypass, Mute/Unmute, Mute Input/Unmute Input,
 *     Copy, Duplicate, Delete,
 *     Disconnect All / Inputs / Outputs (sub-section),
 *     multi-select Align + Distribute.
 *
 *   HONEST-DISABLED (UI present, action not yet wired — see Pillar-2 backlog):
 *     Color (needs colour-picker bridge), Oversample (needs bridge call),
 *     Replace (needs plugin-picker bridge), Presets (needs nativePresetList UI).
 *
 * Design: category-hue dopamine glow on hover, tight neu shadows, no resize.
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

  const reactFlow = useReactFlow();
  const selectedBlockIds = useMemo(() => {
    return reactFlow
      .getNodes()
      .filter((n) => n.selected && n.type === "block")
      .map((n) => n.id);
  }, [reactFlow, nodeId]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // Estimated menu height including sections. Align/distribute adds ~270px.
  const estimatedHeight = multiSelect ? 580 : 380;
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.min(position.x, window.innerWidth - 240),
    top: Math.min(position.y, window.innerHeight - estimatedHeight),
    zIndex: 9999,
  };

  const handleDuplicate = useCallback(() => {
    void nativeGraphDuplicateNodes([nodeId]);
    onClose();
  }, [nodeId, onClose]);

  const handleCopy = useCallback(() => {
    void nativeGraphCopyNodes(selectedBlockIds.length >= 2 ? selectedBlockIds : [nodeId]);
    onClose();
  }, [nodeId, selectedBlockIds, onClose]);

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

  const accent = CATEGORY_ACCENT[node.category] ?? "#4A90D9";
  const catIcon = iconForCategory(node.category, node.name);

  return (
    <div
      ref={ref}
      style={menuStyle}
      className="w-56 bg-panel border border-white/10 rounded-lg shadow-[-4px_-4px_8px_rgba(255,255,255,0.04),8px_8px_24px_rgba(0,0,0,0.5)] overflow-hidden"
      role="menu"
      aria-label={`Block menu for ${node.name}`}
    >
      {/* Header */}
      <div className="px-3 py-2 bg-pressed border-b border-white/5 flex items-center gap-2">
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
            className="w-full bg-surface px-2 py-1 rounded text-[11px] text-text-primary border border-accent-blue focus:outline-none"
            autoFocus
            aria-label="New block name"
          />
        ) : (
          <>
            <Icon
              name={catIcon}
              size={12}
              color={accent}
              aria-hidden
            />
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest truncate flex-1">
              {node.name}
            </span>
            <span
              className="text-[9px] text-text-dim uppercase tracking-wider shrink-0"
              style={{ color: accent, opacity: 0.7 }}
            >
              {node.format}
            </span>
          </>
        )}
      </div>

      {!renaming && (
        <div className="py-1">
          {/* ── Primary actions ── */}
          <MenuSection>
            <MenuItem
              iconName="Pencil"
              label="Rename"
              shortcut="R"
              accent={accent}
              onClick={handleRename}
            />
            <MenuItem
              iconName="Power"
              label={node.bypassed ? "Enable" : "Bypass"}
              shortcut="B"
              active={node.bypassed}
              accent={accent}
              onClick={() => { void toggleBypass(nodeId); onClose(); }}
            />
          </MenuSection>

          <MenuDivider />

          {/* ── Signal state ── */}
          <MenuSection>
            <MenuItem
              iconName="Volume2"
              label={node.muted ? "Unmute Output" : "Mute Output"}
              shortcut="M"
              active={!!node.muted}
              accent={accent}
              onClick={() => { void toggleMute(nodeId); onClose(); }}
            />
            <MenuItem
              iconName="LogIn"
              label={node.muteInput ? "Unmute Input" : "Mute Input"}
              shortcut="I"
              active={!!node.muteInput}
              accent={accent}
              onClick={() => { void toggleMuteInput(nodeId); onClose(); }}
            />
          </MenuSection>

          <MenuDivider />

          {/* ── Disconnect submenu (flat — no popper) ── */}
          <SectionHeader label="Disconnect" />
          <MenuItem
            iconName="Unplug"
            label="All Ports"
            accent={accent}
            disabled
            disabledReason="Requires nativeGraphDisconnectNode bridge (Pillar-2)"
            onClick={() => {}}
          />
          <MenuItem
            iconName="Unplug"
            label="Input Ports"
            accent={accent}
            disabled
            disabledReason="Requires nativeGraphDisconnectNodeInputs bridge (Pillar-2)"
            onClick={() => {}}
          />
          <MenuItem
            iconName="Unplug"
            label="Output Ports"
            accent={accent}
            disabled
            disabledReason="Requires nativeGraphDisconnectNodeOutputs bridge (Pillar-2)"
            onClick={() => {}}
          />
          <MenuItem
            iconName="Music"
            label="MIDI Ports"
            accent={accent}
            disabled
            disabledReason="Requires nativeGraphDisconnectNodeMidi bridge (Pillar-2)"
            onClick={() => {}}
          />

          <MenuDivider />

          {/* ── Plugin options (honest-disabled) ── */}
          <SectionHeader label="Options" />
          <MenuItem
            iconName="Palette"
            label="Color…"
            accent={accent}
            disabled
            disabledReason="Colour-picker bridge (elementGraphSetNodeColor) not yet wired (Pillar-2)"
            onClick={() => {}}
          />
          <MenuItem
            iconName="Zap"
            label="Oversample…"
            accent={accent}
            disabled
            disabledReason="elementGraphSetOversample bridge not yet wired (Pillar-2)"
            onClick={() => {}}
          />
          <MenuItem
            iconName="RefreshCw"
            label="Replace…"
            accent={accent}
            disabled
            disabledReason="Plugin-picker for Replace not yet wired (Pillar-2)"
            onClick={() => {}}
          />
          <MenuItem
            iconName="Layers"
            label="Presets…"
            accent={accent}
            disabled
            disabledReason="Preset picker UI not yet wired (Pillar-2: nativePresetList + modal)"
            onClick={() => {}}
          />

          <MenuDivider />

          {/* ── Clipboard + delete ── */}
          <MenuSection>
            <MenuItem
              iconName="Copy"
              label={multiSelect ? `Copy ${selectedBlockIds.length} Blocks` : "Copy"}
              shortcut="⌘C"
              accent={accent}
              onClick={handleCopy}
            />
            <MenuItem
              iconName="Cpu"
              label={multiSelect ? `Duplicate ${selectedBlockIds.length} Blocks` : "Duplicate"}
              shortcut="⌘D"
              accent={accent}
              onClick={handleDuplicate}
            />
          </MenuSection>
          <MenuItem
            iconName="Trash2"
            label="Delete"
            shortcut="Del"
            danger
            accent={accent}
            onClick={handleDelete}
          />

          {/* ── Multi-select: align + distribute ── */}
          {multiSelect && (
            <>
              <MenuDivider />
              <SectionHeader label={`Align (${selectedBlockIds.length})`} />
              {alignItems.map((item) => (
                <MenuItem
                  key={item.label}
                  iconName={item.iconName}
                  label={item.label}
                  shortcut={item.shortcut}
                  accent={accent}
                  onClick={() => {
                    alignSelectedNodes(item.direction, selectedBlockIds);
                    onClose();
                  }}
                />
              ))}

              <MenuDivider />
              <SectionHeader label="Distribute" />
              {distributeItems.map((item) => (
                <MenuItem
                  key={item.label}
                  iconName={item.iconName}
                  label={item.label}
                  shortcut={item.shortcut}
                  accent={accent}
                  disabled={!canDistribute}
                  disabledReason="Select 3+ blocks to distribute"
                  onClick={() => {
                    if (!canDistribute) return;
                    distributeSelectedNodes(item.axis, selectedBlockIds);
                    onClose();
                  }}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function MenuDivider() {
  return <div className="my-1 mx-3 border-t border-white/5" />;
}

function MenuSection({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 py-0.5 text-[9px] uppercase tracking-widest text-text-dim font-bold">
      {label}
    </div>
  );
}

interface MenuItemProps {
  iconName: string;
  label: string;
  shortcut?: string;
  accent: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

function MenuItem({
  iconName,
  label,
  shortcut,
  accent,
  onClick,
  active = false,
  danger = false,
  disabled = false,
  disabledReason,
}: MenuItemProps) {
  // Category-hue dopamine hover glow: applied via inline style so it reflects
  // the live accent without needing arbitrary Tailwind class generation.
  const hoverBg = danger ? "rgba(255,69,58,0.10)" : `${accent}1A`; // 10% alpha

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={!disabled ? onClick : undefined}
      title={disabled && disabledReason ? disabledReason : undefined}
      className={[
        "w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors duration-150 group",
        danger
          ? "text-error"
          : active
            ? "text-accent-orange"
            : disabled
              ? "text-text-dim opacity-40 cursor-not-allowed"
              : "text-text-primary",
      ].join(" ")}
      style={
        !disabled
          ? ({
              "--hover-bg": hoverBg,
            } as React.CSSProperties)
          : undefined
      }
      onMouseEnter={
        !disabled
          ? (e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor =
                hoverBg;
            }
          : undefined
      }
      onMouseLeave={
        !disabled
          ? (e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "";
            }
          : undefined
      }
    >
      <Icon name={iconName} size={13} aria-hidden />
      <span className="flex-1 text-left leading-none">{label}</span>
      {disabled && (
        <span className="text-[8px] text-text-dim opacity-60 uppercase tracking-wider ml-auto">
          soon
        </span>
      )}
      {!disabled && shortcut && (
        <span className="text-[10px] text-text-dim shrink-0">{shortcut}</span>
      )}
    </button>
  );
}

// ── Align/Distribute item definitions (module scope; pure data) ───────────────

const alignItems: ReadonlyArray<{
  iconName: string;
  label: string;
  direction: AlignDirection;
  shortcut: string;
}> = [
  { iconName: "AlignStartVertical",    label: "Align Left",   direction: "left",   shortcut: "⌘⇧L" },
  { iconName: "AlignCenterVertical",   label: "Align Center", direction: "center", shortcut: "" },
  { iconName: "AlignEndVertical",      label: "Align Right",  direction: "right",  shortcut: "⌘⇧R" },
  { iconName: "AlignStartHorizontal",  label: "Align Top",    direction: "top",    shortcut: "⌘⇧T" },
  { iconName: "AlignCenterHorizontal", label: "Align Middle", direction: "middle", shortcut: "" },
  { iconName: "AlignEndHorizontal",    label: "Align Bottom", direction: "bottom", shortcut: "⌘⇧B" },
];

const distributeItems: ReadonlyArray<{
  iconName: string;
  label: string;
  axis: DistributeAxis;
  shortcut: string;
}> = [
  { iconName: "AlignHorizontalDistributeCenter", label: "Distribute Horizontally", axis: "horizontal", shortcut: "⌘⇧H" },
  { iconName: "AlignVerticalDistributeCenter",   label: "Distribute Vertically",   axis: "vertical",   shortcut: "⌘⇧V" },
];
