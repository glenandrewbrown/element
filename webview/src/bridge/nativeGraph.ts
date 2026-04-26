import { invokeElementNative } from "./juceBackend";

export async function nativeGraphAddPlugin(
  identifier: string,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphAddPlugin", [identifier]);
  return r === true;
}

export async function nativeGraphRemoveNode(nodeId: string): Promise<boolean> {
  const r = await invokeElementNative("elementGraphRemoveNode", [nodeId]);
  return r === true;
}

export async function nativeGraphConnect(
  sourceId: string,
  sourceHandle: string,
  targetId: string,
  targetHandle: string,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphConnect", [
    sourceId,
    sourceHandle,
    targetId,
    targetHandle,
  ]);
  return r === true;
}

export async function nativeGraphDisconnect(
  sourceId: string,
  sourceHandle: string,
  targetId: string,
  targetHandle: string,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphDisconnect", [
    sourceId,
    sourceHandle,
    targetId,
    targetHandle,
  ]);
  return r === true;
}

export async function nativeGraphMoveNodes(
  moves: Array<{ id: string; x: number; y: number }>,
): Promise<number> {
  const r = await invokeElementNative("elementGraphMoveNodes", [moves]);
  return typeof r === "number" ? r : 0;
}

export async function nativeGraphSetBypass(
  nodeId: string,
  bypassed: boolean,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphSetBypass", [
    nodeId,
    bypassed,
  ]);
  return r === true;
}

export async function nativeGraphSetMute(
  nodeId: string,
  muted: boolean,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphSetMute", [nodeId, muted]);
  return r === true;
}

export async function nativeGraphSetMuteInput(
  nodeId: string,
  muteInput: boolean,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphSetMuteInput", [
    nodeId,
    muteInput,
  ]);
  return r === true;
}

export async function nativeGraphSetCanvasOptions(
  snapToGrid: boolean,
  gridSize: number,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphSetCanvasOptions", [
    snapToGrid,
    gridSize,
  ]);
  return r === true;
}

/**
 * Phase 5B — wireless patching.
 *
 * Tag a cable (Arc) with a named transmitter/receiver bus. Pass `""` to
 * clear and revert to a normal drawn cable. The engine still routes the
 * underlying connection identically; the bus name is metadata only.
 *
 * Returns true if the host found and updated the matching Arc; false if
 * the cable id no longer exists. Either way the front-end useBusStore
 * remains the visual source of truth, so a `false` here does not block
 * wireless rendering.
 */
export async function nativeGraphSetCableBus(
  cableId: string,
  busName: string,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphSetCableBus", [
    cableId,
    busName,
  ]);
  return r === true;
}

export async function nativeGraphSetViewport(
  x: number,
  y: number,
  zoom: number,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphSetViewport", [x, y, zoom]);
  return r === true;
}

export async function nativeMoleculeInsert(
  name: string,
  x = 120,
  y = 120,
): Promise<number> {
  const r = await invokeElementNative("elementMoleculeInsert", [name, x, y]);
  return typeof r === "number" ? r : 0;
}

export async function nativeGraphDuplicateNode(
  nodeId: string,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphDuplicateNode", [nodeId]);
  return r === true;
}

export async function nativeGraphDuplicateNodes(
  nodeIds: string[],
): Promise<number> {
  const r = await invokeElementNative("elementGraphDuplicateNodes", [nodeIds]);
  return typeof r === "number" ? r : 0;
}

/** Store node UUIDs on the host pasteboard (for Cmd+V duplicate chain). */
export async function nativeGraphCopyNodes(nodeIds: string[]): Promise<number> {
  const r = await invokeElementNative("elementGraphCopyNodes", [nodeIds]);
  return typeof r === "number" ? r : 0;
}

/** Duplicate each node whose UUID was last copied (`DuplicateNodeMessage` / undo stack). */
export async function nativeGraphPasteNodes(): Promise<number> {
  const r = await invokeElementNative("elementGraphPasteNodes", []);
  return typeof r === "number" ? r : 0;
}

export async function nativeGraphRenameNode(
  nodeId: string,
  name: string,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphRenameNode", [nodeId, name]);
  return r === true;
}

export async function nativeGraphCommentAdd(
  x: number,
  y: number,
  width = 240,
  height = 160,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphCommentAdd", [
    x,
    y,
    width,
    height,
  ]);
  return r === true;
}

export async function nativeGraphCommentUpsert(payload: {
  id: string;
  title?: string;
  color?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}): Promise<boolean> {
  const r = await invokeElementNative("elementGraphCommentUpsert", [
    JSON.stringify(payload),
  ]);
  return r === true;
}

export async function nativeGraphCommentDelete(id: string): Promise<boolean> {
  const r = await invokeElementNative("elementGraphCommentDelete", [id]);
  return r === true;
}

export async function nativeUndo(): Promise<void> {
  await invokeElementNative("elementUndo", []);
}

export async function nativeRedo(): Promise<void> {
  await invokeElementNative("elementRedo", []);
}

