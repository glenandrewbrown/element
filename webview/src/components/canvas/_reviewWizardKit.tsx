/**
 * _reviewWizardKit.tsx — shared helpers for review wizard stories.
 * ADHD-optimised: TLDR-first, read-aloud, interactive state demos.
 * Owned by review wizard stories only — not a production component.
 */
import { useCallback, useEffect, useRef, useState } from "react";

// ── Annotation model ──────────────────────────────────────────────────────────
// Coords stored in BOTH absolute px and PERCENT of the specimen pane so an agent
// can reconstruct WHERE Glen meant regardless of pane size.
export type AnnTool = "pin" | "rect" | "pen";
export interface AnnPoint { x: number; y: number; xPct: number; yPct: number }
export interface Annotation {
  n: number;
  tool: AnnTool;
  note: string;
  point?: AnnPoint;
  rect?: AnnPoint & { w: number; h: number; wPct: number; hPct: number };
  points?: AnnPoint[];
}

// ── Draft persistence ─────────────────────────────────────────────────────────
// HMR-/refresh-/restart-proof. Persists { text, severity } per (storyTitle,stepKey)
// AND the current step index per story, all to localStorage. Restored on mount,
// the step's draft is cleared only on a successful submit of that step.
const DRAFT_NS = "review-draft";

interface StepDraft { text: string; severity: string }

function draftKey(storyTitle: string, stepKey: string): string {
  return `${DRAFT_NS}:${storyTitle}:${stepKey}`;
}
function stepIndexKey(storyTitle: string): string {
  return `${DRAFT_NS}:${storyTitle}:__step`;
}

function lsGet(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string): void {
  try { window.localStorage.setItem(key, val); } catch { /* quota / private */ }
}
function lsDel(key: string): void {
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}

/** Read a saved {text,severity} draft for one step (empty if none). */
export function readStepDraft(
  storyTitle: string,
  stepKey: string,
  fallbackSeverity: string,
): StepDraft {
  const raw = lsGet(draftKey(storyTitle, stepKey));
  if (raw) {
    try {
      const d = JSON.parse(raw);
      return {
        text: typeof d.text === "string" ? d.text : "",
        severity: typeof d.severity === "string" ? d.severity : fallbackSeverity,
      };
    } catch { /* fall through */ }
  }
  return { text: "", severity: fallbackSeverity };
}

