import { memo, useCallback, useEffect, useState } from "react";
import { useSessionStore, type SessionGraphRow } from "../../stores/useSessionStore";
import {
  useHostExtrasStore,
  type GraphOutlineNode,
} from "../../stores/useHostExtrasStore";
import { nativeSessionSetActiveGraph } from "../../bridge/nativeSession";
import { nativeSessionGetGraphTree } from "../../bridge/nativeGraph";

// ── Inline icons (no external dep) ──

function ChevronRight({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function ChevronDown({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function FolderIcon({ size = 11, open = false }: { size?: number; open?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {open ? (
        <path d="M3 7h6l2 2h10v8a2 2 0 0 1-2 2H3z" />
      ) : (
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      )}
    </svg>
  );
}
function BoxIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

// ── Visual constants ──

const ROW_H = 22;
const INDENT = 12;

// ── Outline row ──

interface OutlineRowProps {
  node: GraphOutlineNode;
  depth: number;
}

function OutlineRow({ node, depth }: OutlineRowProps) {
  const [open, setOpen] = useState(true);
  const hasChildren = (node.children?.length ?? 0) > 0;

  return (
    <>
      <div
        className="flex items-center gap-1 px-2 hover:bg-elevated/40 cursor-default select-none text-text-secondary"
        style={{ height: ROW_H, paddingLeft: 8 + depth * INDENT }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={open ? "Collapse" : "Expand"}
            onClick={() => setOpen((o) => !o)}
            className="w-3 h-3 flex items-center justify-center text-text-dim hover:text-text-primary"
          >
            {open ? <ChevronDown /> : <ChevronRight />}
          </button>
        ) : (
          <span className="w-3 h-3" />
        )}
        <span className={node.isContainer ? "text-logic" : "text-text-dim"}>
          {node.isContainer ? <FolderIcon open={open} /> : <BoxIcon />}
        </span>
        <span className="text-[11px] truncate flex-1">
          {node.name || "(unnamed)"}
        </span>
      </div>
      {open && hasChildren
        ? node.children!.map((child, i) => (
            <OutlineRow key={child.id || i} node={child} depth={depth + 1} />
          ))
        : null}
    </>
  );
}

// ── Graph row ──

interface GraphRowProps {
  graph: SessionGraphRow;
  outline: GraphOutlineNode[];
  onActivate: (index: number) => void;
}

function GraphRow({ graph, outline, onActivate }: GraphRowProps) {
  const [open, setOpen] = useState(graph.active);
  const hasOutline = outline.length > 0;

  return (
    <>
      <div
        className={[
          "flex items-center gap-1 px-2 cursor-pointer select-none transition-colors",
          graph.active
            ? "bg-elevated text-text-primary"
            : "hover:bg-elevated/40 text-text-secondary",
        ].join(" ")}
        style={{ height: ROW_H }}
        onDoubleClick={() => !graph.active && onActivate(graph.index)}
      >
        {hasOutline && graph.active ? (
          <button
            type="button"
            aria-label={open ? "Collapse outline" : "Expand outline"}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            className="w-3 h-3 flex items-center justify-center text-text-dim hover:text-text-primary"
          >
            {open ? <ChevronDown /> : <ChevronRight />}
          </button>
        ) : (
          <span className="w-3 h-3" />
        )}
        <span
          className={[
            "inline-block w-1.5 h-1.5 rounded-full",
            graph.active ? "bg-generator shadow-[0_0_4px_rgba(74,144,217,0.6)]" : "bg-text-dim/40",
          ].join(" ")}
        />
        <span
          className="text-[11px] tabular-nums w-5 text-text-dim"
          aria-hidden="true"
        >
          {graph.index + 1}.
        </span>
        <span className="text-[11px] flex-1 truncate font-medium">
          {graph.name || `Graph ${graph.index + 1}`}
        </span>
        {!graph.active ? (
          <button
            type="button"
            className="text-[9px] uppercase tracking-wider text-text-dim hover:text-generator px-1"
            onClick={(e) => {
              e.stopPropagation();
              onActivate(graph.index);
            }}
            title="Activate this graph"
          >
            Open
          </button>
        ) : null}
      </div>
      {graph.active && open
        ? outline.map((n, i) => (
            <OutlineRow key={n.id || i} node={n} depth={1} />
          ))
        : null}
    </>
  );
}

// ── SessionTree (root) ──

function SessionTreeComponent() {
  const graphs = useSessionStore((s) => s.graphs);
  const filePath = useSessionStore((s) => s.filePath);
  const dirty = useSessionStore((s) => s.dirty);
  const outline = useHostExtrasStore((s) => s.activeGraphOutline);

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
      } catch { /* bridge not available in dev mode */ }
    })();
  }, []);

  const handleActivate = useCallback((index: number) => {
    void nativeSessionSetActiveGraph(index);
  }, []);

  const fileName =
    typeof filePath === "string" && filePath.length > 0
      ? filePath.split("/").pop() ?? "Untitled"
      : "Untitled";

  return (
    <section
      className="flex-1 flex flex-col overflow-hidden"
      aria-label="Session tree"
    >
      {/* Header */}
      <div
        className="px-2 py-1 border-b border-white/5 flex items-center gap-2 bg-surface"
        style={{ minHeight: 28 }}
      >
        <span className="text-[9px] uppercase tracking-widest text-text-dim font-semibold">
          Project
        </span>
        <span className="text-[11px] flex-1 truncate text-text-primary tabular-nums">
          {fileName}
          {dirty ? <span className="text-modifier ml-1">•</span> : null}
        </span>
        <span className="text-[9px] tabular-nums text-text-dim">
          {graphs.length} graph{graphs.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto py-1"
        style={{ scrollbarWidth: "thin" }}
      >
        {graphs.length === 0 ? (
          <div className="px-3 py-2 text-[10px] text-text-dim italic">
            No graphs in session.
          </div>
        ) : (
          graphs.map((g) => (
            <GraphRow
              key={g.id}
              graph={g}
              outline={g.active ? outline : []}
              onActivate={handleActivate}
            />
          ))
        )}
      </div>
    </section>
  );
}

/**
 * Sidebar tree of the Project's Boards (graphs) with the active Board's Block
 * outline expanded beneath it — Containers shown as folders, Blocks as boxes.
 * Use it to navigate between Boards (double-click or Open to activate) and to
 * see the nested structure of the live Board. The header shows the Project file
 * name with a modifier dot when there are unsaved changes.
 */
export const SessionTree = memo(SessionTreeComponent);
