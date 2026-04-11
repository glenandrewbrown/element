import "./index.css";
import { useState, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { AppShell } from "./components/layout/AppShell";
import { Toolbar } from "./components/layout/Toolbar";
import { ToolPalette } from "./components/layout/ToolPalette";
import { InspectorHub } from "./components/layout/InspectorHub";
import { SnippetShelf } from "./components/layout/SnippetShelf";
import { QuickAccess } from "./components/layout/QuickAccess";
import { LiveHealth } from "./components/layout/LiveHealth";
import {
  MacroDashboard,
  PanicButton,
} from "./components/layout/MacroDashboard";
import { GraphCanvas } from "./components/canvas/GraphCanvas";
import { CommandPalette } from "./components/canvas/CommandPalette";
import { useAppStore } from "./stores/useAppStore";
import { useKeyboard } from "./hooks/useKeyboard";
import { useJuceBridge } from "./hooks/useJuceBridge";

function AppInner() {
  const mode = useAppStore((s) => s.mode);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const togglePalette = useCallback(() => setPaletteOpen((prev) => !prev), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useKeyboard({ onToggleCommandPalette: togglePalette });
  useJuceBridge();

  return (
    <>
      <AppShell
        toolbar={<Toolbar />}
        editLeftPanel={<ToolPalette />}
        editRightPanel={<InspectorHub />}
        editBottomPanel={<SnippetShelf />}
        performLeftPanel={<QuickAccess />}
        performRightPanel={<LiveHealth />}
        performBottomPanel={<MacroDashboard />}
      >
        <div className="w-full h-full relative">
          <GraphCanvas />
          {mode === "perform" && <PanicButton />}
        </div>
      </AppShell>

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
