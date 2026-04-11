import { invokeElementNative } from "./juceBackend";

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
  return r === true;
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