/** Persisted current-step index for a story (clamped by caller). */
export function readStepIndex(storyTitle: string): number {
  const raw = lsGet(stepIndexKey(storyTitle));
  const n = raw == null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
export function writeStepIndex(storyTitle: string, i: number): void {
  lsSet(stepIndexKey(storyTitle), String(i));
}

/**
 * Per-step draft state with localStorage persistence on EVERY change.
 * Returns the live values + setters + a clear() to call after a successful
 * submit of that step. `savedTick` increments whenever a write lands, so the
 * caller can flash a "draft saved ✓" indicator.
 */
export function useStepDraft(
  storyTitle: string,
  stepKey: string,
  fallbackSeverity: string,
) {
  const initial = readStepDraft(storyTitle, stepKey, fallbackSeverity);
  const [text, setTextState] = useState(initial.text);
  const [severity, setSeverityState] = useState(initial.severity);
  const [annotations, setAnnotationsState] = useState<Annotation[]>([]);
  const [savedTick, setSavedTick] = useState(0);

  // Latest values mirrored into a ref so any one setter can persist the full
  // {text, severity, annotations} snapshot without re-reading React state.
  const snap = useRef({ text: initial.text, severity: initial.severity, annotations: [] as Annotation[] });
  const annKey = draftKey(storyTitle, stepKey) + ":ann";

  // Re-hydrate whenever the step changes (caller also remounts via React key).
  useEffect(() => {
    const d = readStepDraft(storyTitle, stepKey, fallbackSeverity);
    let anns: Annotation[] = [];
    const aRaw = lsGet(draftKey(storyTitle, stepKey) + ":ann");
    if (aRaw) { try { anns = JSON.parse(aRaw) as Annotation[]; } catch { anns = []; } }
    snap.current = { text: d.text, severity: d.severity, annotations: anns };
    setTextState(d.text);
    setSeverityState(d.severity);
    setAnnotationsState(anns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyTitle, stepKey]);

  const persist = useCallback(() => {
    const { text: t, severity: sev, annotations: anns } = snap.current;
    lsSet(draftKey(storyTitle, stepKey), JSON.stringify({ text: t, severity: sev }));
    if (anns.length) lsSet(annKey, JSON.stringify(anns));
    else lsDel(annKey);
    setSavedTick((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyTitle, stepKey]);

  const setText = useCallback((t: string) => {
    snap.current.text = t;
    setTextState(t);
    persist();
  }, [persist]);

  const setSeverity = useCallback((sev: string) => {
    snap.current.severity = sev;
    setSeverityState(sev);
    persist();
  }, [persist]);

  const setAnnotations = useCallback((updater: Annotation[] | ((prev: Annotation[]) => Annotation[])) => {
    const next = typeof updater === "function"
      ? (updater as (p: Annotation[]) => Annotation[])(snap.current.annotations)
      : updater;
    snap.current.annotations = next;
    setAnnotationsState(next);
    persist();
  }, [persist]);

  const clear = useCallback(() => {
    lsDel(draftKey(storyTitle, stepKey));
    lsDel(annKey);
    snap.current = { text: "", severity: fallbackSeverity, annotations: [] };
    setTextState("");
    setSeverityState(fallbackSeverity);
    setAnnotationsState([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyTitle, stepKey, fallbackSeverity]);

  return { text, setText, severity, setSeverity, annotations, setAnnotations, clear, savedTick };
}

// ── Draft-saved indicator ─────────────────────────────────────────────────────
/** Tiny "draft saved ✓" that flashes whenever `tick` increments. */
export function DraftSavedIndicator({ tick }: { tick: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (tick === 0) return;
    setShow(true);
    const id = setTimeout(() => setShow(false), 1400);
    return () => clearTimeout(id);
  }, [tick]);
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: "#34D399",
        opacity: show ? 1 : 0.25,
        transition: "opacity 0.3s",
        whiteSpace: "nowrap",
      }}
      title="Your draft is auto-saved to this browser on every keystroke — refreshes and HMR won't lose it."
    >
      {show ? "draft saved ✓" : "auto-saving ✓"}
    </span>
  );
}

// ── Annotation overlay ────────────────────────────────────────────────────────
const AMBER = "#E8A838";

interface AnnotationOverlayProps {
  annotations: Annotation[];
  onChange: (updater: (prev: Annotation[]) => Annotation[]) => void;
}

/**
 * Absolute-positioned overlay drawn ON TOP of the specimen pane (iframe or live
 * component). Parent must be position:relative. When `mode` is off the overlay
 * is pointer-events:none so the specimen stays interactive; toggling Annotate on
 * captures pointer events for drawing. Marks render in amber, crisp on dark UI.
 */
export function AnnotationOverlay({ annotations, onChange }: AnnotationOverlayProps) {
  const [mode, setMode] = useState(false);
  const [tool, setTool] = useState<AnnTool>("pin");
  const hostRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x0: number; y0: number; pts: { x: number; y: number }[] } | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [penDraft, setPenDraft] = useState<{ x: number; y: number }[] | null>(null);

  const rectOf = () => hostRef.current?.getBoundingClientRect() ?? null;
  const pct = (px: number, total: number) => (total > 0 ? (px / total) * 100 : 0);
  const nextN = () => (annotations.reduce((m, a) => Math.max(m, a.n), 0) + 1);

  const local = (e: React.PointerEvent) => {
    const r = rectOf();
    if (!r) return { x: 0, y: 0 };
    return { x: Math.max(0, Math.min(r.width, e.clientX - r.left)), y: Math.max(0, Math.min(r.height, e.clientY - r.top)) };
  };

  function promptNote(prefix: string): string | null {
    // window.prompt works fine in the Storybook (browser) context; this overlay
    // is dev-only review tooling, never shipped in the JUCE webview.
    const v = window.prompt(prefix);
    if (v == null) return null;
    return v;
  }

  const onDown = (e: React.PointerEvent) => {
    if (!mode) return;
    e.preventDefault();
    const p = local(e);
    const r = rectOf();
    if (!r) return;
    if (tool === "pin") {
      const note = promptNote(`Pin ${nextN()} note (WHAT do you mean here?):`);
      if (note == null) return;
      onChange((prev) => [
        ...prev,
        { n: nextN(), tool: "pin", note, point: { x: Math.round(p.x), y: Math.round(p.y), xPct: +pct(p.x, r.width).toFixed(2), yPct: +pct(p.y, r.height).toFixed(2) } },
      ]);
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x0: p.x, y0: p.y, pts: [p] };
    if (tool === "rect") setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
    else setPenDraft([p]);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!mode || !drag.current) return;
    const p = local(e);
    if (tool === "rect") {
      const d = drag.current;
      setDraft({ x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), w: Math.abs(p.x - d.x0), h: Math.abs(p.y - d.y0) });
    } else if (tool === "pen") {
      drag.current.pts.push(p);
      setPenDraft([...drag.current.pts]);
    }
  };

  const onUp = () => {
    if (!mode || !drag.current) return;
    const r = rectOf();
    const d = drag.current;
    drag.current = null;
    if (!r) { setDraft(null); setPenDraft(null); return; }
    if (tool === "rect" && draft && (draft.w > 3 || draft.h > 3)) {
      const note = promptNote(`Box ${nextN()} note (WHAT is wrong here?):`);
      setDraft(null);
      if (note == null) return;
      onChange((prev) => [
        ...prev,
        {
          n: nextN(), tool: "rect", note,
          rect: {
            x: Math.round(draft.x), y: Math.round(draft.y), w: Math.round(draft.w), h: Math.round(draft.h),
            xPct: +pct(draft.x, r.width).toFixed(2), yPct: +pct(draft.y, r.height).toFixed(2),
            wPct: +pct(draft.w, r.width).toFixed(2), hPct: +pct(draft.h, r.height).toFixed(2),
          },
        },
      ]);
    } else if (tool === "pen" && d.pts.length > 1) {
      const note = promptNote(`Stroke ${nextN()} note (optional — what does this mark?):`) ?? "";
      setPenDraft(null);
      const points: AnnPoint[] = d.pts.map((pt) => ({
        x: Math.round(pt.x), y: Math.round(pt.y),
        xPct: +pct(pt.x, r.width).toFixed(2), yPct: +pct(pt.y, r.height).toFixed(2),
      }));
      onChange((prev) => [...prev, { n: nextN(), tool: "pen", note, points }]);
    } else {
      setDraft(null);
      setPenDraft(null);
    }
  };

  const undo = () => onChange((prev) => prev.slice(0, -1));
  const clearAll = () => onChange(() => []);

  const polyline = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <>
      {/* Toolbar — sits above the pane, always interactive */}
      <div
        style={{
          position: "absolute", top: 6, left: 6, zIndex: 30,
          display: "flex", alignItems: "center", gap: 4,
          background: "rgba(18,18,20,0.92)", border: "1px solid #2E2E33",
          borderRadius: 6, padding: "3px 5px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
        }}
      >
        <button
          onClick={() => setMode((v) => !v)}
          title={mode ? "Exit annotate mode (specimen interactive again)" : "Annotate the specimen"}
          style={{
            background: mode ? AMBER : "#222226",
            color: mode ? "#1A1A1E" : "#C7C7CF",
            border: `1px solid ${mode ? AMBER : "#34343A"}`,
            borderRadius: 4, fontSize: 11, fontWeight: 700, padding: "3px 8px", cursor: "pointer",
          }}
        >
          ✏️ {mode ? "Annotating" : "Annotate"}
        </button>
        {mode && (["pin", "rect", "pen"] as AnnTool[]).map((t) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            title={t === "pin" ? "Drop a numbered pin" : t === "rect" ? "Drag a numbered box" : "Freehand pen"}
            style={{
              background: tool === t ? "#3A2A10" : "#222226",
              color: tool === t ? AMBER : "#8E8E93",
              border: `1px solid ${tool === t ? AMBER : "#34343A"}`,
              borderRadius: 4, fontSize: 11, fontWeight: 700, padding: "3px 7px", cursor: "pointer",
            }}
          >
            {t === "pin" ? "📍 Pin" : t === "rect" ? "▭ Box" : "✎ Pen"}
          </button>
        ))}
        {mode && annotations.length > 0 && (
          <>
            <button onClick={undo} title="Undo last annotation" style={miniBtn}>↶ Undo</button>
            <button onClick={clearAll} title="Clear all annotations" style={miniBtn}>✕ Clear</button>
          </>
        )}
        {annotations.length > 0 && (
          <span style={{ fontSize: 10, color: AMBER, fontWeight: 700, marginLeft: 2 }}>
            {annotations.length} mark{annotations.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Drawing surface */}
      <div
        ref={hostRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        style={{
          position: "absolute", inset: 0, zIndex: 20,
          pointerEvents: mode ? "auto" : "none",
          cursor: mode ? (tool === "pin" ? "crosshair" : "crosshair") : "default",
        }}
      >
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
          {annotations.map((a) => {
            if (a.tool === "pin" && a.point) {
              return (
                <g key={a.n}>
                  <circle cx={a.point.x} cy={a.point.y} r={9} fill={AMBER} stroke="#1A1A1E" strokeWidth={1.5} />
                  <text x={a.point.x} y={a.point.y + 3.5} textAnchor="middle" fontSize={10} fontWeight={800} fill="#1A1A1E">{a.n}</text>
                </g>
              );
            }
            if (a.tool === "rect" && a.rect) {
              return (
                <g key={a.n}>
                  <rect x={a.rect.x} y={a.rect.y} width={a.rect.w} height={a.rect.h} fill="rgba(232,168,56,0.10)" stroke={AMBER} strokeWidth={1.5} rx={3} />
                  <circle cx={a.rect.x} cy={a.rect.y} r={8} fill={AMBER} stroke="#1A1A1E" strokeWidth={1.5} />
                  <text x={a.rect.x} y={a.rect.y + 3} textAnchor="middle" fontSize={9} fontWeight={800} fill="#1A1A1E">{a.n}</text>
                </g>
              );
            }
            if (a.tool === "pen" && a.points && a.points.length > 1) {
              return (
                <g key={a.n}>
                  <polyline points={polyline(a.points)} fill="none" stroke={AMBER} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  <circle cx={a.points[0].x} cy={a.points[0].y} r={8} fill={AMBER} stroke="#1A1A1E" strokeWidth={1.5} />
                  <text x={a.points[0].x} y={a.points[0].y + 3} textAnchor="middle" fontSize={9} fontWeight={800} fill="#1A1A1E">{a.n}</text>
                </g>
              );
            }
            return null;
          })}
          {/* live drafts */}
          {draft && <rect x={draft.x} y={draft.y} width={draft.w} height={draft.h} fill="rgba(232,168,56,0.10)" stroke={AMBER} strokeWidth={1.5} strokeDasharray="4 3" rx={3} />}
          {penDraft && penDraft.length > 1 && <polyline points={polyline(penDraft)} fill="none" stroke={AMBER} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        </svg>
      </div>
    </>
  );
}

const miniBtn: React.CSSProperties = {
  background: "#222226", color: "#8E8E93", border: "1px solid #34343A",
  borderRadius: 4, fontSize: 10, fontWeight: 700, padding: "3px 6px", cursor: "pointer",
};

// ── Speech hook ───────────────────────────────────────────────────────────────
export function useSpeech() {
  const available =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const cancel = useCallback(() => {
    if (!available) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    utterRef.current = null;
  }, [available]);

  // Cancel on unmount
  useEffect(() => () => { if (available) window.speechSynthesis.cancel(); }, [available]);

  const speak = useCallback(
    (lines: string[]) => {
      if (!available) return;
      if (speaking) { cancel(); return; }
      const text = lines.join(". ");
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.onend = () => { setSpeaking(false); utterRef.current = null; };
      u.onerror = () => { setSpeaking(false); utterRef.current = null; };
      utterRef.current = u;
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    },
    [available, speaking, cancel],
  );

  return { available, speaking, speak, cancel };
}

// ── TLDR block ────────────────────────────────────────────────────────────────
interface TldrBlockProps {
  bullets: string[];
  judge: string[];
  speaking: boolean;
  available: boolean;
  onReadAloud: () => void;
  /** Optional interactive demo rendered below bullets */
  demo?: React.ReactNode;
}

export function TldrBlock({
  bullets,
  judge,
  speaking,
  available,
  onReadAloud,
  demo,
}: TldrBlockProps) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      {/* ⚡ TLDR header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.1em",
            color: "#F5C542",
          }}
        >
          ⚡ TLDR
        </span>
        {available && (
          <button
            title={speaking ? "Stop reading" : "Read aloud"}
            onClick={onReadAloud}
            style={{
              background: speaking ? "#3A2A10" : "#222226",
              border: `1px solid ${speaking ? "#F5C542" : "#34343A"}`,
              borderRadius: 4,
              color: speaking ? "#F5C542" : "#8E8E93",
              fontSize: 11,
              padding: "2px 7px",
              cursor: "pointer",
              lineHeight: 1.4,
              transition: "all 0.15s",
            }}
          >
            {speaking ? "🔊 Stop" : "🔊 Read"}
          </button>
        )}
      </div>

      {/* Bullets */}
      <ul style={{ margin: 0, paddingLeft: 16, marginBottom: demo ? 10 : 0 }}>
        {bullets.map((b, n) => (
          <li
            key={n}
            style={{
              color: "#E5E5EA",
              fontSize: 12,
              lineHeight: 1.55,
              marginBottom: 3,
              fontWeight: 500,
            }}
          >
            {b}
          </li>
        ))}
      </ul>

      {/* Interactive demo slot */}
      {demo && <div style={{ marginTop: 6 }}>{demo}</div>}

      {/* Collapsible details */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: "none",
          border: "none",
          color: "#6E6E73",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          cursor: "pointer",
          padding: "4px 0 0",
          textTransform: "uppercase",
        }}
      >
        <span style={{ fontSize: 9 }}>{open ? "▾" : "▸"}</span>
        {open ? "HIDE DETAILS" : "SHOW DETAILS"}
      </button>
      {open && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid #2A2A2E",
          }}
        >
          {/* JUDGE THIS — always shown in details when expanded */}
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.1em",
              color: "#4A90D9",
              marginBottom: 5,
            }}
          >
            JUDGE THIS
          </div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {judge.map((c, n) => (
              <li
                key={n}
                style={{
                  color: "#C7C7CF",
                  fontSize: 12,
                  lineHeight: 1.5,
                  marginBottom: 4,
                }}
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── S1 — 3-state interactive toggle row ──────────────────────────────────────
type BlockState = "idle" | "hover" | "selected";

const STATE_LABELS: { key: BlockState; label: string; color: string }[] = [
  { key: "idle",     label: "Idle",     color: "#8E8E93" },
  { key: "hover",    label: "Hover",    color: "#E8A838" },
  { key: "selected", label: "Selected", color: "#4A90D9" },
];

/** Mini live specimen that cycles idle / hover / selected visually. */
function MiniContainerSpecimen({ state }: { state: BlockState }) {
  const ring =
    state === "selected"
      ? "1.5px solid #4A90D9"
      : state === "hover"
      ? "1.5px solid rgba(255,255,255,0.12)"
      : "1.5px solid transparent";
  const boxShadow =
    state === "selected"
      ? "0 0 8px rgba(74,144,217,0.35), 4px 4px 8px rgba(0,0,0,0.4), -2px -2px 5px rgba(255,255,255,0.04)"
      : state === "hover"
      ? "4px 4px 10px rgba(0,0,0,0.45), -2px -2px 6px rgba(255,255,255,0.05)"
      : "3px 3px 7px rgba(0,0,0,0.4), -2px -2px 5px rgba(255,255,255,0.04)";
  const cableOpacity = state === "hover" || state === "selected" ? 0.85 : 0.3;
  const hintOpacity  = state === "hover" ? 1 : 0;

  return (
    <div
      style={{
        width: 140,
        borderRadius: 8,
        background: "#252529",
        border: ring,
        boxShadow,
        overflow: "hidden",
        transition: "all 0.2s",
        position: "relative",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 8px",
          borderBottom: "1px solid #2A2A2E",
          background: "#2A2A2E",
        }}
      >
        <span style={{ color: "#4A90D9", fontSize: 12 }}>⊞</span>
        <span style={{ color: "#E5E5EA", fontSize: 11, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Synth Chain
        </span>
        <span style={{ fontSize: 9, background: "#1A1A1E", color: "#8E8E93", borderRadius: 3, padding: "1px 4px" }}>
          Container
        </span>
      </div>

      {/* Mini-graph thumbnail */}
      <div style={{ height: 58, background: "#1E1E22", position: "relative", overflow: "hidden", padding: "6px 8px" }}>
        {/* mini nodes */}
        {[
          { x: 6,  y: 12, c: "#4A90D9" },
          { x: 44, y: 6,  c: "#E8A838" },
          { x: 44, y: 28, c: "#E8A838" },
          { x: 82, y: 18, c: "#4A90D9" },
        ].map((n, k) => (
          <div
            key={k}
            style={{
              position: "absolute",
              left: n.x,
              top: n.y,
              width: 22,
              height: 14,
              borderRadius: 3,
              background: "#252529",
              border: `1px solid ${n.c}40`,
              boxShadow: `0 0 4px ${n.c}20`,
            }}
          />
        ))}
        {/* cables */}
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: cableOpacity, transition: "opacity 0.2s" }}
          viewBox="0 0 114 58"
        >
          <path d="M28 19 C36 19, 36 13, 44 13" stroke="#4A90D9" strokeWidth="1.2" fill="none" />
          <path d="M28 19 C36 19, 36 35, 44 35" stroke="#E8A838" strokeWidth="1.2" fill="none" />
          <path d="M66 13 C74 13, 74 25, 82 25" stroke="#4A90D9" strokeWidth="1.2" fill="none" />
          <path d="M66 35 C74 35, 74 25, 82 25" stroke="#E8A838" strokeWidth="1.2" fill="none" />
        </svg>
        {/* hover hint */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: hintOpacity,
            transition: "opacity 0.2s",
            fontSize: 9,
            color: "#E5E5EA",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontWeight: 700,
            background: "rgba(30,30,34,0.55)",
          }}
        >
          double-click to enter
        </div>
      </div>

      {/* Footer stats */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "4px 8px",
          borderTop: "1px solid #2A2A2E",
          fontSize: 9,
          color: "#6E6E73",
        }}
      >
        <span>4 blocks</span>
        <span>·</span>
        <span>5 cables</span>
        <span style={{ marginLeft: "auto" }}>2→2 ●</span>
      </div>
    </div>
  );
}

export function S1StateToggle() {
  const [active, setActive] = useState<BlockState>("idle");
  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 5,
          marginBottom: 8,
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 10, color: "#6E6E73", fontWeight: 700, marginRight: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Try:
        </span>
        {STATE_LABELS.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            style={{
              background: active === key ? "#2A2A2E" : "#1E1E22",
              border: `1px solid ${active === key ? color : "#34343A"}`,
              borderRadius: 5,
              color: active === key ? color : "#8E8E93",
              fontSize: 11,
              fontWeight: active === key ? 700 : 500,
              padding: "3px 9px",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <MiniContainerSpecimen state={active} />
    </div>
  );
}

// ── S8 — Activity hint live animation toggle ──────────────────────────────────
const S8_KEYFRAMES = `
@keyframes rw-cable-drift {
  to { stroke-dashoffset: -24; }
}
@keyframes rw-led-pulse {
  0%,100% { opacity: 0.6; box-shadow: 0 0 4px #4A90D9; }
  50%      { opacity: 1;   box-shadow: 0 0 10px #4A90D9, 0 0 18px rgba(74,144,217,0.4); }
}
@keyframes rw-border-pulse {
  0%,100% { box-shadow: 3px 3px 7px rgba(0,0,0,0.4), -2px -2px 5px rgba(255,255,255,0.04), 0 0 0px rgba(74,144,217,0); }
  50%      { box-shadow: 3px 3px 7px rgba(0,0,0,0.4), -2px -2px 5px rgba(255,255,255,0.04), 0 0 14px rgba(74,144,217,0.35); }
}
`;

// Inject once
let s8StyleInjected = false;
function injectS8Styles() {
  if (s8StyleInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.textContent = S8_KEYFRAMES;
  document.head.appendChild(el);
  s8StyleInjected = true;
}

export function S8ActivityDemo() {
  const [animating, setAnimating] = useState(false);
  injectS8Styles();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: "#6E6E73", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Motion:
        </span>
        <button
          onClick={() => setAnimating((v) => !v)}
          style={{
            background: animating ? "#1A2A1A" : "#1E1E22",
            border: `1px solid ${animating ? "#34D399" : "#34343A"}`,
            borderRadius: 5,
            color: animating ? "#34D399" : "#8E8E93",
            fontSize: 11,
            fontWeight: animating ? 700 : 500,
            padding: "3px 9px",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {animating ? "▶ Animate ON" : "◼ Animate OFF"}
        </button>
        <span style={{ fontSize: 10, color: "#555" }}>
          {animating ? "cable drift + LED pulse + border pulse" : "static"}
        </span>
      </div>

      {/* Live specimen */}
      <div
        style={{
          width: 150,
          borderRadius: 8,
          background: "#252529",
          border: "1.5px solid #2A2A2E",
          overflow: "hidden",
          animation: animating ? "rw-border-pulse 2s ease-in-out infinite" : "none",
          transition: "animation 0.3s",
        }}
      >
        {/* Header with LED */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 8px",
            borderBottom: "1px solid #2A2A2E",
            background: "#2A2A2E",
          }}
        >
          <span style={{ color: "#4A90D9", fontSize: 12 }}>⊞</span>
          <span style={{ color: "#E5E5EA", fontSize: 11, fontWeight: 600, flex: 1 }}>
            Drums Chain
          </span>
          {/* LED */}
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#4A90D9",
              animation: animating ? "rw-led-pulse 1s ease-in-out infinite" : "none",
            }}
          />
          {/* 4-bar VU strip */}
          <div style={{ display: "flex", gap: 1.5, alignItems: "flex-end" }}>
            {[10, 16, 12, 8].map((h, k) => (
              <div
                key={k}
                style={{
                  width: 3,
                  height: h,
                  borderRadius: 1,
                  background: k < 2 ? "#34D399" : k < 3 ? "#F5C542" : "#E74C3C",
                  transform: animating ? "none" : `scaleY(${3 / h})`,
                  transformOrigin: "bottom",
                  transition: animating ? "none" : "transform 0.3s",
                  animation: animating
                    ? `rw-led-pulse ${0.8 + k * 0.15}s ease-in-out infinite alternate`
                    : "none",
                }}
              />
            ))}
          </div>
        </div>

        {/* Animated cable mini-graph */}
        <div style={{ height: 58, background: "#1E1E22", position: "relative", overflow: "hidden" }}>
          <svg
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            viewBox="0 0 150 58"
          >
            {[
              { d: "M30 20 C50 20, 70 15, 90 15", color: "#4A90D9" },
              { d: "M30 38 C50 38, 70 42, 90 42", color: "#E8A838" },
              { d: "M90 15 C110 15, 120 28, 130 28", color: "#4A90D9" },
            ].map((cable, k) => (
              <path
                key={k}
                d={cable.d}
                stroke={cable.color}
                strokeWidth="1.5"
                fill="none"
                strokeDasharray={animating ? "6 4" : "none"}
                style={
                  animating
                    ? {
                        animation: `rw-cable-drift ${1.2 + k * 0.2}s linear infinite`,
                        strokeDashoffset: 0,
                      }
                    : undefined
                }
              />
            ))}
          </svg>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "4px 8px",
            borderTop: "1px solid #2A2A2E",
            fontSize: 9,
            color: "#6E6E73",
          }}
        >
          <span>3 blocks</span>
          <span>·</span>
          <span style={{ color: animating ? "#34D399" : "#6E6E73" }}>
            {animating ? "▶ active" : "● idle"}
          </span>
        </div>
      </div>
    </div>
  );
}
