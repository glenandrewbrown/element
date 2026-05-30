import { memo, useCallback, useEffect, useState } from "react";
import { useSessionStore, type SessionGraphRow } from "../../stores/useSessionStore";
import {
  useHostExtrasStore,
  type GraphOutlineNode,
} from "../../stores/useHostExtrasStore";
import { nativeSessionSetActiveGraph } from "../../bridge/nativeSession";
import { nativeSessionGetGraphTree } from "../../bridge/nativeGraph";
import { catConfig } from "../canvas/Block";
import type { BlockCategory } from "../../data/types";

/**
 * Extension of GraphOutlineNode with optional enrichment fields.
 * The C++ bridge (`buildGraphOutlineRecursive`) currently emits id/name/isContainer/children
 * only — category and routingCue are absent at runtime and will be undefined.
 * Stories seed these fields via fixture data so the full row design is visible and testable.
 * Wire-up is tracked as a bridge data-path gap (B1 evidence note).
 */
type RichOutlineNode = GraphOutlineNode & {
  category?: BlockCategory;
  /** e.g. "MIDI → Audio", "Audio → Audio" — computed from port types in stories */
  routingCue?: string;
};

// ── Visual constants ──
const INDENT_PX = 12;

// ── SVG icons ──

function ChevronRight({ size = 10 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronDown({ size = 10 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function BoardIcon({ active = false }: { active?: boolean }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: active ? 1 : 0.45 }}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  );
}

function ContainerIcon() {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7h6l2 2h10v8a2 2 0 0 1-2 2H3z" />
    </svg>
  );
}

