import { useMemo, useState } from "react";
import { useGraphStore } from "../../stores/useGraphStore";
import type { Port } from "../../data/types";
import { Icon, NeuInput, NeuToggle } from "../neu";

// Above this many params, surface a text filter so a params-as-ports plugin
// (a Valhalla reverb can expose 18+ CV inputs) stays navigable.
const FILTER_THRESHOLD = 8;

interface ParamConfigPopoverProps {
  /** Id of the Block being configured. Looked up in `useGraphStore.nodes`. */
  nodeId: string;
  /** Category accent (header tint), passed from the menu so the popover ties
   *  visually to the Block whose menu opened it. */
  accent: string;
}

/**
 * ParamConfigPopover — per-block parameter-presence editor (Glen 2026-06-03).
 *
 * Lists this Block's PARAM ports (the `type === "value"` Value/CV ports that
 * map to plugin parameters / modulation inputs) with a per-param show/hide
 * neumorphic switch, a header count of visible/total, and Show all / Hide all.
 * Scrollable for many params, with a text filter once the list is long.
 *
 * Each toggle optimistically updates the store's `hiddenParams` for the node
 * AND persists it through `setHiddenParams` → `nativeGraphSetNodeHiddenParams`
 * (the host stores the CSV on the Node ValueTree, so the choice survives
 * project save/load). The next engine snapshot reconciles authoritatively —
 * NOTHING fabricated. Hidden params drop off the Block (Block.tsx filters them
 * out of the param-port group + the "▸ N params" count).
 *
 * Rendered inline inside NodeContextMenu (like ReplacePicker) — no separate
 * canvas mount needed. The menu only offers the entry for blocks that HAVE
 * value/param ports, so this component can assume `paramPorts.length > 0` in
 * practice but still renders an honest empty state defensively.
 *
 * Visual language: the locked neumorphic "one chassis" — a pressed inner well
 * for the scroll list, recessed Show/Hide-all chips, no transparency/glass.
 */
export function ParamConfigPopover({ nodeId, accent }: ParamConfigPopoverProps) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId));
  const setHiddenParams = useGraphStore((s) => s.setHiddenParams);
  const [query, setQuery] = useState("");

  // All PARAM ports for this Block (Value/CV). Stable identity unless the
  // node's ports change, so the filter/derivations don't churn.
  const paramPorts = useMemo<Port[]>(
    () => (node?.ports ?? []).filter((p) => p.type === "value"),
    [node?.ports],
  );

  // Hidden set (persisted ids). A param is SHOWN when NOT in this set.
  const hiddenSet = useMemo(
    () => new Set(node?.hiddenParams ?? []),
    [node?.hiddenParams],
  );

  const visibleCount = paramPorts.length - hiddenSet.size;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return paramPorts;
    return paramPorts.filter(
      (p) =>
        p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [paramPorts, query]);

  // Build the FULL desired hidden set, then persist (setHiddenParams takes the
  // complete set, not a delta) so optimistic + host stay in lock-step.
  const setShown = (portId: string, shown: boolean) => {
    const nextHidden = new Set(hiddenSet);
    if (shown) nextHidden.delete(portId);
    else nextHidden.add(portId);
    void setHiddenParams(nodeId, Array.from(nextHidden));
  };

  const showAll = () => {
    if (hiddenSet.size === 0) return;
    void setHiddenParams(nodeId, []);
  };

  const hideAll = () => {
    if (hiddenSet.size === paramPorts.length) return;
    void setHiddenParams(nodeId, paramPorts.map((p) => p.id));
  };

  if (!node) return null;

  return (
    <div className="px-2 pb-1.5 pt-0.5" role="group" aria-label="Configure parameters">
      {/* Header — visible/total count + Show all / Hide all */}
      <div className="flex items-center gap-1.5 px-1 pb-1">
        <Icon name="SlidersHorizontal" size={12} color={accent} aria-hidden />
        <span className="text-[9px] uppercase tracking-widest text-text-dim font-bold flex-1">
          Parameters
        </span>
        <span
          className="text-[9px] font-mono tabular-nums text-text-dim shrink-0"
          aria-label={`${visibleCount} of ${paramPorts.length} parameters visible`}
        >
          {visibleCount}/{paramPorts.length}
        </span>
      </div>

      {paramPorts.length === 0 ? (
        // Honest empty state — no value/param ports on this Block.
        <div className="px-1 py-2 text-[10px] text-text-dim">
          No parameters to configure.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 px-1 pb-1">
            <BulkChip
              label="Show all"
              disabled={hiddenSet.size === 0}
              onClick={showAll}
            />
            <BulkChip
              label="Hide all"
              disabled={hiddenSet.size === paramPorts.length}
              onClick={hideAll}
            />
          </div>

          {/* Text filter — only once the list is long enough to warrant it. */}
          {paramPorts.length > FILTER_THRESHOLD && (
            <div className="px-1 pb-1">
              <NeuInput
                placeholder="Filter parameters…"
                value={query}
                onChange={setQuery}
              />
            </div>
          )}

          {/* Scroll list — pressed inner well (neumorphic). */}
          <div
            className="max-h-44 overflow-y-auto rounded px-1 py-1"
            style={{
              background: "var(--color-pressed, #1A1A1E)",
              boxShadow:
                "inset 2px 2px 6px rgba(0,0,0,0.4), inset -1px -1px 4px rgba(255,255,255,0.05)",
            }}
          >
            {filtered.length === 0 ? (
              <div className="px-1 py-1.5 text-[10px] text-text-dim">
                No matches
              </div>
            ) : (
              filtered.map((port) => {
                const shown = !hiddenSet.has(port.id);
                return (
                  <div
                    key={port.id}
                    className="flex items-center gap-2 px-1 py-1 rounded hover:bg-elevated transition-colors duration-100"
                  >
                    <span
                      className="flex-1 truncate text-[11px] font-mono leading-none"
                      style={{
                        color: shown
                          ? "var(--color-text-primary, #E5E5EA)"
                          : "var(--color-text-dim, #6B6B70)",
                      }}
                      title={port.label}
                    >
                      {port.label}
                    </span>
                    <span className="text-[8px] uppercase tracking-wider text-text-dim shrink-0 w-6 text-right">
                      {port.direction === "output" ? "out" : "in"}
                    </span>
                    <NeuToggle
                      active={shown}
                      color="orange"
                      onChange={(next) => setShown(port.id, next)}
                      className={
                        shown ? "" : "opacity-90"
                      }
                    />
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Recessed neumorphic bulk-action chip (Show all / Hide all). Pressed INTO the
// surface; disabled when the action is a no-op (already all-shown / all-hidden).
function BulkChip({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={[
        "flex-1 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider leading-none transition-colors duration-100",
        disabled
          ? "text-text-dim opacity-40 cursor-not-allowed"
          : "text-text-secondary hover:text-text-primary",
      ].join(" ")}
      style={{
        background: "var(--color-pressed, #1A1A1E)",
        boxShadow:
          "inset 1px 1px 2px rgba(0,0,0,0.5), inset -0.5px -0.5px 1px rgba(255,255,255,0.04)",
      }}
    >
      {label}
    </button>
  );
}
