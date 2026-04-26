import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useDashboardStore,
  type DashboardWidget,
  type WidgetKind,
} from "../../stores/useDashboardStore";
import { useParameterStore, paramKey } from "../../stores/useParameterStore";
import { useGraphStore } from "../../stores/useGraphStore";
import { NeuKnob } from "../neu/NeuKnob";
import { NeuFader } from "../neu/NeuFader";
import {
  nativeSetNodeParameter,
  nativeGetNodeParameters,
  type NodeParameterRow,
} from "../../bridge/nativeGraph";

// ── Icons (inline SVG paths) ──

const ICON_EDIT =
  "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z";
const ICON_ADD =
  "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z";
const ICON_DELETE =
  "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z";
const ICON_CLOSE =
  "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";
const ICON_LINK =
  "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z";

function Icon({ d, size = 14, className = "" }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d={d} />
    </svg>
  );
}

// ── Color map ──

const COLOR_HEX: Record<NonNullable<DashboardWidget["color"]>, string> = {
  blue: "#4A90D9",
  orange: "#E8A838",
  teal: "#2BC4C4",
  red: "#EF4444",
};

const COLOR_TEXT: Record<NonNullable<DashboardWidget["color"]>, string> = {
  blue: "text-generator",
  orange: "text-modifier",
  teal: "text-logic",
  red: "text-error",
};

// ── Snap helper ──

const SNAP = 8;
function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}

// ── Meter widget ──

function MeterWidget({ widget }: { widget: DashboardWidget }) {
  const raw = useParameterStore(
    (s) =>
      widget.nodeId != null && widget.paramIndex != null
        ? s.values[paramKey(widget.nodeId, widget.paramIndex)]
        : undefined,
  );
  const level = raw != null ? Math.round(raw * 100) : 0;
  const hex = COLOR_HEX[widget.color ?? "blue"];

  return (
    <div className="flex flex-col items-center gap-1 h-full">
      <div
        className="flex-1 w-full bg-pressed shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] rounded-[2px] flex flex-col-reverse p-[2px] overflow-hidden"
        style={{ minHeight: 0 }}
      >
        <div
          className="w-full rounded-[1px] transition-all duration-75"
          style={{ height: `${level}%`, backgroundColor: hex }}
        />
      </div>
      <span className="text-[8px] font-bold tabular-nums" style={{ color: hex }}>
        {level}
      </span>
    </div>
  );
}

// ── Button widget ──

function ButtonWidget({
  widget,
  interactive,
  onWriteParam,
}: {
  widget: DashboardWidget;
  interactive: boolean;
  onWriteParam: (nodeId: string, paramIndex: number, value: number) => void;
}) {
  const raw = useParameterStore(
    (s) =>
      widget.nodeId != null && widget.paramIndex != null
        ? s.values[paramKey(widget.nodeId, widget.paramIndex)]
        : undefined,
  );
  const active = raw != null ? raw > 0.5 : false;
  const hex = COLOR_HEX[widget.color ?? "teal"];

  const handleClick = useCallback(() => {
    if (!interactive || widget.nodeId == null || widget.paramIndex == null) return;
    const next = active ? 0 : 1;
    onWriteParam(widget.nodeId, widget.paramIndex, next);
  }, [interactive, widget.nodeId, widget.paramIndex, active, onWriteParam]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!interactive}
      className={[
        "w-full h-full rounded border text-[9px] font-black uppercase tracking-widest transition-all duration-100",
        active
          ? "shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] translate-y-px border-white/10"
          : "shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] border-white/5",
        "bg-surface",
        interactive ? "cursor-pointer" : "cursor-default",
      ].join(" ")}
      style={active ? { color: hex, borderColor: `${hex}40` } : { color: "#8E8E93" }}
    >
      {widget.label ?? "BTN"}
    </button>
  );
}

// ── Knob widget (live-bound) ──

function KnobWidget({
  widget,
  interactive,
  onWriteParam,
}: {
  widget: DashboardWidget;
  interactive: boolean;
  onWriteParam: (nodeId: string, paramIndex: number, value: number) => void;
}) {
  const raw = useParameterStore(
    (s) =>
      widget.nodeId != null && widget.paramIndex != null
        ? s.values[paramKey(widget.nodeId, widget.paramIndex)]
        : undefined,
  );
  const displayValue = raw != null ? Math.round(raw * 100) : 50;
  const color = (widget.color === "red" ? "blue" : (widget.color ?? "blue")) as
    | "blue"
    | "orange"
    | "teal";

  const handleChange = useCallback(
    (v: number) => {
      if (!interactive || widget.nodeId == null || widget.paramIndex == null) return;
      onWriteParam(widget.nodeId, widget.paramIndex, v / 100);
    },
    [interactive, widget.nodeId, widget.paramIndex, onWriteParam],
  );

  return (
    <NeuKnob
      value={displayValue}
      label={widget.label ?? ""}
      color={color}
      size="sm"
      onChange={interactive ? handleChange : undefined}
      className="scale-90 origin-top"
    />
  );
}