export async function nativeTransportPanic(): Promise<void> {
  await invokeElementNative("elementTransportPanic", []);
}

export async function nativeTransportTogglePlay(): Promise<void> {
  await invokeElementNative("elementTransportTogglePlay", []);
}

/** Stop transport playback. No-op if already stopped. Returns true. */
export async function nativeTransportStop(): Promise<boolean> {
  const r = await invokeElementNative("elementTransportStop", []);
  return r === true;
}

/** Seek transport playhead to frame 0. Returns true. */
export async function nativeTransportRewind(): Promise<boolean> {
  const r = await invokeElementNative("elementTransportRewind", []);
  return r === true;
}

/** US-002: Toggle recording state. C++ AudioEngine::setRecording(bool) confirmed. */
export async function nativeTransportSetRecording(
  recording: boolean,
): Promise<boolean> {
  const r = await invokeElementNative("elementTransportSetRecording", [
    recording,
  ]);
  return r === true;
}

/**
 * US-003: Set session tempo (BPM). Writes to session ValueTree tags::tempo;
 * AudioEngine listens and calls transport.requestTempo() automatically.
 * Current tempo is already available in every graph snapshot at `session.tempo`.
 */
export async function nativeTransportSetTempo(bpm: number): Promise<boolean> {
  const r = await invokeElementNative("elementTransportSetTempo", [bpm]);
  return r === true;
}

/** Row from `elementGetNodeParameters` (`value` is host-normalized 0–1). */
export type NodeParameterRow = {
  index: number;
  name: string;
  value: number;
  defaultValue: number;
  label?: string;
  min?: number;
  max?: number;
  stepped?: boolean;
  boolean?: boolean;
};

export async function nativeGetNodeParameters(
  nodeId: string,
): Promise<{ parameters: NodeParameterRow[] }> {
  const r = await invokeElementNative("elementGetNodeParameters", [nodeId]);
  if (typeof r !== "string") return { parameters: [] };
  try {
    const o = JSON.parse(r) as { parameters?: NodeParameterRow[] };
    return { parameters: Array.isArray(o.parameters) ? o.parameters : [] };
  } catch {
    return { parameters: [] };
  }
}

export async function nativeSetNodeParameter(
  nodeId: string,
  paramIndex: number,
  value: number,
): Promise<boolean> {
  const r = await invokeElementNative("elementSetNodeParameter", [
    nodeId,
    paramIndex,
    value,
  ]);
  return r === true;
}

/** One entry in the session graph tree returned by nativeSessionGetGraphTree. */
export type SessionGraphTreeNode = {
  id: string;
  name: string;
  index: number;
  active: boolean;
  isContainer: boolean;
  children: SessionGraphTreeNode[];
};

/**
 * Return a flat-with-children array of all graphs in the current session.
 * Top-level entries are session graphs; each may have nested container boards.
 */
export async function nativeSessionGetGraphTree(): Promise<
  SessionGraphTreeNode[]
> {
  const r = await invokeElementNative("elementSessionGetGraphTree", []);
  if (typeof r !== "string") return [];
  try {
    return JSON.parse(r) as SessionGraphTreeNode[];
  } catch {
    return [];
  }
}

/** One cable entry returned by nativeGraphGetConnectionList. */
export type ConnectionListEntry = {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  signalType: string;
  channelCount: number;
};

/**
 * Return all cables in the currently active graph.
 * Useful for a connection editor that needs to refresh independently
 * of the full graph snapshot.
 */
export async function nativeGraphGetConnectionList(): Promise<
  ConnectionListEntry[]
> {
  const r = await invokeElementNative("elementGraphGetConnectionList", []);
  if (typeof r !== "string") return [];
  try {
    return JSON.parse(r) as ConnectionListEntry[];
  } catch {
    return [];
  }
}

export async function nativeScriptGetSource(nodeId: string): Promise<string> {
  const r = await invokeElementNative("elementScriptGetSource", [nodeId]);
  return typeof r === "string" ? r : "";
}

export type ScriptCompileResult = { ok: boolean; error: string };

export async function nativeScriptSetSource(
  nodeId: string,
  source: string,
): Promise<ScriptCompileResult> {
  const r = await invokeElementNative("elementScriptSetSource", [nodeId, source]);
  if (typeof r !== "string") return { ok: false, error: "no response" };
  try {
    const o = JSON.parse(r) as Partial<ScriptCompileResult>;
    return { ok: !!o.ok, error: typeof o.error === "string" ? o.error : "" };
  } catch {
    return { ok: false, error: "invalid response" };
  }
}

export async function nativeScriptCompile(nodeId: string): Promise<ScriptCompileResult> {
  const r = await invokeElementNative("elementScriptCompile", [nodeId]);
  if (typeof r !== "string") return { ok: false, error: "no response" };
  try {
    const o = JSON.parse(r) as Partial<ScriptCompileResult>;
    return { ok: !!o.ok, error: typeof o.error === "string" ? o.error : "" };
  } catch {
    return { ok: false, error: "invalid response" };
  }
}

