import { invokeElementNative } from "./juceBackend";
import { logBridgeError } from "./bridgeError";

/**
 * Save the current selection as a reusable Snippet (Molecule). Wave-2 C/lead.
 * Returns true ONLY when the host genuinely created + stored the molecule
 * (NOTHING-fake: callers must surface failure honestly).
 *
 * C++ bridge: elementMoleculeSave(name, nodeUuids[])
 */
export async function nativeMoleculeSave(
  name: string,
  nodeIds: string[],
): Promise<boolean> {
  const r = await invokeElementNative("elementMoleculeSave", [name, nodeIds]);
  return r === true;
}

export async function nativeGraphAddPlugin(
  identifier: string,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphAddPlugin", [identifier]);
  return r === true;
}

/**
 * T3 — Opt(Alt)+drop a cable on empty canvas: add a Block AT the flow-space
 * drop point (x,y) and atomically auto-connect it to the port the cable was
 * dragged off. One undoable host action (AddPluginMessage carrying a populated
 * ConnectionBuilder); the new node is positioned to (x,y) and re-pushed via the
 * authoritative snapshot — never fabricated client-side.
 *
 *   identifier   — real BrowserPlugin.identifier (PluginDescription id string)
 *   x, y         — FLOW-space coords for the new Block (reactFlow.screenToFlow)
 *   originNodeId — UUID of the Block the cable was dragged off
 *   originPortId — webview port id on the origin ("out-N" / "in-N")
 *   originIsSource — true when the dragged origin port was an OUTPUT (source):
 *                    origin output → new Block input. false → new Block output →
 *                    origin input.
 *
 * Returns false (honest) on any host-side resolution failure (unknown plugin,
 * origin node/port not found, no compatible port on the new Block).
 *
 * C++ bridge: elementGraphAddPluginConnected
 */
export async function nativeGraphAddPluginConnected(
  identifier: string,
  x: number,
  y: number,
  originNodeId: string,
  originPortId: string,
  originIsSource: boolean,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphAddPluginConnected", [
    identifier,
    x,
    y,
    originNodeId,
    originPortId,
    originIsSource,
  ]);
  return r === true;
}

/**
 * I4-B — toggle a plugin's persistent favourite status WITHOUT inserting a
 * Block. `identifier` is the real BrowserPlugin.identifier
 * (PluginDescription.createIdentifierString). The host flips + persists it on
 * the PluginUsageTracker; the new favourite set is read back on the next
 * `usePluginBrowserStore.refresh()` (pull-based snapshot). Returns false if the
 * identifier doesn't resolve to a known plugin.
 */
export async function nativeToggleFavorite(
  identifier: string,
): Promise<boolean> {
  const r = await invokeElementNative("elementToggleFavorite", [identifier]);
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

/**
 * Splice a block INTO an existing cable as a SINGLE undoable operation: the
 * host removes the original A→B cable and adds A→new and new→B inside ONE
 * `SpliceConnectionMessage`, which `GuiService::handleMessage` performs in a
 * single `beginNewTransaction()` — so one undo restores the original cable
 * (task #23, Glen Q7 "adding blocks into existing chains must be seamless").
 *
 * Ports follow the bridge handle convention: `aOutPort`/`newOutPort` are
 * "out-N", `newInPort`/`bInPort` are "in-N". Resolves true when the host posted
 * the splice; resolves false (without posting) on a host lacking the native, so
 * the caller can fall back to three separate connect/disconnect calls.
 *
 * C++ bridge: elementGraphSpliceCable(aId, aOut, newId, newIn, newOut, bId, bIn)
 */
export async function nativeGraphSpliceCable(
  aId: string,
  aOutPort: string,
  newId: string,
  newInPort: string,
  newOutPort: string,
  bId: string,
  bInPort: string,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphSpliceCable", [
    aId,
    aOutPort,
    newId,
    newInPort,
    newOutPort,
    bId,
    bInPort,
  ]);
  return r === true;
}

