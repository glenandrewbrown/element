import "./index.css";
import { useState, useCallback } from "react";
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

  const togglePalette = useCallback(() => setPaletteOpen((prev) => !prev), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useKeyboard({ onToggleCommandPalette: togglePalette, paletteOpen, onClosePalette: closePalette });
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
