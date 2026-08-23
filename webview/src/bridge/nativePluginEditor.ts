import { invokeElementNative } from "./juceBackend";

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
    if (r === true) return true;
  }
  return false;
}

export async function nativePluginEditorClose(): Promise<void> {
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
  await invokeElementNative("elementPluginEditorFloat", []);
}
