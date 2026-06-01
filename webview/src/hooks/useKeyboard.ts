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
  nativeGraphSetCableBus,
  nativeRedo,
  nativeUndo,
} from "../bridge/nativeGraph";
import {
  deriveBuses,
  suggestBusName,
  useBusStore,
} from "../stores/useBusStore";
import {
  nativeSessionSave,
  nativeSessionSaveAs,
} from "../bridge/nativeSession";
import { EV_START_RENAME } from "../events";

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
      // Digit number from physical key code (1 for Digit1 … 9 for Digit9,
      // 0 for Digit0). Independent of shift state, so Shift+0 → ")" still
      // resolves to the digit "0". Returns "" when not a digit row key.
      const codeDigit = e.code.startsWith("Digit")
        ? e.code.slice(5)
        : "";

      // ── Ctrl+0-9 — save spatial bookmark ──
      // Checked BEFORE the meta switch so Ctrl+0 doesn't fall through to
      // the `case "0"` fitView branch (meta = metaKey || ctrlKey, so Ctrl
      // alone would otherwise be swallowed).
      if (
        e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        !e.altKey &&
        codeDigit !== ""
      ) {
        e.preventDefault();
        const vp = reactFlow.getViewport();
        useAppStore
          .getState()
          .saveSpatialBookmark(codeDigit, {
            x: vp.x,
            y: vp.y,
            zoom: vp.zoom,
          });
        return;
      }

      // ── Cmd+Shift+L/R/T/B/H/V — multi-select alignment & distribute (P1-13) ──
      // Handled BEFORE the main `switch(key)` so we get first refusal on
      // Cmd+Shift+R (which would otherwise hit the plain "r" rename case)
      // and Cmd+Shift+V (which would otherwise hit the plain "v" paste case).
      if (meta && shift) {
        const lower = key.toLowerCase();
        if (
          lower === "l" ||
          lower === "r" ||
          lower === "t" ||
          lower === "b" ||
          lower === "h" ||
          lower === "v"
        ) {
          const selected = reactFlow
            .getNodes()
            .filter((n) => n.selected && n.type === "block")
            .map((n) => n.id);
          if (selected.length < 2) {
            // Consume the chord so the browser default (Safari history etc.)
            // doesn't fire, but otherwise no-op.
            if (selected.length > 0) e.preventDefault();
            return;
          }
          e.preventDefault();
          const store = useGraphStore.getState();
          if (lower === "l") store.alignSelectedNodes("left", selected);
          else if (lower === "r") store.alignSelectedNodes("right", selected);
          else if (lower === "t") store.alignSelectedNodes("top", selected);
          else if (lower === "b") store.alignSelectedNodes("bottom", selected);
          else if (lower === "h")
            store.distributeSelectedNodes("horizontal", selected);
          else if (lower === "v")
            store.distributeSelectedNodes("vertical", selected);
          return;
        }
      }

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
            if (!nodes.some((n) => n.id === selectedNodeId)) return;
            window.dispatchEvent(
              new CustomEvent(EV_START_RENAME, {
                detail: { nodeId: selectedNodeId },
              }),
            );
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

          // SHELVED (D3, hide-UI keep-code) — see FINISH-APP-PLAN. The
          // Cmd/Ctrl+Shift+M "toggle Edit/Perform mode" shortcut is removed:
          // Perform mode is shelved and the app is locked to Edit. Restore by
          // re-adding a `case "m"/"M"` that calls useAppStore...toggleMode().
        }
      }

      // ── Shift combos (no meta) ──

      if (shift && !meta) {
        // Shift+0-9: recall spatial bookmark. Use `codeDigit` because
        // `e.key` is the shifted character (")", "!" …) on US layouts,
        // which would never match the "0"–"9" range.
        if (codeDigit !== "") {
          e.preventDefault();
          const bm = useAppStore.getState().getSpatialBookmark(codeDigit);
          if (bm) {
            reactFlow.setViewport({ x: bm.x, y: bm.y, zoom: bm.zoom }, { duration: 150 });
          }
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

          case "K": {
            e.preventDefault();
            useAppStore.getState().toggleVirtualKeyboard();
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
          const { nodes, edges, selectedNodeId } = useGraphStore.getState();
          if (nodes.length === 0) return;

          // Build signal-chain order: nodes with fewer incoming edges first (sources),
          // then by x-position left-to-right as tiebreaker
          const inCount = new Map<string, number>();
          nodes.forEach((n) => inCount.set(n.id, 0));
          edges.forEach((e) => inCount.set(e.target, (inCount.get(e.target) ?? 0) + 1));

          const sorted = [...nodes].sort((a, b) => {
            const diff = (inCount.get(a.id) ?? 0) - (inCount.get(b.id) ?? 0);
            return diff !== 0 ? diff : a.position.x - b.position.x;
          });

          // Find current position in sorted list
          const currentIdx = sorted.findIndex((n) => n.id === selectedNodeId);
          const nextIdx = shift ? (currentIdx - 1 + sorted.length) % sorted.length : (currentIdx + 1) % sorted.length;
          useGraphStore.getState().selectNode(sorted[nextIdx].id);
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

        // Phase 5B — toggle wireless on the currently selected cable.
        // First W on a wired cable assigns the next default bus name
        // ("Bus 1", "Bus 2", …). W on a wireless cable converts back.
        case "w":
        case "W": {
          const { selectedEdgeId, edges } = useGraphStore.getState();
          if (!selectedEdgeId) return;
          if (!edges.some((edge) => edge.id === selectedEdgeId)) return;
          e.preventDefault();
          const busState = useBusStore.getState();
          const current = busState.cableBus[selectedEdgeId];
          if (current) {
            busState.setBusForCable(selectedEdgeId, undefined);
            void nativeGraphSetCableBus(selectedEdgeId, "");
          } else {
            const buses = deriveBuses(edges, busState.cableBus);
            const next = suggestBusName(buses.map((b) => b.name));
            busState.setBusForCable(selectedEdgeId, next);
            void nativeGraphSetCableBus(selectedEdgeId, next);
          }
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
