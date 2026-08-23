import { useEffect, useMemo, useState } from "react";
import {
  useGraphStore,
  selectNodes,
  selectEdges,
} from "../../stores/useGraphStore";
import { NeuButton } from "../neu/NeuButton";
import { NeuInput } from "../neu/NeuInput";
import { Icon } from "../neu/Icon";
import type { BlockData, CableData, SignalType } from "../../data/types";
import {
  nativeGraphConnect,
  nativeGraphDisconnect,
  nativeGraphGetConnectionList,
} from "../../bridge/nativeGraph";

// ── Signal type pill ──

const SIGNAL_LABEL: Record<SignalType, string> = {
  audio: "Audio",
  midi: "MIDI",
  value: "Value",
};

const SIGNAL_COLOR: Record<SignalType, string> = {
  audio: "text-generator border-generator/30 bg-generator/10",
  midi: "text-logic border-logic/30 bg-logic/10",
  value: "text-modifier border-modifier/30 bg-modifier/10",
};

function SignalPill({ type }: { type: SignalType }) {
  return (
    <span
      className={[
        "inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider tabular-nums shrink-0",
        SIGNAL_COLOR[type],
      ].join(" ")}
    >
      {SIGNAL_LABEL[type]}
    </span>
  );
}

// ── Category dot colors ──

const CATEGORY_DOT: Record<string, string> = {
  generator: "bg-generator",
  modifier: "bg-modifier",
  logic: "bg-logic",
};

