/**
 * pluginDrag — shared drag-and-drop contract for dragging a plugin row from the
 * left browser onto the Board (T19).
 *
 * Both the drag SOURCE (the V2 category-led plugin rows in
 * components/layout/palette) and the DROP TARGET (GraphCanvas) import from this
 * module so the MIME type and payload shape are defined exactly once. It mirrors
 * `lib/snippetDrag.ts` so the canvas can tell a plugin drag from a snippet drag
 * and route each to the right `native*` bridge with the cursor's flow-space
 * coords.
 *
 * Drop-target integration (GraphCanvas):
 *   onDragOver:
 *     if (isPluginDrag(e.dataTransfer)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
 *   onDrop:
 *     const payload = parsePluginDrop(e.dataTransfer);
 *     if (payload) {
 *       const flow = reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
 *       await nativeGraphAddPlugin(payload.identifier, flow.x, flow.y);
 *     }
 *
 * Click-to-add still works independently (the row's double-click / Enter calls
 * `nativeGraphAddPlugin(identifier)` with no coords), so drag is purely additive.
 */

/** MIME type used as the dataTransfer key for plugin-row drags. */
export const PLUGIN_DRAG_TYPE = "application/x-element-plugin";

/** Payload carried by a plugin drag — the real plugin identifier to insert. */
export interface PluginDragPayload {
  /** Real BrowserPlugin.identifier (PluginDescription.createIdentifierString). */
  identifier: string;
  /** Display name (for the drag affordance / future drag image only). */
  name: string;
}

/**
 * Serialize a plugin drag payload into the drag event's dataTransfer.
 * Call this inside `onDragStart`.
 */
export function setPluginDragData(
  dataTransfer: DataTransfer,
  payload: PluginDragPayload,
): void {
  dataTransfer.setData(PLUGIN_DRAG_TYPE, JSON.stringify(payload));
  dataTransfer.effectAllowed = "copy";
}

/**
 * Type-guard: returns true if the drag event carries a plugin payload.
 * Use this in `onDragOver` to set `dropEffect = "copy"` and enable the drop.
 * Safe with a null/absent dataTransfer (synthetic test events): returns false.
 */
export function isPluginDrag(
  dataTransfer: DataTransfer | null | undefined,
): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types ?? []).includes(PLUGIN_DRAG_TYPE);
}

/**
 * Parse a plugin drag payload from the drag event's dataTransfer.
 * Returns `null` if the dataTransfer does not carry a plugin (or is malformed).
 */
export function parsePluginDrop(
  dataTransfer: DataTransfer,
): PluginDragPayload | null {
  const raw = dataTransfer.getData(PLUGIN_DRAG_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "identifier" in parsed &&
      typeof (parsed as Record<string, unknown>).identifier === "string" &&
      (parsed as { identifier: string }).identifier.length > 0
    ) {
      const p = parsed as { identifier: string; name?: unknown };
      return {
        identifier: p.identifier,
        name: typeof p.name === "string" ? p.name : p.identifier,
      };
    }
    return null;
  } catch {
    return null;
  }
}
