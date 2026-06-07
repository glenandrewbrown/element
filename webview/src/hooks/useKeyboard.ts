import { useEffect, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGraphStore } from "../stores/useGraphStore";
import { useAppStore } from "../stores/useAppStore";
import {
  nativeExitContainer,
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
import { nativePluginEditorClose } from "../bridge/nativePluginEditor";
import { groupSelectionWithFeedback } from "../components/canvas/groupSelection";
import { EV_START_RENAME } from "../events";

// ── Signal-chain order (G6/P5) ───────────────────────────────────────────────
//
// Tab traverses Blocks in SIGNAL-CHAIN order (gesture spec: "jump to next
// block in signal chain") — i.e. graph-TOPOLOGICAL order following the
// Cables source→downstream, NOT DOM/array order. The previous implementation
// sorted globally by in-degree then x-position, which broke chains: in
// a→b→c, b and c both have in-degree 1, so a c positioned left of b was
// visited before it despite being DOWNSTREAM of it.
//
// Kahn's algorithm with a stable tiebreak (x, then y, then id) when several
// nodes are simultaneously ready. Nodes left over by a cycle are appended in
// the same positional order so every Block remains reachable.

export function signalChainOrder(
  nodes: Array<{ id: string; position: { x: number; y: number } }>,
  edges: Array<{ source: string; target: string }>,
): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const posCmp = (aId: string, bId: string): number => {
    const a = byId.get(aId)!;
    const b = byId.get(bId)!;
    return (
      a.position.x - b.position.x ||
      a.position.y - b.position.y ||
      a.id.localeCompare(b.id)
    );
  };

  const inCount = new Map<string, number>();
  const out = new Map<string, string[]>();
  nodes.forEach((n) => inCount.set(n.id, 0));
  for (const e of edges) {
    // Ignore dangling edges (e.g. mid-snapshot) — only count both-ends-known.
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    inCount.set(e.target, (inCount.get(e.target) ?? 0) + 1);
    const list = out.get(e.source) ?? [];
    list.push(e.target);
    out.set(e.source, list);
  }

  const ready = nodes
    .filter((n) => (inCount.get(n.id) ?? 0) === 0)
    .map((n) => n.id)
    .sort(posCmp);
  const order: string[] = [];
  const visited = new Set<string>();

  while (ready.length > 0) {
    const id = ready.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    order.push(id);
    for (const t of out.get(id) ?? []) {
      const c = (inCount.get(t) ?? 0) - 1;
      inCount.set(t, c);
      if (c === 0) {
        // Insert keeping the ready queue positionally sorted (stable tiebreak).
        let i = 0;
        while (i < ready.length && posCmp(ready[i]!, t) <= 0) i++;
        ready.splice(i, 0, t);
      }
    }
  }

  // Cycle leftovers (feedback loops): append in positional order.
  const leftovers = nodes
    .filter((n) => !visited.has(n.id))
    .map((n) => n.id)
    .sort(posCmp);
  return [...order, ...leftovers];
}

interface UseKeyboardOptions {
  onToggleCommandPalette: () => void;
  /**
   * Whether the CommandPalette is currently open. When true, Escape closes it
   * at priority 1 — before deselect / popBreadcrumb.
   * Wired by App.tsx; optional so existing call sites keep compiling.
   */
  paletteOpen?: boolean;
  /**
   * Closes the CommandPalette without toggling. Companion to paletteOpen.
   * Wired by App.tsx; optional so existing call sites keep compiling.
   */
  onClosePalette?: () => void;
}