function CategoryDot({ category }: { category: string }) {
  const colorClass = CATEGORY_DOT[category] ?? "bg-text-secondary";
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${colorClass}`}
    />
  );
}

// ── Normalise a cable's signalType to SignalType ──

function toSignalType(raw: string): SignalType {
  if (raw === "midi") return "midi";
  if (raw === "value") return "value";
  return "audio";
}

// ── Connection row ──

interface ConnectionRowProps {
  cable: CableData;
  sourceBlock: BlockData | undefined;
  targetBlock: BlockData | undefined;
  onDisconnect: (cable: CableData) => void;
}

function ConnectionRow({
  cable,
  sourceBlock,
  targetBlock,
  onDisconnect,
}: ConnectionRowProps) {
  const sourceName = sourceBlock?.name ?? cable.source;
  const sourceCategory = sourceBlock?.category ?? "generator";
  const sourcePort =
    sourceBlock?.ports.find((p) => p.id === cable.sourcePort)?.label ??
    cable.sourcePort;

  const targetName = targetBlock?.name ?? cable.target;
  const targetCategory = targetBlock?.category ?? "generator";
  const targetPort =
    targetBlock?.ports.find((p) => p.id === cable.targetPort)?.label ??
    cable.targetPort;

  const signalType = toSignalType(cable.signalType as string);

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-white/5 bg-surface shadow-[-1px_-1px_4px_rgba(255,255,255,0.03),1px_1px_4px_rgba(0,0,0,0.25)] hover:bg-elevated transition-colors group">
      {/* Source */}
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <CategoryDot category={sourceCategory} />
        <span className="text-[10px] text-text-primary font-bold truncate">
          {sourceName}
        </span>
        <span className="text-text-dim text-[9px] shrink-0">·</span>
        <span className="text-[9px] text-text-secondary truncate">{sourcePort}</span>
      </div>

      {/* Arrow */}
      <Icon
        name="Play"
        size={10}
        className="text-text-dim shrink-0"
        aria-hidden
      />

      {/* Target */}
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <CategoryDot category={targetCategory} />
        <span className="text-[10px] text-text-primary font-bold truncate">
          {targetName}
        </span>
        <span className="text-text-dim text-[9px] shrink-0">·</span>
        <span className="text-[9px] text-text-secondary truncate">{targetPort}</span>
      </div>

      {/* Signal type pill */}
      <SignalPill type={signalType} />

      {/* Remove button */}
      <button
        onClick={() => onDisconnect(cable)}
        className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-text-dim hover:text-error hover:bg-error/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        aria-label={`Remove cable from ${sourceName} to ${targetName}`}
      >
        <Icon name="X" size={12} aria-hidden />
      </button>
    </div>
  );
}

// ── Add cable inline form ──

interface AddCableFormProps {
  nodes: BlockData[];
  onConfirm: (
    sourceId: string,
    sourceHandle: string,
    targetId: string,
    targetHandle: string,
  ) => void;
  onCancel: () => void;
}

function AddCableForm({ nodes, onConfirm, onCancel }: AddCableFormProps) {
  const [sourceBlockId, setSourceBlockId] = useState("");
  const [sourcePortId, setSourcePortId] = useState("");
  const [targetBlockId, setTargetBlockId] = useState("");
  const [targetPortId, setTargetPortId] = useState("");

  const sourceBlock = nodes.find((n) => n.id === sourceBlockId);
  const targetBlock = nodes.find((n) => n.id === targetBlockId);

  const sourcePorts = useMemo(
    () => sourceBlock?.ports.filter((p) => p.direction === "output") ?? [],
    [sourceBlock],
  );
  const targetPorts = useMemo(
    () => targetBlock?.ports.filter((p) => p.direction === "input") ?? [],
    [targetBlock],
  );

  const canConfirm =
    sourceBlockId !== "" &&
    sourcePortId !== "" &&
    targetBlockId !== "" &&
    targetPortId !== "";

  const handleSourceBlock = (id: string) => {
    setSourceBlockId(id);
    setSourcePortId("");
  };

  const handleTargetBlock = (id: string) => {
    setTargetBlockId(id);
    setTargetPortId("");
  };

  const selectClass =
    "w-full bg-pressed border border-white/5 rounded px-2 py-1.5 text-[10px] text-text-primary " +
    "shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] " +
    "outline-none focus:ring-1 focus:ring-generator/30 transition-shadow duration-100 appearance-none cursor-pointer";

  return (
    <div className="rounded border border-white/5 bg-surface p-3 space-y-3 shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)]">
      <div className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
        Add Cable
      </div>

      <div className="space-y-2">
        {/* Source block */}
        <div className="space-y-1">
          <div className="text-[9px] text-text-dim uppercase tracking-wider">Source block</div>
          <select
            value={sourceBlockId}
            onChange={(e) => handleSourceBlock(e.target.value)}
            className={selectClass}
          >
            <option value="">— select block —</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>

        {/* Source port */}
        <div className="space-y-1">
          <div className="text-[9px] text-text-dim uppercase tracking-wider">Source port (output)</div>
          <select
            value={sourcePortId}
            onChange={(e) => setSourcePortId(e.target.value)}
            disabled={sourcePorts.length === 0}
            className={selectClass}
          >
            <option value="">— select port —</option>
            {sourcePorts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label || p.id}
              </option>
            ))}
          </select>
        </div>

        {/* Target block */}
        <div className="space-y-1">
          <div className="text-[9px] text-text-dim uppercase tracking-wider">Target block</div>
          <select
            value={targetBlockId}
            onChange={(e) => handleTargetBlock(e.target.value)}
            className={selectClass}
          >
            <option value="">— select block —</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>

        {/* Target port */}
        <div className="space-y-1">
          <div className="text-[9px] text-text-dim uppercase tracking-wider">Target port (input)</div>
          <select
            value={targetPortId}
            onChange={(e) => setTargetPortId(e.target.value)}
            disabled={targetPorts.length === 0}
            className={selectClass}
          >
            <option value="">— select port —</option>
            {targetPorts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label || p.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <NeuButton
          size="sm"
          className="flex-1"
          onClick={() => {
            if (canConfirm) {
              onConfirm(sourceBlockId, sourcePortId, targetBlockId, targetPortId);
            }
          }}
        >
          Connect
        </NeuButton>
        <NeuButton size="sm" onClick={onCancel}>
          Cancel
        </NeuButton>
      </div>
    </div>
  );
}

// ── Main ConnectionEditor ──

type SignalFilter = SignalType | "all";

/**
 * Inspector panel that lists every Cable on the current Board as a searchable,
 * filterable table and lets the user add or remove connections without drawing
 * on the canvas. Use it for precise, list-driven routing edits — e.g. auditing
 * all MIDI Cables, or wiring a specific source-port → target-port pair via the
 * Add Cable form. Filter chips scope by signal type (Audio/MIDI/Value); rows
 * stay live-synced to the graph store and fall back to the native connection
 * list when the store is empty.
 */
export function ConnectionEditor() {
  const nodes = useGraphStore(selectNodes);
  const storeEdges = useGraphStore(selectEdges);

  // Local cable list — seeded from store, falls back to native API if store is empty
  const [cables, setCables] = useState<CableData[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [signalFilter, setSignalFilter] = useState<SignalFilter>("all");

  // Keep local cables in sync with store edges (live)
  useEffect(() => {
    if (storeEdges.length > 0) {
      setCables(storeEdges);
      return;
    }
    // Fallback: fetch from native API on mount only when store is empty
    void nativeGraphGetConnectionList().then((list) => {
      setCables(
        list.map((entry) => ({
          id: entry.id,
          source: entry.source,
          sourcePort: entry.sourcePort,
          target: entry.target,
          targetPort: entry.targetPort,
          signalType: toSignalType(entry.signalType),
          channelCount: (entry.channelCount as 1 | 2 | 6) ?? 1,
          isSidechain: false,
        })),
      );
    });
  }, [storeEdges]);

  // Build a node lookup map
  const nodeMap = useMemo(
    () => new Map<string, BlockData>(nodes.map((n) => [n.id, n])),
    [nodes],
  );

  // Filter cables
  const filteredCables = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return cables.filter((cable) => {
      const src = nodeMap.get(cable.source);
      const tgt = nodeMap.get(cable.target);

      // Signal type filter
      if (signalFilter !== "all") {
        const cableType = toSignalType(cable.signalType as string);
        if (cableType !== signalFilter) return false;
      }

      // Text search: match block name or port label
      if (q) {
        const srcName = (src?.name ?? cable.source).toLowerCase();
        const tgtName = (tgt?.name ?? cable.target).toLowerCase();
        const srcPort =
          (
            src?.ports.find((p) => p.id === cable.sourcePort)?.label ??
            cable.sourcePort
          ).toLowerCase();
        const tgtPort =
          (
            tgt?.ports.find((p) => p.id === cable.targetPort)?.label ??
            cable.targetPort
          ).toLowerCase();
        if (
          !srcName.includes(q) &&
          !tgtName.includes(q) &&
          !srcPort.includes(q) &&
          !tgtPort.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [cables, nodeMap, searchText, signalFilter]);

  const handleDisconnect = (cable: CableData) => {
    void nativeGraphDisconnect(
      cable.source,
      cable.sourcePort,
      cable.target,
      cable.targetPort,
    ).then((ok) => {
      if (ok) {
        setCables((prev) => prev.filter((c) => c.id !== cable.id));
      }
    });
  };

  const handleConnect = (
    sourceId: string,
    sourceHandle: string,
    targetId: string,
    targetHandle: string,
  ) => {
    void nativeGraphConnect(sourceId, sourceHandle, targetId, targetHandle).then(
      (ok) => {
        if (ok) {
          // Optimistically add to local list; engine snapshot will overwrite on next sync
          const srcBlock = nodeMap.get(sourceId);
          const srcPort = srcBlock?.ports.find((p) => p.id === sourceHandle);
          const signalType: SignalType = srcPort?.type ?? "audio";
          const newCable: CableData = {
            id: `${sourceId}__${sourceHandle}__${targetId}__${targetHandle}`,
            source: sourceId,
            sourcePort: sourceHandle,
            target: targetId,
            targetPort: targetHandle,
            signalType,
            channelCount: 1,
            isSidechain: false,
          };
          setCables((prev) => [...prev, newCable]);
          setShowAddForm(false);
        }
      },
    );
  };

  const SIGNAL_TYPES: SignalFilter[] = ["all", "audio", "midi", "value"];
  const FILTER_LABEL: Record<SignalFilter, string> = {
    all: "All",
    audio: "Audio",
    midi: "MIDI",
    value: "Value",
  };

  return (
    <div className="flex flex-col h-full gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="Cable" size={14} className="text-text-secondary" aria-hidden />
          <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
            Connections
          </span>
          <span className="text-[9px] text-text-dim tabular-nums bg-pressed px-1.5 py-0.5 rounded border border-white/5">
            {filteredCables.length}
          </span>
        </div>
      </div>

      {/* Search */}
      <NeuInput
        placeholder="Search blocks or ports…"
        value={searchText}
        onChange={setSearchText}
      />

      {/* Signal type chip filters */}
      <div className="flex gap-1 flex-wrap">
        {SIGNAL_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setSignalFilter(type)}
            className={[
              "px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider transition-colors",
              signalFilter === type
                ? type === "audio"
                  ? "bg-generator/20 border-generator/30 text-generator"
                  : type === "midi"
                    ? "bg-logic/20 border-logic/30 text-logic"
                    : type === "value"
                      ? "bg-modifier/20 border-modifier/30 text-modifier"
                      : "bg-surface border-white/10 text-text-primary"
                : "bg-pressed border-white/5 text-text-dim hover:text-text-secondary hover:bg-surface",
            ].join(" ")}
          >
            {FILTER_LABEL[type]}
          </button>
        ))}
      </div>

      {/* Connection list */}
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0 pr-0.5">
        {filteredCables.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-[10px] text-text-dim text-center leading-relaxed">
            {cables.length === 0
              ? "No connections in this board."
              : "No connections match your filter."}
          </div>
        ) : (
          filteredCables.map((cable) => (
            <ConnectionRow
              key={cable.id}
              cable={cable}
              sourceBlock={nodeMap.get(cable.source)}
              targetBlock={nodeMap.get(cable.target)}
              onDisconnect={handleDisconnect}
            />
          ))
        )}
      </div>

      {/* Add cable form */}
      {showAddForm ? (
        <AddCableForm
          nodes={nodes}
          onConfirm={handleConnect}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <NeuButton
          size="sm"
          className="w-full"
          onClick={() => setShowAddForm(true)}
        >
          <Icon name="Plus" size={12} aria-hidden />
          Add Cable
        </NeuButton>
      )}
    </div>
  );
}
