// U11 — MirrorPanel: read-only live view of a peer Element instance's graph.
//
// Shows the selected OTHER instance's board as a compact, READ-ONLY summary +
// block list, refreshed at 4 Hz from the peer's real `buildActiveGraphJson()`
// snapshot (via useInstancesStore). It is strictly read-only: this component
// imports ZERO mutation bridge fns and renders a "MIRROR · READ ONLY" badge so
// the user is never misled into thinking the mirror is editable.
//
// NOTHING fake — three honest states:
//   1. No target            → renders nothing (panel closed).
//   2. Unavailable/no data   → EmptyState "Instance unavailable".
//   3. Snapshot present      → summary + block list from REAL snapshot fields.
import { motion, AnimatePresence } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import {
  useInstancesStore,
  selectMirrorTargetId,
  selectMirrorSnapshot,
  selectMirrorUnavailable,
  selectOtherInstances,
} from "../../stores/useInstancesStore";
import type { BlockCategory } from "../../data/types";
import { EmptyState, NeuBadge, Icon } from "../neu";
import { categoryIconName } from "../neu/iconForCategory";

const EASE = [0.16, 1, 0.3, 1] as const;
const TOOLBAR_H = 40;
const STATUS_H = 24;
const PANEL_W = 280;

/** Map a raw snapshot category string to a known BlockCategory (honest fallback). */
function toCategory(raw: string | undefined): BlockCategory {
  switch (raw) {
    case "instrument":
    case "audiofx":
    case "midifx":
    case "modulator":
      return raw;
    default:
      return "audiofx";
  }
}

const CATEGORY_TONE: Record<BlockCategory, string> = {
  instrument: "text-accent-blue",
  audiofx: "text-accent-orange",
  midifx: "text-accent-teal",
  modulator: "text-badge-au",
};

export function MirrorPanel() {
  const targetId = useInstancesStore(selectMirrorTargetId);
  const snapshot = useInstancesStore(selectMirrorSnapshot);
  const unavailable = useInstancesStore(selectMirrorUnavailable);
  const others = useInstancesStore(useShallow(selectOtherInstances));
  const setMirrorTarget = useInstancesStore((s) => s.setMirrorTarget);

  // State 1: no target → render nothing.
  const peer = targetId != null ? others.find((i) => i.id === targetId) : null;
  const peerName = peer?.name ?? (targetId != null ? `Instance #${targetId}` : "");

  return (
    <AnimatePresence>
      {targetId != null ? (
        <motion.aside
          key="mirror-panel"
          initial={{ x: PANEL_W + 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: PANEL_W + 24, opacity: 0 }}
          transition={{ ease: EASE, duration: 0.2 }}
          className="fixed right-3 z-[55] flex flex-col rounded-[8px] neu-raised bg-panel overflow-hidden"
          style={{ top: TOOLBAR_H + 12, bottom: STATUS_H + 12, width: PANEL_W }}
          role="complementary"
          aria-label={`Mirror of ${peerName} (read only)`}
        >
          {/* Header — peer name + MIRROR · READ ONLY badge + close. */}
          <div className="flex items-center gap-2 px-3 h-9 shrink-0 bg-surface border-b border-white/5">
            <Icon name="Layers" size={13} className="text-accent-blue" aria-hidden />
            <span className="flex-1 truncate text-[12px] font-semibold text-text-primary">
              {peerName}
            </span>
            <NeuBadge text="MIRROR · READ ONLY" color="grey" />
            <button
              type="button"
              aria-label="Close mirror"
              title="Close mirror"
              className="w-6 h-6 flex items-center justify-center rounded-[4px] text-text-secondary hover:text-text-primary hover:bg-elevated t-precision"
              onClick={() => setMirrorTarget(null)}
            >
              <Icon name="X" size={12} aria-hidden />
            </button>
          </div>

          {/* Body */}
          {unavailable || snapshot == null ? (
            // State 2: honest unavailable / no data.
            <div className="flex-1 flex items-center justify-center p-4">
              <EmptyState
                illustration="error"
                size="sm"
                title="Instance unavailable"
                description="That Element instance is no longer running or has no project loaded."
              />
            </div>
          ) : (
            // State 3: real summary + read-only block list.
            <MirrorBody snapshot={snapshot} />
          )}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

function MirrorBody({
  snapshot,
}: {
  snapshot: NonNullable<ReturnType<typeof useInstancesStore.getState>["mirrorSnapshot"]>;
}) {
  const projectName =
    typeof snapshot.session?.name === "string" && snapshot.session.name.length > 0
      ? snapshot.session.name
      : "Untitled";
  const breadcrumbs = Array.isArray(snapshot.breadcrumbs)
    ? snapshot.breadcrumbs
    : [];
  const activeBoard =
    breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1] : projectName;
  const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : [];
  const blockCount = blocks.length;
  const cableCount = Array.isArray(snapshot.cables) ? snapshot.cables.length : 0;
  const isPlaying = snapshot.engine?.isPlaying === true;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Summary card — every value sourced from the peer snapshot. */}
      <div className="m-2 p-2 rounded-[6px] neu-pressed-shallow bg-pressed flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-widest text-text-dim w-14 shrink-0">
            Project
          </span>
          <span className="flex-1 truncate text-[11px] text-text-primary">
            {projectName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-widest text-text-dim w-14 shrink-0">
            Board
          </span>
          <span className="flex-1 truncate text-[11px] text-text-secondary">
            {activeBoard}
          </span>
        </div>
        <div className="flex items-center gap-3 pt-0.5">
          <span className="text-[10px] text-text-secondary tabular-nums">
            <span className="text-text-primary font-bold">{blockCount}</span>{" "}
            blocks
          </span>
          <span className="text-[10px] text-text-secondary tabular-nums">
            <span className="text-text-primary font-bold">{cableCount}</span>{" "}
            cables
          </span>
          <span className="flex items-center gap-1 text-[10px] text-text-secondary ml-auto">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isPlaying ? "" : "bg-text-dim/40"
              }`}
              style={
                isPlaying
                  ? { backgroundColor: "hsl(var(--status-ok))" }
                  : undefined
              }
              aria-hidden
            />
            {isPlaying ? "Playing" : "Stopped"}
          </span>
        </div>
      </div>

      {/* Read-only block list. */}
      <div className="px-2 pb-2 text-[9px] uppercase tracking-widest text-text-dim">
        Blocks
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-1">
        {blockCount === 0 ? (
          <div className="text-[11px] text-text-dim px-2 py-3 text-center">
            No blocks on this board.
          </div>
        ) : (
          blocks.map((b, i) => {
            const cat = toCategory(b.category);
            return (
              <div
                key={b.id ?? `mirror-block-${i}`}
                className="flex items-center gap-2 px-2 h-7 rounded-[4px] bg-surface neu-raised"
              >
                <Icon
                  name={categoryIconName(cat)}
                  size={12}
                  className={CATEGORY_TONE[cat]}
                  aria-hidden
                />
                <span className="flex-1 truncate text-[11px] text-text-primary">
                  {b.name ?? "Block"}
                </span>
                {b.isContainer ? (
                  <span className="text-[8px] uppercase tracking-wide text-text-dim">
                    Container
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default MirrorPanel;