/**
 * Wave-3 Task 5.1 — double-click a Cable → drop a Reroute "knot" at the cursor
 * that splices the cable A→B through it, ATOMICALLY (single undo). Unlike
 * {@link nativeGraphSpliceCable} (which splices an EXISTING node), the reroute
 * node does NOT exist yet — so the host CREATES it server-side (where it has the
 * uuid) AND splices in ONE undoable `InsertRerouteMessage`. One undo removes the
 * reroute and restores the original A→B cable.
 *
 * The reroute TYPE is chosen host-side from `signalType`: "audio" →
 * element.audioReroute, "midi" → element.midiReroute, else element.reroute; its
 * in/out ports are resolved by PortType inside the action. The new knot is
 * positioned at the flow-space `(x, y)` cursor point via the same deferred-apply
 * the ⌥+drop add uses — never fabricated client-side.
 *
 *   aId       — UUID of the cable's source Block
 *   aOutPort  — source output handle ("out-N")
 *   bId       — UUID of the cable's target Block
 *   bInPort   — target input handle ("in-N")
 *   signalType— the cable's signal type ("audio" | "midi" | "value")
 *   x, y      — FLOW-space coords for the new knot (reactFlow.screenToFlowPosition)
 *
 * Returns false (honest) on any host-side resolution failure (unknown
 * node/port, or the reroute identifier not in the known-plugin list).
 *
 * C++ bridge: elementGraphInsertReroute
 */
export async function nativeGraphInsertReroute(
  aId: string,
  aOutPort: string,
  bId: string,
  bInPort: string,
  signalType: string,
  x: number,
  y: number,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphInsertReroute", [
    aId,
    aOutPort,
    bId,
    bInPort,
    signalType,
    x,
    y,
  ]);
  return r === true;
}

export async function nativeGraphMoveNodes(
  moves: Array<{ id: string; x: number; y: number }>,
): Promise<number> {
  const r = await invokeElementNative("elementGraphMoveNodes", [moves]);
  return typeof r === "number" ? r : 0;
}

/**
 * G3c item 4: apply a batch of auto-layout positions in one host operation
 * (single snapshot push). The positions are computed deterministically in the
 * webview (lib/autoLayout.ts) from the real node/edge graph. Returns the count
 * of nodes actually repositioned. Same arg shape as nativeGraphMoveNodes.
 *
 * C++ bridge: elementGraphAutoLayout
 */
export async function nativeGraphAutoLayout(
  positions: Array<{ id: string; x: number; y: number }>,
): Promise<number> {
  const r = await invokeElementNative("elementGraphAutoLayout", [positions]);
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

// ── G3-A (verdict #28): NodeContextMenu native-parity bridges ───────────────

/**
 * Disconnect all matching cables on a node (NOT a single cable — see
 * nativeGraphDisconnect for cable-level). Mirrors the JUCE NodePopupMenu
 * disconnect scopes. The host drives an authoritative graph snapshot after the
 * DisconnectNodeMessage, so cables disappear via the next snapshot (no local
 * fake-removal needed). Returns true if the node was found.
 */
export async function nativeGraphDisconnectNode(
  nodeId: string,
  scope: "all" | "inputs" | "outputs" | "midi" = "all",
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphDisconnectNode", [
    nodeId,
    scope,
  ]);
  return r === true;
}

/**
 * Set a user node colour. `color` is "#RRGGBB" (opaque) or "" to clear (revert
 * to the category accent). Round-trips through the snapshot color → hostColor.
 */
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

/**
 * Set the oversampling factor (1 = off, 2/4/8 ×). Returns false for Audio/MIDI
 * I/O nodes (no oversampling) or an invalid factor — the caller rolls back.
 */
export async function nativeGraphSetOversample(
  nodeId: string,
  factor: 1 | 2 | 4 | 8,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphSetOversample", [
    nodeId,
    factor,
  ]);
  return r === true;
}

/**
 * Replace the plugin in a node in-place, keeping connections where possible.
 * `pluginIdentifier` comes from the real plugin list (BrowserPlugin.identifier).
 * The replaced node's ports/name/params arrive via the next snapshot — never
 * fabricated locally. Returns false if the node or identifier is unknown.
 */
export async function nativeGraphReplacePlugin(
  nodeId: string,
  pluginIdentifier: string,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphReplacePlugin", [
    nodeId,
    pluginIdentifier,
  ]);
  return r === true;
}

/**
 * Container dive — descend INTO a Container Block's nested Board.
 *
 * `nodeUuid` is the real Block UUID of a direct-child graph node. The host
 * makes that nested Board the active graph and re-pushes an authoritative
 * snapshot (the nested nodes/edges + a deeper `breadcrumbs` path) — so the
 * canvas content + breadcrumb update FROM THE SNAPSHOT, never optimistically.
 * Returns false (no-op) if the node isn't a direct-child graph; the caller
 * must NOT fake any local breadcrumb change on false.
 *
 * C++ bridge: elementEnterContainer
 */
export async function nativeEnterContainer(nodeUuid: string): Promise<boolean> {
  const r = await invokeElementNative("elementEnterContainer", [nodeUuid]);
  return r === true;
}

