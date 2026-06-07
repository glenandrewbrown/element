import { invokeElementNative } from "./juceBackend";
import { logBridgeError } from "./bridgeError";

export async function nativeSessionNew(): Promise<void> {
  await invokeElementNative("elementSessionNew", []);
}

export async function nativeSessionSave(): Promise<void> {
  await invokeElementNative("elementSessionSave", []);
}

export async function nativeSessionSaveAs(): Promise<void> {
  await invokeElementNative("elementSessionSaveAs", []);
}

/**
 * E6 — silent named-save. Saves to `<defaultSessionDir>/<name>.els` with NO OS
 * file chooser (the C++ FileBasedDocument save-as path is bypassed). Used for
 * the inline first-save prompt; subsequent saves go through `nativeSessionSave`.
 * @returns true on a successful write.
 */
export async function nativeSessionSaveNamed(name: string): Promise<boolean> {
  const r = await invokeElementNative("elementSessionSaveNamed", [name]);
  return r === true;
}

/** A recoverable autosave reported by the host (E1). */
export type RecoverableAutosave = {
  path: string;
  name: string;
  untitled: boolean;
  modifiedMs: number;
};

/**
 * E1 — ask the host for the newest recoverable autosave (newer than its backing
 * session, or any never-saved `autosave_*.els`). Returns null when none exists.
 */
export async function nativeSessionFindRecoverable(): Promise<RecoverableAutosave | null> {
  const r = await invokeElementNative("elementSessionFindRecoverable", []);
  if (typeof r !== "string") return null;
  try {
    const o = JSON.parse(r) as Partial<RecoverableAutosave>;
    if (typeof o.path !== "string" || o.path.length === 0) return null;
    return {
      path: o.path,
      name: typeof o.name === "string" ? o.name : o.path,
      untitled: o.untitled === true,
      modifiedMs: typeof o.modifiedMs === "number" ? o.modifiedMs : 0,
    };
  } catch (err) {
    logBridgeError("nativeSessionFindRecoverable.parse", err);
    return null;
  }
}

/**
 * E1 — recover an autosave file as a real `.els` session. An untitled recovery
 * loads as "Untitled — recovered" with no file set (the next save prompts for a
 * name). @returns true on success.
 */
export async function nativeSessionRecover(path: string): Promise<boolean> {
  const r = await invokeElementNative("elementSessionRecover", [path]);
  return r === true;
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
  /** True for an autosave file (`*.autosave.els` / `autosave_*.els`). */
  isAutosave?: boolean;
  /**
   * True only when this autosave is strictly newer than its backing session
   * (or is an untitled autosave with no backing). Non-autosave entries are
   * always false. Use this — not `isAutosave` — to populate the Recover group.
   */
  isRecoverable?: boolean;
};

/** Scan default session/graph dirs (same roots as classic Session browser). */
export async function nativeSessionListFiles(): Promise<SessionFileEntry[]> {
  const r = await invokeElementNative("elementSessionListFiles", []);
  if (typeof r !== "string") return [];
  try {
    const o = JSON.parse(r) as { entries?: SessionFileEntry[] };
    return Array.isArray(o.entries) ? o.entries : [];
  } catch (err) {
    logBridgeError("nativeSessionListFiles.parse", err);
    return [];
  }
}
