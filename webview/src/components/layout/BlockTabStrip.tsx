import { useAppStore } from "../../stores/useAppStore";
import { useGraphStore } from "../../stores/useGraphStore";

const ICON_CLOSE = (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

export function BlockTabStrip() {
  const openTabs = useAppStore((s) => s.openBlockTabs);
  const closeTab = useAppStore((s) => s.closeBlockTab);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectNode = useGraphStore((s) => s.selectNode);
  const nodes = useGraphStore((s) => s.nodes);

  if (openTabs.length === 0) return null;

  return (
    <div className="h-8 bg-[#222226]/80 flex items-center px-4 gap-1 border-b border-white/5 backdrop-blur-sm select-none">
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
                ? "bg-[#1A1A1E] text-generator border-x border-t border-white/10 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]"
                : "text-text-secondary font-medium hover:bg-white/5",
            ].join(" ")}
          >
            {name}
            <button
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
              {ICON_CLOSE}
            </button>
          </div>
        );
      })}
    </div>
  );
}
