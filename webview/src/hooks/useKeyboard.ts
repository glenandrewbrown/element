import { useEffect, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGraphStore } from "../stores/useGraphStore";
import { useAppStore } from "../stores/useAppStore";
import {
  nativeGraphCommentAdd,
  nativeGraphCommentDelete,
  nativeGraphCopyNodes,
  nativeGraphDuplicateNode,
  nativeGraphDuplicateNodes,
  nativeGraphPasteNodes,
  nativeGraphRemoveNode,
  nativeGraphRenameNode,
  nativeRedo,
  nativeUndo,
} from "../bridge/nativeGraph";
import {
  nativeSessionSave,
  nativeSessionSaveAs,
} from "../bridge/nativeSession";

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

          case "s": {
            e.preventDefault();
            if (e.shiftKey) void nativeSessionSaveAs();
            else void nativeSessionSave();
            return;
          }

          case "z": {
            e.preventDefault();
            if (shift) void nativeRedo();
            else void nativeUndo();
            return;
          }

          case "c": {
            e.preventDefault();
            const { selectedNodeId, nodes, commentBoxes } =
              useGraphStore.getState();
            if (!selectedNodeId) return;
            if (commentBoxes.some((c) => c.id === selectedNodeId)) return;
            if (!nodes.some((n) => n.id === selectedNodeId)) return;
            void nativeGraphCopyNodes([selectedNodeId]);
            return;
          }

          case "v": {
            e.preventDefault();
            void nativeGraphPasteNodes();
            return;
          }

          case "d": {
            e.preventDefault();
            const { selectedNodeId, nodes, commentBoxes } =
              useGraphStore.getState();
            if (!selectedNodeId) return;
            if (commentBoxes.some((c) => c.id === selectedNodeId)) return;
            const original = nodes.find((n) => n.id === selectedNodeId);
            if (!original) return;
            void nativeGraphDuplicateNodes([selectedNodeId]).then((n) => {
              if (n === 0) void nativeGraphDuplicateNode(selectedNodeId);
            });
            return;
          }

          case "r":
          case "R": {
            e.preventDefault();
            const { selectedNodeId, nodes, commentBoxes } =
              useGraphStore.getState();
            if (!selectedNodeId) return;
            if (commentBoxes.some((c) => c.id === selectedNodeId)) return;
            const blk = nodes.find((n) => n.id === selectedNodeId);
            if (!blk) return;
            const name = window.prompt("Rename block", blk.name);
            if (name != null && name.trim().length > 0)
              void nativeGraphRenameNode(selectedNodeId, name.trim());
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
            const p = reactFlow.screenToFlowPosition({
              x: window.innerWidth / 2,
              y: window.innerHeight / 2,
            });
            void nativeGraphCommentAdd(p.x - 120, p.y - 80);
            return;
          }

          case "M": {
            e.preventDefault();
            useGraphStore.getState().toggleMinimap();
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
          const { selectedNodeId, nodes, commentBoxes } =
            useGraphStore.getState();
          if (!selectedNodeId) return;
          e.preventDefault();
          const isComment = commentBoxes.some((c) => c.id === selectedNodeId);
          if (isComment) void nativeGraphCommentDelete(selectedNodeId);
          else if (nodes.some((n) => n.id === selectedNodeId))
            void nativeGraphRemoveNode(selectedNodeId);
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