/**
 * Container dive — back out ONE level to the parent Board. The host re-pushes
 * the parent's snapshot + the shortened breadcrumb path. Returns false when
 * already at the top (no parent to exit to) — safe to call in a loop to exit
 * multiple levels, since the surplus calls at the top are honest no-ops.
 *
 * C++ bridge: elementExitContainer
 */
export async function nativeExitContainer(): Promise<boolean> {
  const r = await invokeElementNative("elementExitContainer", []);
  return r === true;
}

/**
 * T10 — group the given Blocks (by uuid) on the CURRENT board into a new nested
 * Container, moving them inside and re-wiring internal + boundary cables. The
 * host re-pushes the parent snapshot on success (the grouped Blocks are gone +
 * a Container Block appears). Refused (no Block change) when the selection
 * contains an IO/graph/Portal Block, resolves to fewer than two Blocks, or a
 * Value/CV cable crosses the selection boundary (default Containers have no CV
 * ports). On refusal `ok` is false and `reason` names the cause.
 *
 * C++ bridge: elementGroupNodes
 */
export async function nativeGroupNodes(
  nodeIds: string[],
): Promise<{ ok: true; containerId: string } | { ok: false; reason: string }> {
  const r = await invokeElementNative("elementGroupNodes", [nodeIds]);
  const o = (typeof r === "string" ? JSON.parse(r) : r) as {
    ok?: unknown;
    containerId?: unknown;
    reason?: unknown;
  };
  if (o && o.ok === true && typeof o.containerId === "string") {
    return { ok: true, containerId: o.containerId };
  }
  return {
    ok: false,
    reason: typeof o?.reason === "string" ? o.reason : "ineligible",
  };
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

/**
 * Rename a TOP-LEVEL Board (session graph) by its index.
 *
 * Blocks and Containers are Nodes inside a board's node list and rename by uuid
 * via {@link nativeGraphRenameNode}. A top-level Board has no node uuid — it is
 * a Session graph addressed by index (mirrors `nativeSessionSetActiveGraph`),
 * so it routes through its own native (`elementSessionRenameGraph`). The host
 * sets the name on the session-graph ValueTree (message thread) and re-pushes
 * an authoritative snapshot, so the breadcrumb/tab redraw from engine truth.
 */
export async function nativeSessionRenameGraph(
  index: number,
  name: string,
): Promise<boolean> {
  const r = await invokeElementNative("elementSessionRenameGraph", [
    index,
    name,
  ]);
  return r === true;
}

/**
 * Update a block's free-form user note (Inspector textarea).
 * Persists in the Node ValueTree as the "userNote" property so it survives
 * project save/load. Blueprint §7.4.11.
 */
export async function nativeGraphSetNodeNote(
  nodeId: string,
  note: string,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphSetNodeNote", [nodeId, note]);
  return r === true;
}

/**
 * Set the per-block hidden parameter-port set (Configure Parameters… popover,
 * Glen 2026-06-03). `hiddenIds` are the Value/CV param-port ids the user chose
 * to hide on the Block. Sent as a comma-joined CSV (host stores it verbatim on
 * the Node ValueTree as "userHiddenParams", mirroring "userNote"), so the
 * choice persists across project save/load and reconciles on the next snapshot
 * (`hiddenParams` field). Empty array → "" clears all (every param visible).
 */
export async function nativeGraphSetNodeHiddenParams(
  nodeId: string,
  hiddenIds: string[],
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphSetNodeHiddenParams", [
    nodeId,
    hiddenIds.join(","),
  ]);
  return r === true;
}

/**
 * Set a Block's persisted collapse TIER (Wave-3 Task 2.0; widens the legacy
 * `collapsed` boolean). `tier` is "title" (header only) / "macro" (header +
 * curated Macro row, the lean default) / "expanded" (full control deck). The
 * host stores it verbatim on the Node ValueTree as the "collapseTier" string
 * property (and dual-writes a derived legacy "collapsed" bool for old-build
 * round-trip — see contract §4.1) so the tier survives project save/load and
 * reconciles on the next snapshot (`collapseTier` field). Write-on-click only ⇒
 * the field joins the coalesced graph push and a static graph still pushes
 * nothing.
 */