// ── Fader widget (live-bound) ──

function FaderWidget({
  widget,
  interactive,
  onWriteParam,
}: {
  widget: DashboardWidget;
  interactive: boolean;
  onWriteParam: (nodeId: string, paramIndex: number, value: number) => void;
}) {
  const raw = useParameterStore(
    (s) =>
      widget.nodeId != null && widget.paramIndex != null
        ? s.values[paramKey(widget.nodeId, widget.paramIndex)]
        : undefined,
  );
  const displayValue = raw != null ? Math.round(raw * 100) : 50;
  const color = (widget.color === "red" ? "orange" : (widget.color ?? "orange")) as
    | "blue"
    | "orange"
    | "teal";

  const handleChange = useCallback(
    (v: number) => {
      if (!interactive || widget.nodeId == null || widget.paramIndex == null) return;
      onWriteParam(widget.nodeId, widget.paramIndex, v / 100);
    },
    [interactive, widget.nodeId, widget.paramIndex, onWriteParam],
  );

  return (
    <NeuFader
      value={displayValue}
      orientation="vertical"
      label={widget.label ?? ""}
      color={color}
      onChange={interactive ? handleChange : undefined}
    />
  );
}

// ── Bind Modal ──

interface BindModalProps {
  widgetId: string;
  onClose: () => void;
}

