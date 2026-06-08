import { invokeElementNative } from "./juceBackend";
import { useAppStore } from "../stores/useAppStore";

/**
 * Open the embedded plugin editor for a node — SINGLE-SHOT (Wave-3 Phase 4
 * Task 4.2; the interim retry-poll backoff `PLUGIN_EDITOR_OPEN_DELAYS_MS` is
 * removed).
 *
 * The backoff existed only to paper over a synchronous-add race: a freshly
 * added plugin's `AudioProcessor` was absent for a few frames after its node
 * appeared, so `elementPluginEditorOpen` returned `false` transiently. Phase 4
 * replaces that race with an explicit `loadState`: a node is `loading` (no real
 * processor, no editor, Block pinned + non-interactive) until the async load
 * completes and the snapshot flips it to `ready`. By the time the user can
 * open an editor, the real processor exists — so one call suffices.
 *
 * On success the host also pushes `onEmbeddedEditorReady(nodeId)` (consumed in
 * useJuceBridge) as the authoritative "editor is mounted" signal; we still set
 * the mirror optimistically here so the toggle/✕/Esc state is correct without
 * waiting a round-trip. A `false` return (e.g. the node is still loading, which
 * has no editor) simply does not open — the caller surfaces no drag handle.
 */
export async function nativePluginEditorOpen(
  nodeId: string,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<boolean> {
  const r = await invokeElementNative("elementPluginEditorOpen", [
    nodeId,
    x,
    y,
    w,
    h,
  ]);
  if (r === true) {
    // Mirror the host's `pluginEmbedNodeUuid` so the webview knows which Block
    // currently owns the embedded editor (drives the double-click toggle,
    // Esc-to-close, and the ✕ affordance). The host's onEmbeddedEditorReady
    // push reaffirms this. (P1-A)
    useAppStore.getState().setEmbeddedEditorNodeId(nodeId);
    return true;
  }
  return false;
}

export async function nativePluginEditorClose(): Promise<void> {
  // Clear the webview mirror first so the UI reflects "no embed" immediately,
  // independent of the async host round-trip. Idempotent — calling close when
  // nothing is open is a harmless no-op on both sides. (P1-A)
  useAppStore.getState().setEmbeddedEditorNodeId(null);
  await invokeElementNative("elementPluginEditorClose", []);
}

export async function nativePluginEditorSetBounds(
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<void> {
  await invokeElementNative("elementPluginEditorSetBounds", [x, y, w, h]);
}

export async function nativePluginEditorFloat(): Promise<void> {
  // Floating tears down the embed on the host (pluginEditorClose runs inside
  // the float handler), so the webview mirror must clear too. (P1-A)
  useAppStore.getState().setEmbeddedEditorNodeId(null);
  await invokeElementNative("elementPluginEditorFloat", []);
}