export async function nativeGraphSetNodeCollapseTier(
  nodeId: string,
  tier: "title" | "macro" | "expanded",
): Promise<boolean> {
  const r = await invokeElementNative("elementNodeSetCollapseTier", [
    nodeId,
    tier,
  ]);
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
  if (r == null) return { parameters: [] };
  try {
    const o = (typeof r === "string" ? JSON.parse(r) : r) as {
      parameters?: NodeParameterRow[];
    };
    return { parameters: Array.isArray(o.parameters) ? o.parameters : [] };
  } catch (err) {
    logBridgeError("nativeGetNodeParameters.parse", err);
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

/**
 * Set the integer "mode" of a built-in logic/comparator node
 * (element.compare → operator, element.logic → mode). Returns true when the
 * host found the node and applied the mode (and pushed a fresh snapshot).
 */
export async function nativeNodeSetIntMode(
  nodeId: string,
  mode: number,
): Promise<boolean> {
  const r = await invokeElementNative("elementNodeSetIntMode", [nodeId, mode]);
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
  } catch (err) {
    logBridgeError("nativeSessionGetGraphTree.parse", err);
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
  } catch (err) {
    logBridgeError("nativeGraphGetConnectionList.parse", err);
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
  } catch (err) {
    logBridgeError("nativeScriptSetSource.parse", err);
    return { ok: false, error: "invalid response" };
  }
}

export async function nativeScriptCompile(nodeId: string): Promise<ScriptCompileResult> {
  const r = await invokeElementNative("elementScriptCompile", [nodeId]);
  if (typeof r !== "string") return { ok: false, error: "no response" };
  try {
    const o = JSON.parse(r) as Partial<ScriptCompileResult>;
    return { ok: !!o.ok, error: typeof o.error === "string" ? o.error : "" };
  } catch (err) {
    logBridgeError("nativeScriptCompile.parse", err);
    return { ok: false, error: "invalid response" };
  }
}

export interface ScriptRuntimeVar {
  name: string;
  type: string;
  value: string;
}

export interface ScriptRuntimeState {
  ok: boolean;
  vars?: ScriptRuntimeVar[];
  error?: string;
}

export async function nativeScriptGetRuntimeState(
  nodeId: string,
): Promise<ScriptRuntimeState> {
  const raw = await invokeElementNative("elementScriptGetRuntimeState", [nodeId]);
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as ScriptRuntimeState;
    } catch (err) {
      logBridgeError("nativeScriptGetRuntimeState.parse", err);
      return { ok: false, error: "parse error" };
    }
  }
  if (raw && typeof raw === "object") return raw as ScriptRuntimeState;
  return { ok: false, error: "no response" };
}

// ── P1-10: Preset Bank A/B Compare ───────────────────────────────────────

/** Snapshot live parameter values of nodeId into slot "A" or "B". */
export async function nativePresetSnapshot(
  nodeId: string,
  slot: "A" | "B",
): Promise<{ ok: boolean; error?: string }> {
  const raw = await invokeElementNative("elementPresetSnapshot", [nodeId, slot]);
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as { ok: boolean; error?: string };
    } catch (err) {
      logBridgeError("nativePresetSnapshot.parse", err);
      return { ok: false, error: "parse error" };
    }
  }
  return { ok: false, error: "no response" };
}

/**
 * Apply targetSlot's stored values to the live processor.
 * Returns count of parameters written.
 */
export async function nativePresetSwap(
  nodeId: string,
  targetSlot: "A" | "B",
): Promise<{ ok: boolean; swapped: number; error?: string }> {
  const raw = await invokeElementNative("elementPresetSwap", [nodeId, targetSlot]);
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as { ok: boolean; swapped: number; error?: string };
    } catch (err) {
      logBridgeError("nativePresetSwap.parse", err);
      return { ok: false, swapped: 0, error: "parse error" };
    }
  }
  return { ok: false, swapped: 0, error: "no response" };
}

/** Save the current node state as a named preset on disk. */
export async function nativePresetSave(
  nodeId: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const raw = await invokeElementNative("elementPresetSave", [nodeId, name]);
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as { ok: boolean; error?: string };
    } catch (err) {
      logBridgeError("nativePresetSave.parse", err);
      return { ok: false, error: "parse error" };
    }
  }
  return { ok: false, error: "no response" };
}

/** Load a named preset from disk and apply it to the node. */
export async function nativePresetLoad(
  nodeId: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const raw = await invokeElementNative("elementPresetLoad", [nodeId, name]);
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as { ok: boolean; error?: string };
    } catch (err) {
      logBridgeError("nativePresetLoad.parse", err);
      return { ok: false, error: "parse error" };
    }
  }
  return { ok: false, error: "no response" };
}

/** List preset names on disk, optionally filtered by pluginId. */
export async function nativePresetList(
  pluginId = "",
): Promise<{ ok: boolean; presets: string[]; error?: string }> {
  const raw = await invokeElementNative("elementPresetList", [pluginId]);
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as { ok: boolean; presets: string[]; error?: string };
    } catch (err) {
      logBridgeError("nativePresetList.parse", err);
      return { ok: false, presets: [], error: "parse error" };
    }
  }
  return { ok: false, presets: [], error: "no response" };
}

