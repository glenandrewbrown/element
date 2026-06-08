import {
  nativeSessionSetActiveGraph,
  nativeSessionImportGraph,
  nativeSessionExportGraph,
} from "../../../bridge/nativeSession";
import type { GraphOutlineNode } from "../../../stores/useHostExtrasStore";
import type { SessionGraphRow } from "../../../stores/useSessionStore";
import { CollapsibleSection } from "./CollapsibleSection";

function OutlineRow({ node, depth }: { node: GraphOutlineNode; depth: number }) {
  return (
    <div className="pl-1">
      <div
        className={`text-[10px] truncate ${node.isContainer ? "text-accent-teal font-bold" : "text-text-dim"}`}
        style={{ paddingLeft: depth * 10 }}
        title={node.id}
      >
        {node.name || "—"}
      </div>
      {node.children?.map((c) => (
        <OutlineRow key={c.id} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

interface BoardsSectionProps {
  sessionGraphs: SessionGraphRow[];
  activeGraphOutline: GraphOutlineNode[];
}

/**
 * Collapsible Boards section — default collapsed.
 * Contains: Boards list + Board outline + Import/Export .elg as compact actions.
 */
export function BoardsSection({ sessionGraphs, activeGraphOutline }: BoardsSectionProps) {
  const hasBoards = sessionGraphs.length > 0;
  const hasOutline = activeGraphOutline.length > 0;

  if (!hasBoards && !hasOutline) {
    // Always render with import/export even when no boards exist.
    return (
      <CollapsibleSection
        label={sessionGraphs.length > 0 ? `Boards (${sessionGraphs.length})` : "Boards"}
        defaultOpen={false}
        data-testid="boards-section"
      >
        <BoardsContent
          sessionGraphs={sessionGraphs}
          activeGraphOutline={activeGraphOutline}
        />
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection
      label="Boards"
      defaultOpen={false}
      data-testid="boards-section"
    >
      <BoardsContent
        sessionGraphs={sessionGraphs}
        activeGraphOutline={activeGraphOutline}
      />
    </CollapsibleSection>
  );
}

function BoardsContent({
  sessionGraphs,
  activeGraphOutline,
}: {
  sessionGraphs: SessionGraphRow[];
  activeGraphOutline: GraphOutlineNode[];
}) {
  return (
    <div className="pb-2 mb-2 border-b border-white/5 space-y-1">
      {sessionGraphs.map((g) => (
        <button
          key={g.id}
          type="button"
          className={`w-full text-left text-[10px] px-2 py-1 rounded-md truncate transition-colors ${
            g.active
              ? "bg-accent-blue/20 text-accent-blue"
              : "text-text-secondary hover:bg-white/5"
          }`}
          onClick={() => void nativeSessionSetActiveGraph(g.index)}
        >
          {g.name}
        </button>
      ))}

      {activeGraphOutline.length > 0 ? (
        <div className="text-[9px] font-bold text-text-secondary tracking-widest uppercase pt-1 px-1">
          Board outline
        </div>
      ) : null}
      {activeGraphOutline.map((n) => (
        <OutlineRow key={n.id} node={n} depth={0} />
      ))}

      <div className="flex gap-1 pt-1">
        <button
          type="button"
          className="flex-1 text-[9px] py-1.5 rounded-md bg-pressed text-text-secondary uppercase tracking-wider hover:bg-elevated hover:text-text-primary transition-colors"
          onClick={() => void nativeSessionImportGraph()}
        >
          Import .elg
        </button>
        <button
          type="button"
          className="flex-1 text-[9px] py-1.5 rounded-md bg-pressed text-text-secondary uppercase tracking-wider hover:bg-elevated hover:text-text-primary transition-colors"
          onClick={() => void nativeSessionExportGraph()}
        >
          Export .elg
        </button>
      </div>
    </div>
  );
}
