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

export async function nativeGraphSetNodeColor(
  nodeId: string,
  color: string,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphSetNodeColor", [
    nodeId,
    color,
  ]);
  return r === true;
}

export async function nativeGraphRemoveNodes(
  nodeIds: string[],
): Promise<number> {
  const r = await invokeElementNative("elementGraphRemoveNodes", [nodeIds]);
  return typeof r === "number" ? r : 0;
}

export async function nativeGraphAlignNodes(
  nodeIds: string[],
  direction: "horizontal" | "vertical",
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphAlignNodes", [
    nodeIds,
    direction,
  ]);
  return r === true;
}
