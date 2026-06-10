import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGraphStore } from "../../stores/useGraphStore";
import type { AlignDirection, DistributeAxis } from "../../stores/useGraphStore";
import {
  nativeGraphCopyNodes,
  nativeGraphDuplicateNodes,
  nativeGraphRemoveNode,
  nativeGraphRenameNode,
  nativeBlockPresetSave,
  nativeBlockPresetList,
  nativeBlockPresetLoad,
  nativeBlockPresetSetDefault,
} from "../../bridge/nativeGraph";
import {
  usePluginBrowserStore,
  type BrowserPlugin,
} from "../../stores/usePluginBrowserStore";
import { Icon, NeuInput } from "../neu";
import { iconForCategory } from "../neu/iconForCategory";
import { ParamConfigPopover } from "./ParamConfigPopover";
import { groupSelectionWithFeedback } from "./groupSelection";
import { NeuPromptModal } from "../layout/NeuPromptModal";

interface NodeContextMenuProps {
  /** Id of the right-clicked Block. Looked up in `useGraphStore.nodes`; the menu renders nothing if the id is absent. */
  nodeId: string;
  /** Viewport (clientX/clientY) coordinates of the right-click; the menu is fixed-positioned here and clamped to stay on-screen. */
  position: { x: number; y: number };
  /**
   * #3a — block ids that were multi-selected when the menu opened, snapshotted
   * by GraphCanvas's `onNodeContextMenu` BEFORE any `selectNode` collapse. When
   * provided this is the authoritative selection (the menu must NOT re-read
   * React Flow, which the store→RF rebuild may have collapsed to one node).
   * ≥2 ⇒ multi-select actions (Group / Align / Distribute / "N Blocks" copy).
   * Falls back to a live RF read only when omitted (defensive).
   */
  selectedBlockIds?: string[];
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

// ── G3-A: oversample factors (parity with contextmenus.hpp:341-345) ──────────
const OVERSAMPLE_FACTORS: ReadonlyArray<{ factor: 1 | 2 | 4 | 8; label: string }> = [
  { factor: 1, label: "Off" },
  { factor: 2, label: "2×" },
  { factor: 4, label: "4×" },
  { factor: 8, label: "8×" },
];

// ── G3-A: Color picker palette — the 4 category hues + Clear ─────────────────
// Dependency-free, reuses the locked taxonomy tokens (no native colour dialog,
// no new transparency/glass). Hex strings are sent verbatim to the bridge as
// "#RRGGBB".
const COLOR_SWATCHES: ReadonlyArray<{ hex: string; name: string }> = [
  { hex: "#4A90D9", name: "Blue" },
  { hex: "#E8A838", name: "Orange" },
  { hex: "#2BC4C4", name: "Teal" },
  { hex: "#A87FE0", name: "Purple" },
];

/** Normalise a hostColor (may be "#AARRGGBB" or "#RRGGBB") to "#RRGGBB" for
 *  comparison with the swatch palette so the active swatch shows a ring. */
function normaliseHostColorToRgb(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().toUpperCase();
  if (t.startsWith("#") && t.length === 9) return `#${t.slice(3)}`;
  if (t.startsWith("#") && t.length === 7) return t;
  return undefined;
}

/**
 * NodeContextMenu — the right-click action menu for a Block on the Board.
 *
 * Native parity with `src/ui/contextmenus.hpp` NodePopupMenu:
 *   WIRED (real store/bridge action):
 *     Rename, Enable/Bypass, Mute/Unmute, Mute Input/Unmute Input,
 *     Copy, Duplicate, Delete,
 *     Disconnect All / Inputs / Outputs / MIDI ports (G3-A:
 *       elementGraphDisconnectNode — node-level, all matching cables),
 *     Color (G3-A: elementGraphSetNodeColor — inline neu swatch palette + Clear),
 *     Oversample Off/2x/4x/8x (G3-A: elementGraphSetOversample, active tick from
 *       the real Processor::getOversamplingFactor() in the snapshot),
 *     Replace (G3-A: elementGraphReplacePlugin — inline picker over the REAL
 *       elementGetPluginList, keeps connections where possible),
 *     Configure Parameters… (per-block param-port show/hide via
 *       elementGraphSetNodeHiddenParams — inline ParamConfigPopover, persisted
 *       on the Node tree; only offered for blocks with Value/CV param ports),
 *     multi-select Align + Distribute.
 *
 *   HONEST-DISABLED (UI present, action not yet wired — see Pillar-2 backlog):
 *     Presets (needs nativePresetList picker UI — presets already work via the
 *       InspectorHub PresetStrip).
 *
 * NOTHING fake: Color/Oversample are optimistic-with-rollback (a rejected/no-op
 * bridge call reverts the local field, so no fabricated value persists);
 * Disconnect/Replace mutate nothing locally — the authoritative next engine
 * snapshot removes cables / rebuilds the replaced node. Oversample on an
 * Audio/MIDI-IO node is honest-degraded: the bridge returns false and the
 * optimistic factor rolls back (no visible change).
 *
 * Design: category-hue dopamine glow on hover, tight neu shadows, no resize.
 */
export function NodeContextMenu({
  nodeId,
  position,
  selectedBlockIds: selectedBlockIdsProp,
  onClose,
}: NodeContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId));
  const toggleBypass = useGraphStore((s) => s.toggleBypass);
  const toggleMute = useGraphStore((s) => s.toggleMute);
  const toggleMuteInput = useGraphStore((s) => s.toggleMuteInput);
  const disconnectNode = useGraphStore((s) => s.disconnectNode);
  const setNodeColor = useGraphStore((s) => s.setNodeColor);
  const setOversample = useGraphStore((s) => s.setOversample);
  const replacePlugin = useGraphStore((s) => s.replacePlugin);
  const alignSelectedNodes = useGraphStore((s) => s.alignSelectedNodes);
  const distributeSelectedNodes = useGraphStore(
    (s) => s.distributeSelectedNodes,
  );

  // Replace picker: inline plugin search reusing the REAL plugin list.
  const [replacing, setReplacing] = useState(false);
  // Configure Parameters… : inline per-block param-presence editor.
  const [configuring, setConfiguring] = useState(false);
  // T21W: Block preset popover (save / load / set-default).
  const [presetOpen, setPresetOpen] = useState(false);

  const reactFlow = useReactFlow();
  // #3a — prefer the open-time snapshot from GraphCanvas (the marquee selection
  // captured BEFORE `selectNode` could collapse it). Fall back to a live RF read
  // only if the prop is omitted (defensive — keeps the menu usable in isolation,
  // e.g. Storybook). The snapshot decouples the menu from the store→RF rebuild
  // race that previously hid the Group item.
  const selectedBlockIds = useMemo(() => {
    if (selectedBlockIdsProp != null) return selectedBlockIdsProp;
    return reactFlow
      .getNodes()
      .filter((n) => n.selected && n.type === "block")
      .map((n) => n.id);
  }, [reactFlow, nodeId, selectedBlockIdsProp]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // Estimated menu height including sections. The Options group (Color row +
  // Oversample ×4 + Replace) adds ~150px over the legacy single-item layout;
  // align/distribute adds ~270px more.
  // The Configure-Parameters popover adds ~260px (header + bulk chips + the
  // ~176px scroll well) when open; budget for it so the menu isn't clamped
  // above the viewport top with the list cut off.
  const estimatedHeight =
    (multiSelect ? 730 : 530) + (configuring ? 260 : 0) + (presetOpen ? 200 : 0);
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

  // T10 — group the multi-selection into a Container; refusals surface in the
  // status bar via the shared canvasHint channel (engine-driven refresh).
  const handleGroup = useCallback(() => {
    groupSelectionWithFeedback(selectedBlockIds);
    onClose();
  }, [selectedBlockIds, onClose]);

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
  // "Configure Parameters…" is offered only for blocks that HAVE Value/CV
  // param ports (the ports the popover governs). Hidden params still count as
  // param ports here — hiding them must not make the entry disappear. Guard the
  // ports array (a node may surface before its ports hydrate).
  const hasParamPorts = (node.ports ?? []).some((p) => p.type === "value");

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
            onClick={() => {
              void disconnectNode(nodeId, "all");
              onClose();
            }}
          />
          <MenuItem
            iconName="Unplug"
            label="Input Ports"
            accent={accent}
            onClick={() => {
              void disconnectNode(nodeId, "inputs");
              onClose();
            }}
          />
          <MenuItem
            iconName="Unplug"
            label="Output Ports"
            accent={accent}
            onClick={() => {
              void disconnectNode(nodeId, "outputs");
              onClose();
            }}
          />
          <MenuItem
            iconName="Music"
            label="MIDI Ports"
            accent={accent}
            onClick={() => {
              void disconnectNode(nodeId, "midi");
              onClose();
            }}
          />

          <MenuDivider />

          {/* ── Plugin options ── */}
          <SectionHeader label="Options" />

          {/* Color — inline neumorphic swatch row (4 category hues + Clear). */}
          <ColorSwatchRow
            accent={accent}
            currentColor={node.hostColor}
            onPick={(hex) => {
              void setNodeColor(nodeId, hex);
              onClose();
            }}
            onClear={() => {
              void setNodeColor(nodeId, "");
              onClose();
            }}
          />

          {/* Oversample — Off / 2x / 4x / 8x, active tick from real factor. */}
          <SectionHeader label="Oversample" />
          {OVERSAMPLE_FACTORS.map((f) => (
            <MenuItem
              key={f.factor}
              iconName="Zap"
              label={f.label}
              accent={accent}
              active={(node.oversample ?? 1) === f.factor}
              onClick={() => {
                void setOversample(nodeId, f.factor);
                onClose();
              }}
            />
          ))}

          {/* Replace — opens an inline picker over the REAL plugin list. */}
          <MenuItem
            iconName="RefreshCw"
            label="Replace…"
            accent={accent}
            active={replacing}
            onClick={() => setReplacing((v) => !v)}
          />
          {replacing && (
            <ReplacePicker
              accent={accent}
              onPick={(plugin) => {
                void replacePlugin(nodeId, plugin.identifier);
                onClose();
              }}
            />
          )}

          {/* Configure Parameters… — per-block param-presence editor. Only for
              blocks that expose Value/CV param ports; honest-disabled otherwise
              (a block with no params has nothing to configure). Opens an inline
              popover (like Replace) so the whole feature stays self-contained in
              this menu — no separate canvas mount. */}
          <MenuItem
            iconName="SlidersHorizontal"
            label="Configure Parameters…"
            accent={accent}
            active={configuring}
            disabled={!hasParamPorts}
            disabledReason="This block has no parameter ports to configure"
            onClick={() => setConfiguring((v) => !v)}
          />
          {configuring && hasParamPorts && (
            <ParamConfigPopover nodeId={nodeId} accent={accent} />
          )}

          {/* T21W: Block preset save/load/set-default.
              Uses the T21W bridge contract (elementBlockPreset*).
              Gracefully no-ops when the native fn is absent — invokeElementNative
              resolves undefined and nativeBlockPreset* returns { ok: false }. */}
          <MenuItem
            iconName="Layers"
            label="Presets…"
            accent={accent}
            active={presetOpen}
            onClick={() => setPresetOpen((v) => !v)}
          />
          {presetOpen && (
            <BlockPresetPopover
              nodeId={nodeId}
              pluginId={(node.data as { identifier?: string } | undefined)?.identifier ?? ""}
              accent={accent}
              onClose={() => { setPresetOpen(false); onClose(); }}
            />
          )}

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
            {/* T10 (Glen QA 2026-06-06): wrap the selection in a nested
                Container, auto-rewiring boundary cables through its IO. */}
            {multiSelect && (
              <MenuItem
                iconName="BoxSelect"
                label={`Group ${selectedBlockIds.length} into Container`}
                shortcut="⌘⇧D"
                accent={accent}
                onClick={handleGroup}
              />
            )}
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

// ── G3-A: Color swatch row ────────────────────────────────────────────────────
// Inline, dependency-free colour picker: the 4 locked category hues + a Clear
// chip. Clicking a swatch sets a real user node colour via the store
// (elementGraphSetNodeColor); Clear removes it (→ category accent fallback).
// Neumorphic pressed surface, no transparency/glass.
function ColorSwatchRow({
  accent,
  currentColor,
  onPick,
  onClear,
}: {
  accent: string;
  currentColor: string | undefined;
  onPick: (hex: string) => void;
  onClear: () => void;
}) {
  const activeRgb = normaliseHostColorToRgb(currentColor);
  return (
    <div className="px-3 py-1.5 flex items-center gap-2">
      <Icon name="Palette" size={13} color={accent} aria-hidden />
      <div className="flex items-center gap-1.5" role="group" aria-label="Block colour">
        {COLOR_SWATCHES.map((sw) => {
          const isActive = activeRgb === sw.hex.toUpperCase();
          return (
            <button
              key={sw.hex}
              type="button"
              role="menuitemradio"
              aria-checked={isActive}
              aria-label={`Set colour ${sw.name}`}
              title={sw.name}
              onClick={() => onPick(sw.hex)}
              className="w-4 h-4 rounded-full shrink-0 transition-transform duration-100 hover:scale-110 focus:outline-none"
              style={{
                backgroundColor: sw.hex,
                boxShadow: isActive
                  ? `0 0 0 2px var(--color-panel, #222226), 0 0 0 3px ${sw.hex}`
                  : "inset 1px 1px 2px rgba(0,0,0,0.4)",
              }}
            />
          );
        })}
        <button
          type="button"
          role="menuitem"
          aria-label="Clear block colour"
          title="Clear (use category colour)"
          onClick={onClear}
          className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center bg-pressed text-text-dim hover:text-text-primary transition-colors duration-100 focus:outline-none shadow-[inset_1px_1px_2px_rgba(0,0,0,0.4)]"
        >
          <Icon name="X" size={9} aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ── G3-A: Replace plugin picker ───────────────────────────────────────────────
// Inline search over the REAL plugin list (usePluginBrowserStore — the same
// elementGetPluginList QuickAdd reads). On pick, calls replacePlugin so the
// engine swaps the node in-place (keeping connections where possible). No
// hardcoded plugin names; no new native dialog.
function ReplacePicker({
  accent,
  onPick,
}: {
  accent: string;
  onPick: (plugin: BrowserPlugin) => void;
}) {
  const plugins = usePluginBrowserStore((s) => s.plugins);
  const refresh = usePluginBrowserStore((s) => s.refresh);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q.length === 0
      ? plugins
      : plugins.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.manufacturer.toLowerCase().includes(q),
        );
    return matched.slice(0, 50);
  }, [plugins, query]);

  return (
    <div className="px-2 pb-1.5 pt-0.5">
      <NeuInput
        ref={inputRef}
        placeholder="Replace with…"
        value={query}
        onChange={setQuery}
      />
      <div className="mt-1 max-h-40 overflow-y-auto">
        {results.length === 0 ? (
          <div className="px-2 py-2 text-[10px] text-text-dim">
            {plugins.length === 0 ? "No plugins available" : "No matches"}
          </div>
        ) : (
          results.map((p) => (
            <button
              key={p.identifier}
              type="button"
              role="menuitem"
              onClick={() => onPick(p)}
              className="w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] text-text-primary hover:bg-elevated transition-colors duration-100 text-left"
            >
              <Icon
                name={iconForCategory(p.blockCategory, p.name)}
                size={11}
                color={accent}
                aria-hidden
              />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-[8px] text-text-dim uppercase tracking-wider shrink-0">
                {p.format}
              </span>
            </button>
          ))
        )}
      </div>
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

// ── T21W: Block-level preset save / load / set-default popover ───────────────
// Bridge contract (parallel C++ agent):
//   elementBlockPresetSave(uuid, name)   → JSON { ok, error? }
//   elementBlockPresetList(pluginId)     → JSON { ok, presets: string[], error? }
//   elementBlockPresetLoad(uuid, name)   → JSON { ok, error? }
//   elementBlockPresetSetDefault(uuid)   → JSON { ok, error? }
// Graceful no-op when the native fn is absent: invokeElementNative resolves
// undefined → nativeBlockPreset* returns { ok: false } → UI shows nothing.
// Uses window.__elementNative guard pattern via invokeElementNative in juceBackend.

function BlockPresetPopover({
  nodeId,
  pluginId,
  accent,
  onClose,
}: {
  nodeId: string;
  pluginId: string;
  accent: string;
  onClose: () => void;
}) {
  const [presets, setPresets] = useState<string[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void nativeBlockPresetList(pluginId).then((r) => {
      if (r.ok) setPresets(r.presets);
    });
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [pluginId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? presets.filter((p) => p.toLowerCase().includes(q)) : presets;
  }, [presets, query]);

  const handleSaveConfirm = useCallback(
    (name: string) => {
      setSaveOpen(false);
      void nativeBlockPresetSave(nodeId, name).then((r) => {
        if (r.ok) {
          // Refresh list after save.
          void nativeBlockPresetList(pluginId).then((lr) => {
            if (lr.ok) setPresets(lr.presets);
          });
        }
      });
    },
    [nodeId, pluginId],
  );

  const handleLoad = useCallback(
    (name: string) => {
      void nativeBlockPresetLoad(nodeId, name);
      onClose();
    },
    [nodeId, onClose],
  );

  const handleSetDefault = useCallback(() => {
    void nativeBlockPresetSetDefault(nodeId);
    onClose();
  }, [nodeId, onClose]);

  const textBtn =
    "text-[10px] text-text-secondary hover:text-text-primary transition-colors underline underline-offset-2 px-1";

  return (
    <div className="px-2 pb-2 pt-1 space-y-1.5">
      {/* Action row: Save / Set as default */}
      <div className="flex items-center gap-2 px-1">
        <button type="button" className={textBtn} onClick={() => setSaveOpen(true)}>
          Save preset…
        </button>
        <button type="button" className={textBtn} onClick={handleSetDefault}>
          Set as default
        </button>
      </div>

      {/* Search / list */}
      {presets.length > 0 && (
        <>
          <NeuInput
            ref={inputRef}
            placeholder="Filter presets…"
            value={query}
            onChange={setQuery}
          />
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {filtered.length === 0 ? (
              <div className="px-2 py-1 text-[10px] text-text-dim">No matches</div>
            ) : (
              filtered.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="menuitem"
                  onClick={() => handleLoad(name)}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] text-text-primary hover:bg-elevated transition-colors duration-100 text-left"
                >
                  <Icon name="Layers" size={11} color={accent} aria-hidden />
                  <span className="flex-1 truncate">{name}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
      {presets.length === 0 && (
        <div className="px-2 py-1 text-[10px] text-text-dim">No saved presets</div>
      )}

      {/* Save-preset name modal */}
      <NeuPromptModal
        open={saveOpen}
        title="Save preset"
        description="Saves the current parameter values under this name."
        placeholder="Preset name"
        confirmLabel="Save"
        onConfirm={handleSaveConfirm}
        onCancel={() => setSaveOpen(false)}
      />
    </div>
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
