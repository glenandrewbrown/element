/**
 * snippetDrag — shared drag-and-drop contract for snippet shelf items.
 *
 * Both the drag SOURCE (SnippetShelf, MoleculesSection) and the DROP TARGET
 * (GraphCanvas) import from this module so the MIME type and payload shape
 * are defined exactly once.
 *
 * Drop-target integration (D-worker):
 *   In GraphCanvas onDragOver:
 *     if (isSnippetDrag(e.dataTransfer)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
 *   In GraphCanvas onDrop:
 *     const payload = parseSnippetDrop(e.dataTransfer);
 *     if (payload) {
 *       const flow = reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
 *       await nativeMoleculeInsert(payload.name, flow.x, flow.y);
 *       // apply "block-spawn" CSS class to newly-added nodes for G6 spring
 *     }
 *
 * Insert-position policy (canonical default — no ReactFlow provider needed):
 *   When no cursor or drop point is available (click-to-insert from the shelf
 *   or palette), call `snippetInsertDefault()` to get flow-space coords.
 *   This reads the React Flow viewport transform from the DOM so it works
 *   outside ReactFlowProvider.
 */

/** MIME type used as the dataTransfer key for snippet drags. */
export const SNIPPET_DRAG_TYPE = "application/x-element-snippet";

/** Payload carried by a snippet drag. */
export interface SnippetDragPayload {
  name: string;
}

/**
 * Canonical default insert position when there is no cursor or drop point.
 * Reads the React Flow viewport transform directly from the DOM — works
 * outside ReactFlowProvider (safe for shelf / palette components).
 * Falls back to (200, 200) if the DOM element is not present (tests / SSR).
 */
export function snippetInsertDefault(): { x: number; y: number } {
  // Attempt to read the viewport transform from the RF viewport element.
  const vpEl = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (vpEl) {
    const style = vpEl.style.transform; // "translate(Xpx, Ypx) scale(Z)"
    const m = style.match(
      /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\((-?[\d.]+)\)/,
    );
    if (m) {
      const tx = parseFloat(m[1]);
      const ty = parseFloat(m[2]);
      const zoom = parseFloat(m[3]);
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      return {
        x: (cx - tx) / zoom,
        y: (cy - ty) / zoom,
      };
    }
  }
  // Fallback: rough board-centre for a fresh project
  return { x: 200, y: 200 };
}

/**
 * Serialize a snippet drag payload into the drag event's dataTransfer.
 * Call this inside `onDragStart`.
 */
export function setSnippetDragData(
  dataTransfer: DataTransfer,
  payload: SnippetDragPayload,
): void {
  dataTransfer.setData(SNIPPET_DRAG_TYPE, JSON.stringify(payload));
  dataTransfer.effectAllowed = "copy";
}

/**
 * Type-guard: returns true if the drag event carries a snippet payload.
 * Use this in `onDragOver` to set `event.dataTransfer.dropEffect = "copy"`
 * and enable the drop target.
 * Safe with a null/absent dataTransfer (synthetic test events): returns false.
 */
export function isSnippetDrag(
  dataTransfer: DataTransfer | null | undefined,
): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types ?? []).includes(SNIPPET_DRAG_TYPE);
}

/**
 * Parse a snippet drag payload from the drag event's dataTransfer.
 * Returns `null` if the dataTransfer does not carry a snippet.
 */
export function parseSnippetDrop(
  dataTransfer: DataTransfer,
): SnippetDragPayload | null {
  const raw = dataTransfer.getData(SNIPPET_DRAG_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "name" in parsed &&
      typeof (parsed as Record<string, unknown>).name === "string"
    ) {
      return { name: (parsed as { name: string }).name };
    }
    return null;
  } catch {
    return null;
  }
}
