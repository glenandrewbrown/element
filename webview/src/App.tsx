import "./index.css";
import { useState, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { AnimatePresence, motion } from "framer-motion";
import { AppShell } from "./components/layout/AppShell";
import { Toolbar } from "./components/layout/Toolbar";
import { ToolPalette } from "./components/layout/ToolPalette";
import { InspectorHub } from "./components/layout/InspectorHub";
import { SnippetShelf } from "./components/layout/SnippetShelf";
import { QuickAccess } from "./components/layout/QuickAccess";
import { SessionTree } from "./components/layout/SessionTree";
import { LiveHealth } from "./components/layout/LiveHealth";
import {
  MacroDashboard,
  PanicButton,
} from "./components/layout/MacroDashboard";
import { DashboardBuilder } from "./components/layout/DashboardBuilder";
import { VirtualKeyboard } from "./components/layout/VirtualKeyboard";
import { GraphCanvas } from "./components/canvas/GraphCanvas";
import { CommandPalette } from "./components/canvas/CommandPalette";
import { StatusBar } from "./components/layout/StatusBar";
import { useAppStore } from "./stores/useAppStore";
import { useKeyboard } from "./hooks/useKeyboard";
import { useJuceBridge } from "./hooks/useJuceBridge";
import { useDashboardStore } from "./stores/useDashboardStore";

// Height of the virtual keyboard panel (px) — must match AppShell's STATUS_H awareness
const VKBD_H = 80;

const EASE = [0.16, 1, 0.3, 1] as const;

type PerformTab = "macros" | "dashboard";

function PerformBottomPanel() {
  // D3 shelve gates — primitive boolean selectors (Zustand v5: no useShallow needed)
  const hiddenMacros = useAppStore((s) => s.hiddenPanels.has("macros"));
  const hiddenDashboard = useAppStore((s) => s.hiddenPanels.has("dashboard"));
  const dashWidgets = useDashboardStore((s) => s.widgets);
  const [tab, setTab] = useState<PerformTab>(
    !hiddenDashboard && dashWidgets.length > 0 ? "dashboard" : "macros",
  );

  // D3: if both perform-bottom tabs are shelved, suppress the container entirely.
  // To restore: remove IDs from useAppStore.hiddenPanels and re-wire here.
  if (hiddenMacros && hiddenDashboard) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Tab strip — D3 shelved tabs filtered out */}
      <div className="h-8 flex items-stretch border-b border-black/20 bg-pressed shrink-0">
        {(["macros", "dashboard"] as PerformTab[])
          .filter((t) => (t === "macros" ? !hiddenMacros : !hiddenDashboard))
          .map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                "px-4 flex items-center text-[10px] font-black uppercase tracking-widest border-r border-white/5 transition-colors cursor-pointer",
                tab === t
                  ? "bg-panel text-accent-orange shadow-[inset_0_-2px_0_#E8A838]"
                  : "text-text-secondary hover:text-text-primary",
              ].join(" ")}
            >
              {t === "macros" ? "Macros" : "Dashboard"}
            </button>
          ))}
      </div>
      {/* Content — D3 mount-site gates (App.tsx:62 equivalent) */}
      <div className="flex-1 overflow-hidden">
        {!hiddenMacros && tab === "macros" && <MacroDashboard />}
        {!hiddenDashboard && tab === "dashboard" && <DashboardBuilder />}
      </div>
    </div>
  );
}

/** G-13 Module-tier nav breadcrumb scaffold (shell only — no logic).
 * Task 9 (G-12/G-13 SessionTree redesign) wires the real boards/modules
 * hierarchy into this slot. This is the mount-container + breadcrumb slot
 * definition only; do NOT add SessionTree internals here. */
function ProjectNavBreadcrumb() {
  return (
    <nav
      aria-label="Project hierarchy"
      className="flex items-center gap-1 px-2 border-b border-white/5 bg-surface shrink-0 select-none"
      style={{ height: 28 }}
    >
      <span className="text-[9px] uppercase tracking-widest text-text-dim font-semibold">
        Project
      </span>
      {/* G-13 breadcrumb slot — boards / modules hierarchy filled by task 9 */}
    </nav>
  );
}

function AppInner() {
  const mode = useAppStore((s) => s.mode);
  const virtualKeyboardOpen = useAppStore((s) => s.virtualKeyboardOpen);
  // D3 shelve: primitive boolean selectors — Zustand v5 safe (no useShallow needed)
  const hiddenMacros = useAppStore((s) => s.hiddenPanels.has("macros"));
  const hiddenDashboard = useAppStore((s) => s.hiddenPanels.has("dashboard"));
  const [paletteOpen, setPaletteOpen] = useState(false);

  const togglePalette = useCallback(() => setPaletteOpen((prev) => !prev), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useKeyboard({ onToggleCommandPalette: togglePalette });
  useJuceBridge();

  // Status bar is 24px tall (STATUS_H in AppShell). Virtual keyboard sits directly above it.
  const STATUS_H = 24;

  return (
    <>
      <AppShell
        toolbar={<Toolbar />}
        editLeftPanel={
          <div className="flex flex-col h-full overflow-hidden">
            {/* G-13 scaffold: Module-tier nav breadcrumb — task 9 fills this slot */}
            <ProjectNavBreadcrumb />
            {/* SessionTree: Project Boards + active Board block outline */}
            <div
              className="flex flex-col overflow-hidden"
              style={{ height: "38%", minHeight: 140 }}
            >
              <SessionTree />
            </div>
            {/* G-15: SnippetShelf relocated from bottom slot — task 11 redesigns */}
            <div
              className="border-t border-white/5 shrink-0"
              style={{ height: 64 }}
            >
              <SnippetShelf />
            </div>
            {/* ToolPalette: plugin + molecule browser */}
            <div className="flex-1 flex flex-col overflow-hidden border-t border-white/5">
              <ToolPalette />
            </div>
          </div>
        }
        editRightPanel={<InspectorHub />}
        editBottomPanel={null /* G-15: SnippetShelf relocated to left project nav */}
        performLeftPanel={<QuickAccess />}
        performRightPanel={<LiveHealth />}
        performBottomPanel={
          /* D3 shelve: PerformBottomPanel kept in JSX reference so its imports
             (MacroDashboard, DashboardBuilder) stay live for noUnusedLocals.
             When both tabs are hidden it returns null; null prop suppresses the
             AppShell BottomSlot entirely (see AppShell null-handling). */
          hiddenMacros && hiddenDashboard ? null : <PerformBottomPanel />
        }
        statusBar={<StatusBar />}
      >
        <div className="w-full h-full relative">
          <GraphCanvas />
          {mode === "perform" && <PanicButton />}
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
