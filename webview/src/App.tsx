import "./index.css";
import { useState, useCallback, useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { AnimatePresence, motion } from "framer-motion";
import { AppShell } from "./components/layout/AppShell";
import { Toolbar } from "./components/layout/Toolbar";
import { ToolPalette } from "./components/layout/ToolPalette";
import { InspectorHub } from "./components/layout/InspectorHub";
import { SnippetShelf } from "./components/layout/SnippetShelf";
import { SessionTree } from "./components/layout/SessionTree";
import { VirtualKeyboard } from "./components/layout/VirtualKeyboard";
import { GraphCanvas } from "./components/canvas/GraphCanvas";
import { CommandPalette } from "./components/canvas/CommandPalette";
import { StatusBar } from "./components/layout/StatusBar";
import { useAppStore } from "./stores/useAppStore";
import { useKeyboard } from "./hooks/useKeyboard";
import { useJuceBridge } from "./hooks/useJuceBridge";
import { useSessionStore } from "./stores/useSessionStore";

// ── SessionTree collapse ─────────────────────────────────────────────────────
// Persist the collapsed state in localStorage outside the main app store so it
// doesn't bloat the store interface.  Default: collapsed when there are more
// than 6 blocks visible (heuristic), or when the stored preference is "true".
const TREE_COLLAPSED_KEY = "element-session-tree-collapsed";

function readTreeCollapsed(): boolean {
  try {
    return localStorage.getItem(TREE_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeTreeCollapsed(v: boolean) {
  try {
    localStorage.setItem(TREE_COLLAPSED_KEY, String(v));
  } catch { /* ignore */ }
}

// SHELVED (D3, hide-UI keep-code) — see FINISH-APP-PLAN. Perform mode +
// MacroDashboard + DashboardBuilder + Scene system are removed from the active
// UI and nav (App is locked to Edit). The component files (MacroDashboard,
// DashboardBuilder, PerformBottomPanel host, QuickAccess, LiveHealth,
// SceneLauncher, PanicButton) and their Zustand stores (useDashboardStore,
// usePerformStore) remain on disk, intact and reversible — they are simply no
// longer imported/mounted here. To restore: re-add the perform panel props
// (performLeftPanel/performRightPanel/performBottomPanel) and the mode toggle.

// Height of the virtual keyboard panel (px) — must match AppShell's STATUS_H awareness
const VKBD_H = 80;

const EASE = [0.16, 1, 0.3, 1] as const;

function AppInner() {
  const virtualKeyboardOpen = useAppStore((s) => s.virtualKeyboardOpen);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Session tree collapse — persisted in localStorage (not the main store)
  const [treeCollapsed, setTreeCollapsed] = useState(readTreeCollapsed);
  const graphs = useSessionStore((s) => s.graphs);

  // Auto-collapse when >6 blocks on first mount (only if no stored preference)
  useEffect(() => {
    const stored = localStorage.getItem(TREE_COLLAPSED_KEY);
    if (stored === null && graphs.length > 6) {
      setTreeCollapsed(true);
      writeTreeCollapsed(true);
    }
  // Only runs once on mount — graphs.length is intentionally not a dep here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTree = useCallback(() => {
    setTreeCollapsed((v) => {
      writeTreeCollapsed(!v);
      return !v;
    });
  }, []);

  const togglePalette = useCallback(() => setPaletteOpen((prev) => !prev), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useKeyboard({ onToggleCommandPalette: togglePalette, paletteOpen, onClosePalette: closePalette });
  useJuceBridge();

  // Status bar is 24px tall (STATUS_H in AppShell). Virtual keyboard sits directly above it.
  const STATUS_H = 24;

  // Collapsed session tree shows a 28px header only; expanded gets up to 34%
  // of the panel height but never less than 100px.
  const TREE_HEADER_H = 28;
  const treeExpandedStyle: React.CSSProperties = { minHeight: 100, maxHeight: "34%" };
  const treeCollapsedStyle: React.CSSProperties = { height: TREE_HEADER_H, minHeight: TREE_HEADER_H };

  return (
    <>
      <AppShell
        toolbar={<Toolbar />}
        editLeftPanel={
          <div className="flex flex-col h-full overflow-hidden">
            {/* ── Session tree: collapsible header + body ── */}
            <div
              className="shrink-0 flex flex-col overflow-hidden border-b border-white/5"
              style={treeCollapsed ? treeCollapsedStyle : treeExpandedStyle}
            >
              {/* Collapse toggle header */}
              <button
                type="button"
                onClick={toggleTree}
                title={treeCollapsed ? "Expand project tree" : "Collapse project tree"}
                aria-expanded={!treeCollapsed}
                aria-label={treeCollapsed ? "Expand project tree" : "Collapse project tree"}
                className="w-full flex items-center gap-2 px-2 bg-surface hover:bg-elevated transition-colors text-text-secondary"
                style={{ height: TREE_HEADER_H, minHeight: TREE_HEADER_H }}
              >
                <svg
                  width={10}
                  height={10}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 transition-transform duration-150"
                  style={{ transform: treeCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
                  aria-hidden
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                <span className="text-[9px] font-bold uppercase tracking-widest truncate flex-1 text-left">
                  Project
                </span>
                <span className="text-[9px] tabular-nums text-text-dim shrink-0">
                  {graphs.length} board{graphs.length === 1 ? "" : "s"}
                </span>
              </button>
              {/* Tree body — hidden when collapsed */}
              {!treeCollapsed && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <SessionTree hideHeader />
                </div>
              )}
            </div>
            {/* ── Plugin browser: gets the remaining height ── */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <ToolPalette />
            </div>
          </div>
        }
        editRightPanel={<InspectorHub />}
        editBottomPanel={<SnippetShelf />}
        statusBar={<StatusBar />}
      >
        <div className="w-full h-full relative">
          <GraphCanvas />
        </div>
      </AppShell>

      {/* Virtual Keyboard — slides up from bottom, sits above the status bar */}
      <AnimatePresence>
        {virtualKeyboardOpen && (
          <motion.div
            key="virtual-keyboard"
            initial={{ y: VKBD_H, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: VKBD_H, opacity: 0 }}
            transition={{ ease: EASE, duration: 0.2 }}
            className="fixed left-0 right-0 z-50 overflow-hidden"
            style={{ bottom: STATUS_H, height: VKBD_H }}
          >
            <VirtualKeyboard />
          </motion.div>
        )}
      </AnimatePresence>

      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </>
  );
}

function App() {
  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  );
}

export default App;
