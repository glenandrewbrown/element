import { invokeElementNative } from "./juceBackend";
import { useAppStore } from "../stores/useAppStore";

/**
 * Retry-poll backoff for the plugin-editor open path. The C++ handler
 * returns `false` when `pluginEmbedEditor != nullptr` is false — which
 * happens when a freshly added plugin's `AudioProcessor` is not yet
 * instantiated even though its node already exists in the graph
 * snapshot. Bounded retries close the T-P6-3 race without requiring a
 * new C++ push channel. Total worst-case wait ≈ 2.9 s; returns
 * immediately on first success.
 */
const PLUGIN_EDITOR_OPEN_DELAYS_MS = [0, 150, 400, 800, 1500] as const;

export async function nativePluginEditorOpen(
  nodeId: string,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<boolean> {
  for (const delay of PLUGIN_EDITOR_OPEN_DELAYS_MS) {
    if (delay > 0) {
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, delay),
      );
    }
    const r = await invokeElementNative("elementPluginEditorOpen", [
      nodeId,
      x,
      y,
      w,
      h,
    ]);
    if (r === true) {
      // Mirror the host's `pluginEmbedNodeUuid` so the webview knows which
      // Block currently owns the embedded editor (drives the double-click
      // toggle, Esc-to-close, and the ✕ affordance). (P1-A)
      useAppStore.getState().setEmbeddedEditorNodeId(nodeId);
      return true;
    }
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
