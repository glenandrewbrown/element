import { invokeElementNative } from "./juceBackend";

export async function nativeSessionNew(): Promise<void> {
  await invokeElementNative("elementSessionNew", []);
}

export async function nativeSessionSave(): Promise<void> {
  await invokeElementNative("elementSessionSave", []);
}

export async function nativeSessionSaveAs(): Promise<void> {
  await invokeElementNative("elementSessionSaveAs", []);
}

/** Opens native file chooser for `.els`. */
export async function nativeSessionOpen(): Promise<boolean> {
  const r = await invokeElementNative("elementSessionOpen", []);
  return r === true;
}

/** Open session from absolute path (e.g. recent file). */
export async function nativeSessionOpenPath(path: string): Promise<boolean> {
  const r = await invokeElementNative("elementSessionOpenPath", [path]);
  return r === true;
}

export async function nativeSessionSetActiveGraph(
  graphIndex: number,
): Promise<boolean> {
  const r = await invokeElementNative("elementSessionSetActiveGraph", [
    graphIndex,
  ]);
  return r === true;
}

/** Native chooser → `SessionService::importGraph`. */
export async function nativeSessionImportGraph(): Promise<boolean> {
  const r = await invokeElementNative("elementSessionImportGraph", []);
  return r === true;
}

/** Native save chooser → export current graph as `.elg`. */
export async function nativeSessionExportGraph(): Promise<boolean> {
  const r = await invokeElementNative("elementSessionExportGraph", []);
  return r === true;
}

export type SessionFileEntry = {
  path: string;
  name: string;
  ext: string;
  modifiedMs: number;
};

/** Scan default session/graph dirs (same roots as classic Session browser). */
export async function nativeSessionListFiles(): Promise<SessionFileEntry[]> {
  const r = await invokeElementNative("elementSessionListFiles", []);
  if (typeof r !== "string") return [];
  try {
    const o = JSON.parse(r) as { entries?: SessionFileEntry[] };
    return Array.isArray(o.entries) ? o.entries : [];
  } catch {
    return [];
  }
}
