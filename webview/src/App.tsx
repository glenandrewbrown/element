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
  const dashWidgets = useDashboardStore((s) => s.widgets);
  const [tab, setTab] = useState<PerformTab>(
    dashWidgets.length > 0 ? "dashboard" : "macros",
  );

  return (
    <div className="flex flex-col h-full">
      {/* Tab strip */}
      <div className="h-8 flex items-stretch border-b border-black/20 bg-pressed shrink-0">
        {(["macros", "dashboard"] as PerformTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={[
              "px-4 flex items-center text-[10px] font-black uppercase tracking-widest border-r border-white/5 transition-colors cursor-pointer",
              tab === t
                ? "bg-panel text-modifier shadow-[inset_0_-2px_0_#E8A838]"
                : "text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            {t === "macros" ? "Macros" : "Dashboard"}
          </button>
        ))}
      </div>
      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "macros" ? <MacroDashboard /> : <DashboardBuilder />}
      </div>
    </div>
  );
}

function AppInner() {
  const mode = useAppStore((s) => s.mode);
  const virtualKeyboardOpen = useAppStore((s) => s.virtualKeyboardOpen);
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
            <div className="flex flex-col" style={{ height: "38%", minHeight: 140 }}>
              <SessionTree />
            </div>
            <div className="flex-1 flex flex-col overflow-hidden border-t border-white/5">
              <ToolPalette />
            </div>
          </div>
        }
        editRightPanel={<InspectorHub />}
        editBottomPanel={<SnippetShelf />}
        performLeftPanel={<QuickAccess />}
        performRightPanel={<LiveHealth />}
        performBottomPanel={<PerformBottomPanel />}
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