export function useKeyboard({
  onToggleCommandPalette,
  paletteOpen = false,
  onClosePalette,
}: UseKeyboardOptions) {
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
        // ── Cmd+Shift+D — group selection into a Container (T10, Glen QA
        // 2026-06-06). Engine-driven: the snapshot push replaces the selected
        // blocks with the new Container; refusals surface in the status bar.
        if (lower === "d") {
          const selected = reactFlow
            .getNodes()
            .filter((n) => n.selected && n.type === "block")
            .map((n) => n.id);
          if (selected.length === 0) return; // nothing block-selected — no-op
          e.preventDefault();
          // Always call groupSelectionWithFeedback so refusals (e.g. "need-2"
          // when only 1 block is selected) surface visibly in the StatusBar.
          // Previously a silent `return` on < 2 swallowed the feedback path.
          groupSelectionWithFeedback(selected);
          return;
        }
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
            // Read the selected node from RF's own node list rather than
            // useGraphStore.selectedNodeId. hydrateFromEngine resets
            // selectedNodeId to null after every engine snapshot push (including
            // the one triggered by the first duplicate), which made subsequent
            // ⌘D presses silently no-op. RF's getNodes() preserves `.selected`
            // across snapshot hydrations because it is driven by useNodesState,
            // not the store's single-id tracker.
            const rfSelectedBlock = reactFlow
              .getNodes()
              .find((n) => n.selected && n.type === "block");
            if (!rfSelectedBlock) return;
            const targetId = rfSelectedBlock.id;
            const { commentBoxes } = useGraphStore.getState();
            if (commentBoxes.some((c) => c.id === targetId)) return;
            void nativeGraphDuplicateNodes([targetId]).then((n) => {
              if (n === 0) void nativeGraphDuplicateNode(targetId);
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
        case "d":
        case "D": {
          // Flow-Debug overlay toggle (logic-routing plan W3): live per-cable
          // readout chips. Distinct from Cmd+D (duplicate) handled above.
          e.preventDefault();
          useAppStore.getState().toggleFlowDebug();
          return;
        }

        case "Escape": {
          // Priority 1: CommandPalette open → close it.
          if (paletteOpen) {
            e.preventDefault();
            onClosePalette?.();
            return;
          }

          // Priority 2 (P1-A): embedded plugin editor open → close it. Sits
          // above the deselect/pop-breadcrumb branch so a single Esc dismisses
          // the native editor first (it would otherwise be a dead-end that only
          // closes via the Inspector). Owner uuid mirrors the host's
          // pluginEmbedNodeUuid; close is idempotent.
          //
          // KNOWN LIMITATION (BUG 2, by design): this fires ONLY when the
          // webview itself has keyboard focus. While the native embedded plugin
          // editor (a CALayerHost-backed NSView) holds first-responder, macOS
          // routes the Esc keyDown to the PLUGIN, not to this window-level
          // listener — so Esc cannot close a *focused* embed from here. The same
          // native-focus boundary defeats a JUCE-side KeyListener on the embed's
          // host component (JUCE's key pipeline sits upstream of the focused
          // NSView). The only ways to intercept that key — an NSEvent local
          // key-down monitor or swizzling the plugin's keyDown: — would steal Esc
          // from the plugin's own UI (cancel dialogs, preset-name edits), so they
          // are deliberately NOT shipped. Closing a focused embed is therefore
          // done via the ✕ pill / double-click toggle / delete / Float, all of
          // which are OS-routable regardless of plugin focus. (Esc still works
          // here when focus is on the canvas/webview.)
          if (useAppStore.getState().embeddedEditorNodeId) {
            e.preventDefault();
            void nativePluginEditorClose();
            return;
          }

          // Priority 3: deselect, then (if nothing selected) back out one dive
          // level. The dive exit is ENGINE-driven (the dive-desync fix) — we
          // ask the host to exit and let the snapshot redraw the breadcrumb +
          // canvas, never an optimistic client pop that could disagree with the
          // canvas. "Is dived" = currentBoardId set OR the breadcrumb path is
          // deeper than [session, activeGraph] (length > 2).
          const { selectedNodeId, selectedEdgeId, currentBoardId, breadcrumbStack } =
            useGraphStore.getState();
          if (selectedNodeId || selectedEdgeId) {
            useGraphStore.getState().clearSelection();
          } else if (currentBoardId != null || breadcrumbStack.length > 2) {
            e.preventDefault();
            void nativeExitContainer();
          }
          return;
        }

        case "Tab": {
          e.preventDefault();
          const { nodes, edges, selectedNodeId } = useGraphStore.getState();
          if (nodes.length === 0) return;

          // G6/P5 — Tab follows the SIGNAL CHAIN (topological order along the
          // Cables, source→downstream), not DOM/array order. See
          // signalChainOrder() above for the algorithm + tiebreak rules.
          const sorted = signalChainOrder(nodes, edges);

          // Find current position in sorted list
          const currentIdx = sorted.findIndex((id) => id === selectedNodeId);
          const nextIdx = shift ? (currentIdx - 1 + sorted.length) % sorted.length : (currentIdx + 1) % sorted.length;
          useGraphStore.getState().selectNode(sorted[nextIdx]!);
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
    [onToggleCommandPalette, paletteOpen, onClosePalette, reactFlow],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
