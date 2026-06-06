import { useAppStore } from "../../stores/useAppStore";
import { useGraphStore } from "../../stores/useGraphStore";
import { Icon } from "../neu";

/**
 * Horizontal strip of open Block editor tabs above the canvas, mirroring a code
 * editor's tab bar. Use it to keep several Blocks "pinned" for quick switching
 * while working a Board — clicking a tab selects that Block, the X closes it.
 * Reads the open-tab list from the app store and Block names from the graph
 * store.
 *
 * RESERVED HEIGHT (architect-perf-plan §6/C4): the outer `h-8` container is
 * ALWAYS rendered — even with zero open tabs — so the canvas pane below never
 * resizes when the first selection opens a tab. Previously this returned `null`
 * when empty, so the first block-select grew the strip 0→32px, shrank the
 * React-Flow pane, and triggered an auto-refit that jumped the viewport under
 * the cursor (the live-confirmed "viewport jumps on first selection" defect).
 * Only the tab CONTENT is conditional now; the row's footprint is constant.
 */
export function BlockTabStrip() {
  const openTabs = useAppStore((s) => s.openBlockTabs);
  const closeTab = useAppStore((s) => s.closeBlockTab);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectNode = useGraphStore((s) => s.selectNode);
  const nodes = useGraphStore((s) => s.nodes);

  return (
    <div className="h-8 shrink-0 bg-[#222226] flex items-center px-4 gap-1 border-b border-white/5 select-none">
      {openTabs.map((tabId) => {
        const node = nodes.find((n) => n.id === tabId);
        const name = node?.name ?? tabId;
        const isActive = tabId === selectedNodeId;

        return (
          <div
            key={tabId}
            onClick={() => selectNode(tabId)}
            className={[
              "px-3 py-1 rounded-t text-[10px] font-bold flex items-center gap-2 cursor-pointer transition-colors",
              isActive
                ? "bg-[#1A1A1E] text-accent-blue border-x border-t border-white/10 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]"
                : "text-text-secondary font-medium hover:bg-white/5",
            ].join(" ")}
          >
            {name}
            <button
              title={`Close ${name} tab`}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tabId);
              }}
              className={[
                "transition-opacity",
                isActive
                  ? "opacity-50 hover:opacity-100"
                  : "opacity-30 hover:opacity-60",
              ].join(" ")}
            >
              <Icon name="X" size={12} aria-label={`Close ${name} tab`} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
