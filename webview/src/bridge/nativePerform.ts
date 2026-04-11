import { invokeElementNative } from "./juceBackend";

export async function nativePerformSetActiveScene(
  index: number,
): Promise<boolean> {
  const r = await invokeElementNative("elementPerformSetActiveScene", [index]);
  return r === true;
}

export async function nativePerformAddScene(name: string): Promise<boolean> {
  const r = await invokeElementNative("elementPerformAddScene", [name]);
  return r === true;
}

/** Store current graph parameter state on the active perform scene (host VT). */
export async function nativePerformCaptureScene(): Promise<boolean> {
  const r = await invokeElementNative("elementPerformCaptureScene", []);
  return r === true;
}