function BlockIcon() {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

// ── Category colour dot (driven by catConfig.hex) ──
// Renders nothing when category is absent (runtime: bridge doesn't emit it yet).
function CatDot({ category }: { category?: BlockCategory }) {
  if (!category) return null;
  const { hex } = catConfig[category];
  return (
    <span
      className="inline-block shrink-0 rounded-sm"
      style={{ width: 6, height: 6, backgroundColor: hex }}
    />
  );
}

// ── Type badge (category label or "Container") ──
function TypeBadge({
  category,
  isContainer,
}: {
  category?: BlockCategory;
  isContainer?: boolean;
}) {
  if (isContainer) {
    return (
      <span
        className="shrink-0 text-[9px] px-1 py-px rounded bg-pressed/60 text-[#2BC4C4] tracking-wide whitespace-nowrap"
        data-block-type="container"
      >
        Container
      </span>
    );
  }
  if (!category) return null;
  const { hex, label } = catConfig[category];
  return (
    <span
      className="shrink-0 text-[9px] px-1 py-px rounded bg-pressed/60 tracking-wide whitespace-nowrap"
      style={{ color: hex }}
      data-block-type={category}
    >
      {label}
    </span>
  );
}

// ── Signal routing cue (story-seeded; absent at runtime until bridge emits it) ──
function RoutingCue({ cue }: { cue?: string }) {
  if (!cue) return null;
  return (
    <span
      className="shrink-0 text-[9px] text-text-dim/60 whitespace-nowrap"
      data-routing-cue
    >
      {cue}
    </span>
  );
}

// ── Local module/container breadcrumb (drill-down path within panel) ──
interface LocalBreadcrumbProps {
  path: Array<{ id: string; name: string }>;
  onNavigate: (index: number) => void;
}

function LocalBreadcrumb({ path, onNavigate }: LocalBreadcrumbProps) {
  if (path.length === 0) return null;
  return (
    <nav
      aria-label="Board navigation"
      className="flex items-center flex-wrap gap-0.5 px-2 py-0.5 border-b border-white/5 bg-canvas/60"
      style={{ minHeight: "var(--control-h-sm, 20px)" }}
    >
      <button
        type="button"
        className="text-[9px] text-text-secondary hover:text-accent-blue tracking-wide transition-colors"
        onClick={() => onNavigate(-1)}
      >
        Board
      </button>
      {path.map((crumb, i) => {
        const isLast = i === path.length - 1;
        return (
          <span key={crumb.id} className="flex items-center gap-0.5">
            <span className="text-text-dim" style={{ lineHeight: 0 }}>
              <ChevronRight size={8} />
            </span>
            <button
              type="button"
              className={[
                "text-[9px] tracking-wide transition-colors",
                isLast
                  ? "text-text-primary cursor-default"
                  : "text-text-secondary hover:text-accent-blue",
              ].join(" ")}
              onClick={() => !isLast && onNavigate(i)}
            >
              {crumb.name}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

// ── Outline row (block or container) ──
interface OutlineRowProps {
  node: RichOutlineNode;
  depth: number;
  onDrillDown: (node: RichOutlineNode) => void;
}

function OutlineRow({ node, depth, onDrillDown }: OutlineRowProps) {
  const [open, setOpen] = useState(true);
  const hasChildren = (node.children?.length ?? 0) > 0;

  return (
    <>
      <div
        className="flex items-center gap-1.5 hover:bg-elevated/40 cursor-default select-none transition-colors"
        style={{
          height: "var(--control-h-sm, 20px)",
          paddingLeft: `${8 + depth * INDENT_PX}px`,
          paddingRight: 6,
        }}
        role="treeitem"
        aria-expanded={hasChildren ? open : undefined}
      >
        {/* expand / collapse */}
        {hasChildren ? (
          <button
            type="button"
            aria-label={open ? "Collapse" : "Expand"}
            onClick={() => setOpen((o) => !o)}
            className="w-3 h-3 flex items-center justify-center text-text-dim hover:text-text-primary shrink-0"
          >
            {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
          </button>
        ) : (
          <span className="w-3 h-3 shrink-0" aria-hidden="true" />
        )}

        {/* type icon */}
        <span className="text-text-dim shrink-0" aria-hidden="true">
          {node.isContainer ? <ContainerIcon /> : <BlockIcon />}
        </span>

        {/* category colour dot (present when bridge provides category) */}
        <CatDot category={node.category} />

        {/* user-tagged name */}
        <span
          className="flex-1 truncate min-w-0 text-text-secondary"
          style={{ fontSize: "var(--text-sm, 11px)" }}
          data-block-name
        >
          {node.name || "(unnamed)"}
        </span>

        {/* type badge */}
        <TypeBadge category={node.category} isContainer={node.isContainer} />

        {/* routing cue */}
        <RoutingCue cue={node.routingCue} />

        {/* drill into container */}
        {node.isContainer ? (
          <button
            type="button"
            aria-label={`Enter container ${node.name}`}
            title={`Enter ${node.name}`}
            onClick={() => onDrillDown(node)}
            className="w-3 h-3 flex items-center justify-center text-text-dim hover:text-accent-blue shrink-0 ml-0.5 transition-colors"
          >
            <ChevronRight size={9} />
          </button>
        ) : null}
      </div>

      {/* children */}
      {open && hasChildren
        ? (node.children as RichOutlineNode[]).map((child, i) => (
            <OutlineRow
              key={child.id || i}
              node={child}
              depth={depth + 1}
              onDrillDown={onDrillDown}
            />
          ))
        : null}
    </>
  );
}

// ── Board row ──
interface BoardRowProps {
  board: SessionGraphRow;
  outline: RichOutlineNode[];
  drillPath: Array<{ id: string; name: string }>;
  onActivate: (index: number) => void;
  onDrillDown: (node: RichOutlineNode) => void;
  onNavigateDrill: (index: number) => void;
}

function BoardRow({
  board,
  outline,
  drillPath,
  onActivate,
  onDrillDown,
  onNavigateDrill,
}: BoardRowProps) {
  const [open, setOpen] = useState(board.active);
  const hasOutline = outline.length > 0;

  // Resolve which nodes to display based on drill path
  const displayedNodes = (() => {
    let nodes: RichOutlineNode[] = outline;
    for (const step of drillPath) {
      const container = nodes.find((n) => n.id === step.id);
      if (container?.children) {
        nodes = container.children as RichOutlineNode[];
      } else {
        break;
      }
    }
    return nodes;
  })();

  return (
    <>
      {/* Board header row */}
      <div
        className={[
          "flex items-center gap-1.5 px-2 cursor-pointer select-none transition-colors",
          board.active
            ? "bg-elevated text-text-primary"
            : "hover:bg-elevated/40 text-text-secondary",
        ].join(" ")}
        style={{ height: "var(--control-h-md, 28px)" }}
        onDoubleClick={() => !board.active && onActivate(board.index)}
        role="treeitem"
      >
        {/* expand outline toggle (active board only) */}
        {hasOutline && board.active ? (
          <button
            type="button"
            aria-label={open ? "Collapse outline" : "Expand outline"}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            className="w-3 h-3 flex items-center justify-center text-text-dim hover:text-text-primary shrink-0"
          >
            {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
          </button>
        ) : (
          <span className="w-3 h-3 shrink-0" aria-hidden="true" />
        )}

        {/* active pulse indicator */}
        <span
          className={[
            "w-2 h-2 rounded-full shrink-0 transition-all",
            board.active
              ? "bg-accent-blue shadow-[0_0_4px_rgba(74,144,217,0.55)]"
              : "bg-text-dim/25",
          ].join(" ")}
          aria-hidden="true"
        />

        {/* board canvas icon */}
        <span
          className={board.active ? "text-accent-blue" : "text-text-dim"}
          aria-hidden="true"
        >
          <BoardIcon active={board.active} />
        </span>

        {/* index number */}
        <span
          className="tabular-nums text-text-dim shrink-0"
          style={{ fontSize: "var(--text-xs, 10px)" }}
          aria-hidden="true"
        >
          {board.index + 1}.
        </span>

        {/* board name */}
        <span
          className="flex-1 truncate min-w-0 font-medium"
          style={{ fontSize: "var(--text-md, 12px)" }}
        >
          {board.name || `Board ${board.index + 1}`}
        </span>

        {/* activate button (inactive boards) */}
        {!board.active ? (
          <button
            type="button"
            className="text-[9px] uppercase tracking-wider text-text-dim hover:text-accent-blue px-1 shrink-0 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onActivate(board.index);
            }}
            title="Open this Board"
          >
            Open
          </button>
        ) : null}
      </div>

      {/* Active board outline + drill breadcrumb */}
      {board.active && open ? (
        <>
          <LocalBreadcrumb path={drillPath} onNavigate={onNavigateDrill} />
          {displayedNodes.length > 0 ? (
            displayedNodes.map((n, i) => (
              <OutlineRow
                key={n.id || i}
                node={n}
                depth={1}
                onDrillDown={onDrillDown}
              />
            ))
          ) : (
            <div
              className="text-text-dim/50 italic px-3 py-1"
              style={{ paddingLeft: 20, fontSize: "var(--text-xs, 10px)" }}
            >
              Empty
            </div>
          )}
        </>
      ) : null}
    </>
  );
}

// ── SessionTree (root) ──

function SessionTreeComponent() {
  const boards = useSessionStore((s) => s.graphs);
  const filePath = useSessionStore((s) => s.filePath);
  const dirty = useSessionStore((s) => s.dirty);
  // Cast to RichOutlineNode[] — extra fields (category, routingCue) are picked up
  // when present (story fixtures); silently absent at runtime until bridge is updated.
  const outline = useHostExtrasStore(
    (s) => s.activeGraphOutline,
  ) as RichOutlineNode[];

  const [drillPath, setDrillPath] = useState<
    Array<{ id: string; name: string }>
  >([]);

  // Reset drill path whenever the active board changes
  const activeId = boards.find((b) => b.active)?.id;
  useEffect(() => {
    setDrillPath([]);
  }, [activeId]);

  useEffect(() => {
    void (async () => {
      try {
        const tree = await nativeSessionGetGraphTree();
        if (tree.length > 0) {
          useSessionStore.getState().hydrateFromEngine({
            graphs: tree.map((g, i) => ({
              id: String(g.id),
              name: g.name,
              index: g.index ?? i,
              active: g.active,
            })),
          });
        }
      } catch {
        /* bridge not available in dev mode */
      }
    })();
  }, []);

  const handleActivate = useCallback((index: number) => {
    void nativeSessionSetActiveGraph(index);
  }, []);

  const handleDrillDown = useCallback((node: RichOutlineNode) => {
    setDrillPath((p) => [...p, { id: node.id, name: node.name }]);
  }, []);

  const handleNavigateDrill = useCallback((index: number) => {
    if (index < 0) {
      setDrillPath([]);
    } else {
      setDrillPath((p) => p.slice(0, index + 1));
    }
  }, []);

  const fileName =
    typeof filePath === "string" && filePath.length > 0
      ? (filePath.split("/").pop() ?? "Untitled")
      : "Untitled";

  const boardCount = boards.length;

  return (
    <section
      className="flex-1 flex flex-col overflow-hidden"
      aria-label="Session tree"
      role="tree"
    >
      {/* ── Header ── */}
      <div
        className="px-2 border-b border-white/5 flex items-center gap-2 bg-surface shrink-0"
        style={{ minHeight: "var(--control-h-md, 28px)" }}
      >
        <span
          className="uppercase tracking-widest text-text-dim font-semibold shrink-0"
          style={{ fontSize: "var(--text-xs, 10px)" }}
        >
          Project
        </span>
        <span
          className="flex-1 truncate text-text-primary font-medium min-w-0"
          style={{ fontSize: "var(--text-sm, 11px)" }}
        >
          {fileName}
          {dirty ? (
            <span
              className="text-accent-orange ml-1"
              aria-label="unsaved changes"
            >
              •
            </span>
          ) : null}
        </span>
        <span
          className="tabular-nums text-text-dim shrink-0"
          style={{ fontSize: "var(--text-xs, 10px)" }}
        >
          {boardCount} {boardCount === 1 ? "Board" : "Boards"}
        </span>
      </div>

      {/* ── Body ── */}
      <div
        className="flex-1 overflow-y-auto py-0.5"
        style={{ scrollbarWidth: "thin" }}
        role="group"
      >
        {boards.length === 0 ? (
          <div className="px-3 py-4 flex flex-col gap-1">
            <span
              className="text-text-dim italic"
              style={{ fontSize: "var(--text-sm, 11px)" }}
            >
              No Boards in this Project.
            </span>
            <span
              className="text-text-dim/60"
              style={{ fontSize: "var(--text-xs, 10px)" }}
            >
              Add a Block to the canvas to get started.
            </span>
          </div>
        ) : (
          boards.map((b) => (
            <BoardRow
              key={b.id}
              board={b}
              outline={b.active ? outline : []}
              drillPath={b.active ? drillPath : []}
              onActivate={handleActivate}
              onDrillDown={handleDrillDown}
              onNavigateDrill={handleNavigateDrill}
            />
          ))
        )}
      </div>
    </section>
  );
}

/**
 * Sidebar Project navigation tree. Shows all Boards in the Project with the
 * active Board's Block outline expanded below it.
 *
 * Each outline row shows:
 * - User-tagged block name
 * - Category colour dot + type badge (when bridge emits `category` — currently
 *   story-fixture-only; tracked as bridge data-path gap B1)
 * - Signal routing cue (when bridge emits `routingCue` — same gap)
 * - Container drill-down with breadcrumb trail
 *
 * Terminology: "Boards" (not "Graphs"), "Blocks" (not "Nodes"),
 * "Container" (not "Module" — Module tier is a separate data model per spec).
 *
 * Store deps: `useSessionStore` (boards/filePath/dirty) + `useHostExtrasStore`
 * (activeGraphOutline). Seed both in stories.
 */
export const SessionTree = memo(SessionTreeComponent);
