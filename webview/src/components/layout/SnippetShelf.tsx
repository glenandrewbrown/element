import { useCallback, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { useGraphStore } from "../../stores/useGraphStore";
import { useAppStore } from "../../stores/useAppStore";
import {
  nativeMoleculeInsert,
  nativeMoleculeSave,
} from "../../bridge/nativeGraph";
import { nativeTransportPanic } from "../../bridge/nativeGraph";
import { NeuButton, Icon } from "../neu";
import { NeuPromptModal } from "./NeuPromptModal";
import { setSnippetDragData, snippetInsertDefault } from "../../lib/snippetDrag";

/** Duration (ms) the StatusBar hint stays visible after a save attempt. */
const HINT_CLEAR_MS = 3000;

/**
 * Edit-mode bottom shelf of saved Snippets (reusable Block + Cable groups,
 * a.k.a. molecules) shown as click-to-insert thumbnails. Use it to drop a
 * pre-wired chain (sidechain comp, reverb send, etc.) onto the Board in one
 * click instead of rebuilding it. Also hosts the always-visible red PANIC
 * button that sends Note Off to all MIDI outputs.
 *
 * Click-to-insert lands at the current viewport centre (computed from the
 * React Flow DOM transform — no ReactFlowProvider needed here).
 * Each thumbnail is also a drag source (HTML5 DnD, SNIPPET_DRAG_TYPE) so it
 * can be dragged onto the canvas and dropped at the cursor position.
 */
export function SnippetShelf() {
  const molecules = useHostExtrasStore((s) => s.molecules);
  const setCanvasHint = useAppStore((s) => s.setCanvasHint);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const selectedNodeIds = useGraphStore(
    useShallow((s) => s.nodes.filter((n) => n.selected).map((n) => n.id)),
  );

  // ── Click-to-insert: viewport centre via DOM (no ReactFlowProvider needed) ──

  const handleInsert = useCallback((name: string) => {
    const { x, y } = snippetInsertDefault();
    void nativeMoleculeInsert(name, x, y);
  }, []);

  // ── Drag source ────────────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, name: string) => {
      setSnippetDragData(event.dataTransfer, { name });
    },
    [],
  );

  // ── Save-as-Snippet ────────────────────────────────────────────────────────
  // Naming runs through the in-app NeuPromptModal — `window.prompt()` returns
  // null in JUCE's WKWebView (no runJavaScriptTextInputPanel UIDelegate), which
  // silently no-op'd every save (#4c root cause A). On confirm we call the real
  // `elementMoleculeSave` bridge; the host re-pushes the snapshot so the
  // SNIPPETS count + thumbnails update from engine truth (NOTHING-fake).

  // The selection snapshotted at the moment the modal opens — the selection
  // could change underneath an open modal otherwise, and a drop should save
  // exactly what was selected at drop time.
  const [promptOpen, setPromptOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const showHint = useCallback(
    (msg: string) => {
      if (hintTimerRef.current !== undefined)
        clearTimeout(hintTimerRef.current);
      setCanvasHint(msg);
      hintTimerRef.current = setTimeout(
        () => setCanvasHint(null),
        HINT_CLEAR_MS,
      );
    },
    [setCanvasHint],
  );

  // Open the name modal for the given ids (button OR drop). Empty selection →
  // honest hint, no modal.
  const openSavePrompt = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) {
        showHint("Select one or more Blocks first, then save as Snippet.");
        return;
      }
      setPendingIds(ids);
      setPromptOpen(true);
    },
    [showHint],
  );

  const handleSaveAsSnippet = useCallback(() => {
    openSavePrompt(selectedNodeIds);
  }, [openSavePrompt, selectedNodeIds]);

  const handlePromptConfirm = useCallback(
    (name: string) => {
      setPromptOpen(false);
      const ids = pendingIds;
      if (ids.length === 0) return;
      void nativeMoleculeSave(name, ids).then((ok) => {
        showHint(
          ok ? `Snippet "${name}" saved.` : `Failed to save Snippet "${name}".`,
        );
      });
    },
    [pendingIds, showHint],
  );

  // ── Drop target: drag selected Blocks onto the shelf → save a Snippet ───────
  // React Flow node drags are pointer-based (no dataTransfer), so the drop saves
  // the CURRENT selection — drag the selected blocks down onto the shelf and
  // name them. We accept any drag-over (preventDefault enables the drop) and
  // resolve the selection at drop time.
  const handleShelfDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }, []);

  const handleShelfDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      // Ignore leave events bubbling from children — only clear when the pointer
      // actually exits the shelf bounds.
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDragOver(false);
    },
    [],
  );

  const handleShelfDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      openSavePrompt(selectedNodeIds);
    },
    [openSavePrompt, selectedNodeIds],
  );

  return (
    <div
      className={[
        "h-full flex items-center gap-4 px-6 overflow-x-auto select-none transition-colors",
        dragOver ? "bg-accent-blue/10" : "",
      ].join(" ")}
      onDragOver={handleShelfDragOver}
      onDragLeave={handleShelfDragLeave}
      onDrop={handleShelfDrop}
    >
      {/* Label */}
      <div className="shrink-0 flex items-center gap-2 mr-4">
        <Icon name="Puzzle" size={14} className="text-accent-orange" aria-hidden />
        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
          Snippets
        </span>
        <span className="text-[10px] text-text-dim tabular-nums">
          {molecules.length}
        </span>
      </div>

      {/* Save-as-Snippet button */}
      <button
        type="button"
        aria-label="Save as Snippet"
        onClick={handleSaveAsSnippet}
        title={
          selectedNodeIds.length > 0
            ? `Save ${selectedNodeIds.length} selected block${selectedNodeIds.length === 1 ? "" : "s"} as Snippet`
            : "Select blocks on the Board, then save as Snippet"
        }
        className={[
          "shrink-0 flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium",
          "border border-white/10 transition-colors",
          selectedNodeIds.length > 0
            ? "text-accent-blue hover:bg-elevated cursor-pointer"
            : "text-text-dim opacity-50 cursor-default",
        ].join(" ")}
      >
        <Icon name="BookmarkPlus" size={11} aria-hidden />
        Save as Snippet
      </button>

      {/* Molecule thumbnails */}
      <div className="flex items-center gap-3">
        {molecules.length === 0 && (
          <span className="text-[10px] text-text-dim italic">
            No snippets saved — select blocks and save as Snippet
          </span>
        )}
        {molecules.map((mol) => (
          <button
            key={mol.name}
            type="button"
            draggable
            onDragStart={(e) => handleDragStart(e, mol.name)}
            onClick={() => handleInsert(mol.name)}
            title={mol.description || mol.name}
            className="w-32 h-10 bg-pressed rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] border border-white/5 flex items-center justify-center gap-2 group cursor-grab active:cursor-grabbing hover:bg-surface hover:border-white/10 transition-colors"
          >
            <Icon name="Puzzle" size={10} className="text-accent-orange/60 group-hover:text-accent-orange" aria-hidden />
            <span className="text-[10px] text-text-secondary group-hover:text-text-primary font-medium truncate max-w-[90px]">
              {mol.name}
            </span>
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Panic button */}
      <NeuButton variant="panic" size="sm" onClick={() => void nativeTransportPanic()}>
        PANIC
      </NeuButton>

      {/* Snippet-name prompt (in-app modal — window.prompt() is null in WKWebView). */}
      <NeuPromptModal
        open={promptOpen}
        title="Save as Snippet"
        description={`Name this Snippet (${pendingIds.length} block${pendingIds.length === 1 ? "" : "s"}).`}
        placeholder="My Snippet"
        defaultValue="My Snippet"
        confirmLabel="Save"
        onConfirm={handlePromptConfirm}
        onCancel={() => setPromptOpen(false)}
      />
    </div>
  );
}
