import { useEffect, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGraphStore } from "../stores/useGraphStore";
import { useAppStore } from "../stores/useAppStore";

interface UseKeyboardOptions {
  onToggleCommandPalette: () => void;
}

export function useKeyboard({ onToggleCommandPalette }: UseKeyboardOptions) {
  const reactFlow = useReactFlow();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore when typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const meta = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;
      const key = e.key;

      // ── Cmd/Ctrl combos ──

      if (meta) {
        switch (key) {
          case "k": {
            e.preventDefault();
            onToggleCommandPalette();
            return;
          }

          case "1": {
            e.preventDefault();
            useAppStore.getState().togglePanel("left");
            return;
          }

          case "2": {
            e.preventDefault();
            useAppStore.getState().togglePanel("right");
            return;
          }

          case "3": {
            e.preventDefault();
            useAppStore.getState().togglePanel("bottom");
            return;
          }

          case "f": {
            e.preventDefault();
            // Focus the search input in ToolPalette
            const searchInput = document.querySelector<HTMLInputElement>(
              'aside input[placeholder*="Search"]',
            );
            searchInput?.focus();
            return;
          }

          case "z": {
            e.preventDefault();
            if (shift) {
              // Redo — stub: log for now
              console.debug("[keyboard] redo");
            } else {
              // Undo — stub: log for now
              console.debug("[keyboard] undo");
            }
            return;
          }

          case "d": {
            e.preventDefault();
            const { selectedNodeId, nodes } = useGraphStore.getState();
            if (!selectedNodeId) return;
            const original = nodes.find((n) => n.id === selectedNodeId);
            if (!original) return;
            // Stub duplication: log the intent
            console.debug("[keyboard] duplicate block:", original.name);
            return;
          }

          case "0": {
            e.preventDefault();
            reactFlow.fitView({ padding: 0.15, duration: 200 });
            return;
          }

          case "=":
          case "+": {
            e.preventDefault();
            reactFlow.zoomIn({ duration: 150 });
            return;
          }

          case "-": {
            e.preventDefault();
            reactFlow.zoomOut({ duration: 150 });
            return;
          }
        }
      }

      // ── Ctrl+0-9: save spatial bookmark (stub) ──

      if (e.ctrlKey && !e.metaKey && key >= "0" && key <= "9") {
        e.preventDefault();
        const viewport = reactFlow.getViewport();
        console.debug(`[keyboard] save bookmark ${key}:`, viewport);
        return;
      }

      // ── Shift combos (no meta) ──

      if (shift && !meta) {
        // Shift+0-9: recall spatial bookmark (stub)
        if (key >= "0" && key <= "9") {
          e.preventDefault();
          console.debug(`[keyboard] recall bookmark ${key}`);
          return;
        }

        switch (key) {
          case "C": {
            e.preventDefault();
            console.debug("[keyboard] create comment box at viewport center");
            return;
          }

          case "M": {
            e.preventDefault();
            // Toggle minimap — React Flow's MiniMap doesn't expose a toggle,
            // so this would need state. Stub for now.
            console.debug("[keyboard] toggle minimap");
            return;
          }
        }
      }

      // ── Plain keys ──

      switch (key) {
        case "Escape": {
          const { selectedNodeId, selectedEdgeId, breadcrumbStack } =
            useGraphStore.getState();
          if (selectedNodeId || selectedEdgeId) {
            useGraphStore.getState().clearSelection();
          } else if (breadcrumbStack.length > 1) {
            useGraphStore.getState().popBreadcrumb();
          }
          return;
        }

        case "Tab": {
          e.preventDefault();
          const { nodes, selectedNodeId } = useGraphStore.getState();
          if (nodes.length === 0) return;
          const currentIdx = nodes.findIndex((n) => n.id === selectedNodeId);
          const nextIdx = (currentIdx + 1) % nodes.length;
          useGraphStore.getState().selectNode(nodes[nextIdx].id);
          return;
        }

        case "Delete":
        case "Backspace": {
          const { selectedNodeId } = useGraphStore.getState();
          if (!selectedNodeId) return;
          // Stub deletion: log the intent
          console.debug("[keyboard] delete block:", selectedNodeId);
          return;
        }
      }
    },
    [onToggleCommandPalette, reactFlow],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