function BindModal({ widgetId, onClose }: BindModalProps) {
  const nodes = useGraphStore((s) => s.nodes);
  const bindWidget = useDashboardStore((s) => s.bindWidget);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [params, setParams] = useState<NodeParameterRow[]>([]);
  const [selectedParamIndex, setSelectedParamIndex] = useState<number>(-1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedNodeId) {
      setParams([]);
      setSelectedParamIndex(-1);
      return;
    }
    setLoading(true);
    void nativeGetNodeParameters(selectedNodeId).then((r) => {
      setParams(r.parameters);
      setSelectedParamIndex(r.parameters.length > 0 ? 0 : -1);
      setLoading(false);
    });
  }, [selectedNodeId]);

  const handleBind = useCallback(() => {
    if (!selectedNodeId || selectedParamIndex < 0) return;
    bindWidget(widgetId, selectedNodeId, selectedParamIndex);
    onClose();
  }, [widgetId, selectedNodeId, selectedParamIndex, bindWidget, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-panel border border-white/10 rounded-xl shadow-[-4px_-4px_16px_rgba(255,255,255,0.03),4px_4px_16px_rgba(0,0,0,0.5)] w-72 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-widest text-text-primary">
            Bind Parameter
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <Icon d={ICON_CLOSE} size={16} />
          </button>
        </div>

        {/* Block selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-bold uppercase tracking-widest text-text-secondary">
            Block
          </label>
          <select
            value={selectedNodeId}
            onChange={(e) => setSelectedNodeId(e.target.value)}
            className="bg-pressed border border-white/10 rounded text-[11px] text-text-primary px-2 py-1.5 outline-none focus:border-generator/50 cursor-pointer"
          >
            <option value="">— select block —</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>

        {/* Parameter selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-bold uppercase tracking-widest text-text-secondary">
            Parameter
          </label>
          {loading ? (
            <div className="text-[10px] text-text-secondary px-2 py-1.5">Loading…</div>
          ) : (
            <select
              value={selectedParamIndex}
              onChange={(e) => setSelectedParamIndex(Number(e.target.value))}
              disabled={params.length === 0}
              className="bg-pressed border border-white/10 rounded text-[11px] text-text-primary px-2 py-1.5 outline-none focus:border-generator/50 cursor-pointer disabled:opacity-40"
            >
              {params.length === 0 && <option value={-1}>— no parameters —</option>}
              {params.map((p) => (
                <option key={p.index} value={p.index}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          type="button"
          onClick={handleBind}
          disabled={!selectedNodeId || selectedParamIndex < 0}
          className="mt-1 py-2 rounded bg-surface border border-white/10 text-[10px] font-black uppercase tracking-widest text-generator shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)] active:translate-y-px transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          Bind
        </button>
      </div>
    </div>
  );
}

// ── Single draggable widget shell ──

interface WidgetShellProps {
  widget: DashboardWidget;
  editing: boolean;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onMove: (x: number, y: number) => void;
  onBind: () => void;
  onWriteParam: (nodeId: string, paramIndex: number, value: number) => void;
}

function WidgetShell({
  widget,
  editing,
  selected,
  onSelect,
  onDelete,
  onMove,
  onBind,
  onWriteParam,
}: WidgetShellProps) {
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const isBound = widget.nodeId != null && widget.paramIndex != null;
  const colorText = COLOR_TEXT[widget.color ?? "blue"];

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!editing) return;
      e.stopPropagation();
      onSelect();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: widget.x,
        originY: widget.y,
      };
    },
    [editing, onSelect, widget.x, widget.y],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      onMove(
        snap(Math.max(0, dragRef.current.originX + dx)),
        snap(Math.max(0, dragRef.current.originY + dy)),
      );
    },
    [onMove],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div
      className={[
        "absolute flex items-center justify-center",
        editing ? "cursor-grab active:cursor-grabbing" : "",
        selected
          ? "outline outline-2 outline-offset-2 outline-generator rounded-sm shadow-[0_0_8px_rgba(74,144,217,0.4)]"
          : "",
      ].join(" ")}
      style={{
        left: widget.x,
        top: widget.y,
        width: widget.w,
        height: widget.h,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Content */}
      {widget.kind === "knob" && (
        <KnobWidget widget={widget} interactive={!editing} onWriteParam={onWriteParam} />
      )}
      {widget.kind === "fader" && (
        <FaderWidget widget={widget} interactive={!editing} onWriteParam={onWriteParam} />
      )}
      {widget.kind === "button" && (
        <ButtonWidget widget={widget} interactive={!editing} onWriteParam={onWriteParam} />
      )}
      {widget.kind === "meter" && <MeterWidget widget={widget} />}

      {/* Edit-mode overlays */}
      {editing && (
        <>
          {/* Delete button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-error/80 border border-white/20 flex items-center justify-center text-white hover:bg-error transition-colors z-10 cursor-pointer"
          >
            <Icon d={ICON_CLOSE} size={8} />
          </button>

          {/* Bind button when unbound */}
          {!isBound && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onBind();
              }}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full mt-1 px-1.5 py-0.5 bg-surface border border-white/10 rounded text-[8px] font-black uppercase tracking-widest text-modifier hover:text-text-primary flex items-center gap-1 cursor-pointer whitespace-nowrap z-10 shadow-[-1px_-1px_4px_rgba(255,255,255,0.04),1px_1px_4px_rgba(0,0,0,0.35)]"
            >
              <Icon d={ICON_LINK} size={8} />
              Bind
            </button>
          )}

          {/* Unbound placeholder overlay */}
          {!isBound && (
            <div className="absolute inset-0 bg-black/30 rounded flex items-center justify-center pointer-events-none">
              <span className={`text-[8px] font-black uppercase ${colorText} opacity-60`}>
                {widget.kind}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Add palette ──

const WIDGET_KINDS: { kind: WidgetKind; label: string; color: string }[] = [
  { kind: "knob", label: "Knob", color: "text-generator" },
  { kind: "fader", label: "Fader", color: "text-modifier" },
  { kind: "button", label: "Button", color: "text-logic" },
  { kind: "meter", label: "Meter", color: "text-generator" },
];

interface AddPaletteProps {
  onAdd: (kind: WidgetKind) => void;
  onClose: () => void;
}

function AddPalette({ onAdd, onClose }: AddPaletteProps) {
  return (
    <div className="absolute top-10 left-1/2 -translate-x-1/2 z-30 bg-panel border border-white/10 rounded-lg shadow-[-4px_-4px_16px_rgba(255,255,255,0.03),4px_4px_16px_rgba(0,0,0,0.5)] flex gap-1 p-2">
      {WIDGET_KINDS.map(({ kind, label, color }) => (
        <button
          key={kind}
          type="button"
          onClick={() => {
            onAdd(kind);
            onClose();
          }}
          className={`px-3 py-1.5 rounded bg-surface border border-white/5 text-[10px] font-black uppercase tracking-widest ${color} hover:bg-elevated shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)] active:translate-y-px transition-all cursor-pointer`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── DashboardBuilder ──

export function DashboardBuilder() {
  const widgets = useDashboardStore((s) => s.widgets);
  const editing = useDashboardStore((s) => s.editing);
  const selectedId = useDashboardStore((s) => s.selectedId);
  const addWidget = useDashboardStore((s) => s.addWidget);
  const updateWidget = useDashboardStore((s) => s.updateWidget);
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const setEditing = useDashboardStore((s) => s.setEditing);
  const selectWidget = useDashboardStore((s) => s.selectWidget);
  const clear = useDashboardStore((s) => s.clear);
  const setLocal = useParameterStore((s) => s.setLocal);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [bindWidgetId, setBindWidgetId] = useState<string | null>(null);

  const handleWriteParam = useCallback(
    (nodeId: string, paramIndex: number, normalized: number) => {
      setLocal(nodeId, paramIndex, normalized);
      void nativeSetNodeParameter(nodeId, paramIndex, normalized);
    },
    [setLocal],
  );

  const handleClear = useCallback(() => {
    if (confirmClear) {
      clear();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
    }
  }, [confirmClear, clear]);

  // Reset confirm state when editing turns off
  useEffect(() => {
    if (!editing) setConfirmClear(false);
  }, [editing]);

  const isEmpty = widgets.length === 0;

  return (
    <div className="flex flex-col h-full relative">
      {/* Toolbar */}
      <div className="h-10 flex items-center gap-2 px-4 border-b border-black/20 bg-pressed shrink-0 relative z-20">
        {/* Edit toggle */}
        <button
          type="button"
          onClick={() => {
            setEditing(!editing);
            setPaletteOpen(false);
            setConfirmClear(false);
          }}
          className={[
            "h-6 px-3 rounded border text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all cursor-pointer",
            editing
              ? "bg-surface border-generator/40 text-generator shadow-[0_0_6px_rgba(74,144,217,0.25)]"
              : "bg-surface border-white/5 text-text-secondary hover:text-text-primary shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)]",
          ].join(" ")}
        >
          <Icon d={ICON_EDIT} size={12} />
          Edit Layout
        </button>

        {/* ADD button — only in editing mode */}
        <AnimatePresence>
          {editing && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.12 }}
              className="relative"
            >
              <button
                type="button"
                onClick={() => setPaletteOpen((v) => !v)}
                className="h-6 px-3 rounded border border-white/5 bg-surface text-[10px] font-black uppercase tracking-widest text-text-secondary hover:text-text-primary flex items-center gap-1.5 shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)] active:translate-y-px transition-all cursor-pointer"
              >
                <Icon d={ICON_ADD} size={12} />
                Add
              </button>
              {paletteOpen && (
                <AddPalette
                  onAdd={addWidget}
                  onClose={() => setPaletteOpen(false)}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* CLEAR ALL — only in editing mode and when widgets exist */}
        <AnimatePresence>
          {editing && !isEmpty && (
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              onClick={handleClear}
              className={[
                "h-6 px-3 rounded border text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)] active:translate-y-px transition-all cursor-pointer",
                confirmClear
                  ? "bg-surface border-error/40 text-error"
                  : "bg-surface border-white/5 text-text-secondary hover:text-error",
              ].join(" ")}
            >
              <Icon d={ICON_DELETE} size={12} />
              {confirmClear ? "Confirm Clear" : "Clear All"}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Widget count badge */}
        {widgets.length > 0 && (
          <span className="ml-auto text-[9px] font-bold text-text-secondary uppercase tracking-widest">
            {widgets.length} widget{widgets.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Canvas */}
      <div
        className="flex-1 relative overflow-auto"
        style={{ background: "#1E1E22" }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget && editing) selectWidget(null);
        }}
      >
        {isEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
              No widgets yet
            </span>
            {!editing && (
              <span className="text-[9px] text-text-secondary/60 uppercase tracking-widest">
                Enable Edit Layout to add controls
              </span>
            )}
          </div>
        )}

        {widgets.map((w) => (
          <WidgetShell
            key={w.id}
            widget={w}
            editing={editing}
            selected={selectedId === w.id}
            onSelect={() => selectWidget(w.id)}
            onDelete={() => removeWidget(w.id)}
            onMove={(x, y) => updateWidget(w.id, { x, y })}
            onBind={() => setBindWidgetId(w.id)}
            onWriteParam={handleWriteParam}
          />
        ))}
      </div>

      {/* Bind modal */}
      {bindWidgetId && (
        <BindModal
          widgetId={bindWidgetId}
          onClose={() => setBindWidgetId(null)}
        />
      )}
    </div>
  );
}
