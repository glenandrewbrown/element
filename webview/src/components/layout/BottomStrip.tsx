import { useCallback, useEffect, useRef, useState } from "react";
import {
  useEngineSnapshotStore,
  selectTransportPlaying,
  selectTransportRecording,
  selectEngineRunning,
  selectSampleRate,
  selectBufferSize,
  selectDeviceLatencyMs,
  selectCpuPercent,
  selectTimeSig,
} from "../../stores/useEngineSnapshotStore";
import { usePerformStore, selectBpm } from "../../stores/usePerformStore";
import { useGraphStore, selectNodes, selectEdges } from "../../stores/useGraphStore";
import {
  nativeTransportTogglePlay,
  nativeTransportStop,
  nativeTransportRewind,
  nativeTransportSetRecording,
  nativeTransportSetTempo,
} from "../../bridge/nativeGraph";
import { Icon } from "../neu";

/**
 * BottomStrip — the persistent footer status bar (bake-off verdict #22:
 * MERGE 50/50). Takes the mindful-studio mockup's TRANSPORT cluster + dual
 * master METER and houses them on Element's real chassis next to Element's
 * slim status fields (ENGINE / SR / BUF / LAT / CPU / BLOCKS / CABLES).
 *
 * Everything reflects REAL engine data — there is no fabricated motion:
 *  • transport play/stop/record/rewind  → `useEngineSnapshotStore` (read, 4 Hz)
 *    + `nativeTransport*` bridge writes (same path the Toolbar already uses).
 *  • BPM / SIG / TAP                     → perform-store `bpm`, snapshot
 *    `timeSig`, `nativeTransportSetTempo` (rolling 4-tap median, mirrors Toolbar).
 *  • MASTER meter                        → `usePerformStore.liveHealth.outputPeak`
 *    (the host's single aggregate peak from `onMetering`). The host emits ONE
 *    scalar today, so BOTH ladder rows show that same output peak — this is NOT
 *    a fake L/R split (honest until a per-channel bridge lands, Q-VU-LR).
 *  • SR / BUF / LAT / CPU                → `useEngineSnapshotStore` device fields.
 *  • BLOCKS / CABLES                     → `useGraphStore` node/edge counts.
 *  • MINIMAP                             → no strip-scope minimap source exists
 *    (the real minimap lives inside the React Flow provider on the canvas), so
 *    the collapsible slot shows an honest "n/a" placeholder, never a fake map.
 *
 * Styling follows the locked neumorphic grammar (W0-TOKENS) — opaque chassis,
 * raised transport buttons extruded from the surface, pressed wells for the
 * meter track + TAP, faithful digital-VU LED ramp (green→amber→red), and a
 * subtle dopamine hover-glow (semantic-hue) on the transport buttons. No
 * transparency, no canvas-grid bleed-through.
 *
 * NOT mounted into AppShell yet — this is the wizard-reviewable component +
 * story only (integration + the Toolbar→BottomStrip metric migration are
 * separate steps). Designed with horizontal room so those metrics can later
 * migrate here without a re-layout.
 */
export function BottomStrip() {
  // ── Transport (real: read 4 Hz, write via bridge) ──
  const isPlaying = useEngineSnapshotStore(selectTransportPlaying);
  const recording = useEngineSnapshotStore(selectTransportRecording);

  // ── Tempo / signature (real) ──
  const bpm = usePerformStore(selectBpm);
  const timeSig = useEngineSnapshotStore(selectTimeSig);

  // ── Device / engine vitals (real) ──
  const engineRunning = useEngineSnapshotStore(selectEngineRunning);
  const sampleRate = useEngineSnapshotStore(selectSampleRate);
  const bufferSize = useEngineSnapshotStore(selectBufferSize);
  const latencyMs = useEngineSnapshotStore(selectDeviceLatencyMs);
  const cpuPercent = useEngineSnapshotStore(selectCpuPercent);

  // ── Graph topology counts (real) ──
  const blockCount = useGraphStore((s) => selectNodes(s).length);
  const cableCount = useGraphStore((s) => selectEdges(s).length);

  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmInput, setBpmInput] = useState("");
  const [minimapOpen, setMinimapOpen] = useState(false);

  // Tap tempo — rolling 4-tap median, identical maths to the Toolbar so both
  // affordances agree. Resets after 2 s of inactivity. (real → nativeSetTempo)
  const tapTimesRef = useRef<number[]>([]);
  const tapResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = useCallback(() => {
    const now = Date.now();
    const times = tapTimesRef.current;
    times.push(now);
    if (times.length > 4) times.shift();

    if (tapResetTimerRef.current !== null) clearTimeout(tapResetTimerRef.current);
    tapResetTimerRef.current = setTimeout(() => {
      tapTimesRef.current = [];
      tapResetTimerRef.current = null;
    }, 2000);

    if (times.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
      const sorted = [...intervals].sort((a, b) => a - b);
      const median =
        sorted.length % 2 === 1
          ? sorted[(sorted.length - 1) / 2]
          : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      if (median > 0) void nativeTransportSetTempo(Math.min(999, Math.max(20, 60000 / median)));
    }
  }, []);

  useEffect(() => {
    return () => {
      if (tapResetTimerRef.current !== null) clearTimeout(tapResetTimerRef.current);
    };
  }, []);

  const commitBpm = useCallback(() => {
    const parsed = parseFloat(bpmInput);
    if (!Number.isNaN(parsed)) {
      void nativeTransportSetTempo(Math.min(999, Math.max(20, parsed)));
    }
    setEditingBpm(false);
  }, [bpmInput]);

  // F-04 parity: format Hz → compact "44.1k" / "48k" / "96k"; em-dash fallback.
  const sampleRateLabel =
    sampleRate > 0
      ? `${(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1)}k`
      : "—";

  return (
    <div
      className="w-full h-full flex items-stretch select-none bg-panel border-t border-white/5 tabular"
      role="region"
      aria-label="Transport and engine status"
    >
      {/* ── TRANSPORT ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 border-r border-white/5">
        <div className="flex items-center gap-1 px-1 h-8 rounded-[6px] neu-inset bg-pressed">
          <TransportButton
            onClick={() => void nativeTransportRewind()}
            ariaLabel="Rewind to start"
            title="Rewind to start"
            glow="240 4% 60%"
          >
            <Icon name="SkipBack" size={15} aria-hidden />
          </TransportButton>
          <TransportButton
            onClick={() => void nativeTransportTogglePlay()}
            ariaLabel={isPlaying ? "Pause" : "Play"}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            active={isPlaying}
            activeBg="hsl(var(--status-ok))"
            glow="142 69% 58%"
            tint="text-accent-teal"
          >
            <Icon name={isPlaying ? "Pause" : "Play"} size={17} aria-hidden />
          </TransportButton>
          <TransportButton
            onClick={() => void nativeTransportStop()}
            ariaLabel="Stop"
            title="Stop"
            glow="240 4% 60%"
          >
            <Icon name="Square" size={15} aria-hidden />
          </TransportButton>
          <TransportButton
            onClick={() => void nativeTransportSetRecording(!recording)}
            ariaLabel={recording ? "Stop recording" : "Record"}
            title={recording ? "Stop recording" : "Record"}
            active={recording}
            activeBg="hsl(var(--status-clip))"
            glow="358 75% 59%"
            tint="text-error"
            pulseWhenActive
          >
            <Icon name="Circle" size={15} aria-hidden />
          </TransportButton>
        </div>

        {/* BPM (editable + tap) · SIG */}
        <div className="flex items-center gap-2.5 text-text-secondary">
          <Field label="BPM">
            {editingBpm ? (
              <input
                type="number"
                min="20"
                max="999"
                step="0.01"
                autoFocus
                value={bpmInput}
                className="bg-pressed text-text-primary text-[12px] tabular-nums w-[46px] text-center rounded-[3px] neu-inset border-none outline-none focus:ring-1 focus:ring-accent-blue leading-none"
                onChange={(e) => setBpmInput(e.target.value)}
                onBlur={commitBpm}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitBpm();
                  else if (e.key === "Escape") setEditingBpm(false);
                }}
                aria-label="Tempo in BPM"
              />
            ) : (
              <button
                type="button"
                className="text-accent-orange font-black tabular-nums text-[13px] leading-none hover:text-accent-orange/80 transition-colors"
                title="Click to edit tempo"
                onClick={() => {
                  setBpmInput(bpm.toFixed(2));
                  setEditingBpm(true);
                }}
              >
                {bpm.toFixed(1)}
              </button>
            )}
          </Field>
          <Field label="SIG">
            <span className="text-text-primary font-black tabular-nums text-[12px] leading-none">
              {`${timeSig[0]}/${timeSig[1]}`}
            </span>
          </Field>
          <button
            type="button"
            className="px-2 h-[26px] rounded-[4px] text-[9px] font-black uppercase tracking-widest neu-inset bg-pressed text-text-dim hover:text-text-secondary transition-colors"
            title="Tap tempo (rolling 4-tap median)"
            aria-label="Tap tempo"
            onClick={handleTap}
          >
            TAP
          </button>
        </div>
      </div>

      {/* ── MASTER METER ───────────────────────────────────────────────── */}
      <MasterMeter />

      {/* ── ENGINE STATS (Element's slim status fields, REAL data) ──────── */}
      <div className="flex items-center gap-3.5 px-3.5 text-[10px] text-text-secondary border-r border-white/5">
        <Stat
          label="ENGINE"
          icon={
            <span
              className={[
                "w-1.5 h-1.5 rounded-full inline-block",
                engineRunning
                  ? "bg-accent-teal shadow-[0_0_5px_rgba(43,196,196,0.6)]"
                  : "bg-text-dim",
              ].join(" ")}
              aria-hidden
            />
          }
          valueClass={engineRunning ? "text-accent-teal" : "text-text-dim"}
          value={engineRunning ? "OK" : "OFF"}
        />
        <Stat label="SR" value={sampleRateLabel} />
        <Stat label="BUF" value={bufferSize > 0 ? `${bufferSize}` : "—"} />
        <Stat
          label="LAT"
          value={latencyMs > 0 ? `${latencyMs.toFixed(1)}ms` : "—"}
          valueClass="text-accent-teal"
        />
        <Stat
          label="CPU"
          value={`${cpuPercent.toFixed(0)}%`}
          valueClass={
            cpuPercent > 80
              ? "text-error"
              : cpuPercent > 50
                ? "text-accent-orange"
                : "text-accent-teal"
          }
        />
        <Stat label="BLOCKS" value={`${blockCount}`} />
        <Stat label="CABLES" value={`${cableCount}`} />
      </div>

      <div className="flex-1" />

      {/* ── MINIMAP (collapsible) ───────────────────────────────────────
          No strip-scope minimap data source exists — the real minimap lives
          inside the canvas React Flow provider. Rather than fake a map we keep
          the mockup's collapsible affordance and show an honest n/a slot until
          AppShell integration can wire a real viewport snapshot here. */}
      <div className="flex items-center pr-2 pl-1">
        {minimapOpen && (
          <div
            className="mr-1.5 rounded-[4px] neu-inset bg-pressed flex items-center justify-center"
            style={{ width: 156, height: 40 }}
            title="Minimap not available at footer scope yet — wired during AppShell integration"
          >
            <span className="text-[8px] uppercase tracking-widest text-text-dim font-bold">
              minimap n/a
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMinimapOpen((o) => !o)}
          className="w-6 h-10 flex items-center justify-center rounded-[4px] neu-inset bg-pressed text-text-secondary hover:text-text-primary transition-colors"
          title={minimapOpen ? "Hide minimap" : "Show minimap"}
          aria-label={minimapOpen ? "Hide minimap" : "Show minimap"}
          aria-expanded={minimapOpen}
        >
          <Icon name={minimapOpen ? "ChevronRight" : "ChevronLeft"} size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ── Transport button: raised neu chip with a dopamine semantic-hue hover-glow.
//    Never changes size/shape on hover (standing bar) — only shadow + glow. ──
function TransportButton({
  onClick,
  ariaLabel,
  title,
  children,
  active = false,
  activeBg,
  glow,
  tint = "text-text-secondary",
  pulseWhenActive = false,
}: {
  onClick: () => void;
  ariaLabel: string;
  title: string;
  children: React.ReactNode;
  active?: boolean;
  activeBg?: string;
  glow: string; // raw HSL triplet for the hover/active glow
  tint?: string; // idle icon colour (Tailwind class)
  pulseWhenActive?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  const raised =
    "-1.5px -1.5px 4px rgba(255,255,255,0.05), 2px 2px 6px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)";
  const raisedGlow = `${raised}, 0 0 12px 0 hsl(${glow} / 0.45)`;
  const activeShadow = `inset 0 1px 2px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.12), 0 0 14px 0 hsl(${glow} / 0.5)`;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={ariaLabel}
      aria-pressed={active}
      title={title}
      className={[
        "w-7 h-7 flex items-center justify-center rounded-[5px] bg-surface transition-[box-shadow,background,color] duration-200",
        active ? "" : `${tint} hover:text-text-primary`,
        active && pulseWhenActive ? "animate-pulse" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        color: active ? "#15151A" : undefined,
        background: active && activeBg ? activeBg : undefined,
        boxShadow: active ? activeShadow : hovered ? raisedGlow : raised,
      }}
    >
      {children}
    </button>
  );
}

// ── Stacked label/value field (Element's slim status-field grammar) ──
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center leading-none gap-0.5">
      <span className="text-[8px] opacity-40 font-bold uppercase tracking-tight">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}

// ── Inline stat (icon? · label · value) ──
function Stat({
  label,
  value,
  icon,
  valueClass = "text-text-primary",
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="opacity-50 uppercase tracking-wider font-semibold">{label}</span>
      <span className={`${valueClass} font-bold tabular-nums`}>{value}</span>
    </div>
  );
}

/**
 * MASTER meter cluster — dB readout + dual segmented LED ladders.
 *
 * Re-render safety (60 Hz `onMetering` push, session-drift perf plan): the
 * store selector QUANTIZES the 0–1 peak to the meter's discrete lit-segment
 * count and returns that integer. `useSyncExternalStore`'s `Object.is` check
 * then skips a re-render whenever the lit count is unchanged — so a steady or
 * sub-segment-jitter signal does NOT re-render the strip every frame. The peak
 * only re-renders the bar when it actually crosses a segment boundary. The
 * floating dB label subscribes separately (also quantized to 0.1 dB) so the
 * two reads don't widen each other's render scope.
 */
const METER_SEGMENTS = 22;

function MasterMeter() {
  // Quantize to lit-segment count → integer-stable selector (no 60 Hz storm).
  const lit = usePerformStore((s) => {
    const v = s.liveHealth.outputPeak;
    const clamped = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    return Math.round(clamped * METER_SEGMENTS);
  });
  // dB label quantized to 0.1 dB so it only re-renders on a visible change.
  const db = usePerformStore((s) => {
    const v = s.liveHealth.outputPeak;
    const clamped = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    if (clamped <= 0) return -Infinity;
    return Math.round(20 * Math.log10(clamped) * 10) / 10;
  });
  const dbLabel = db === -Infinity ? "-∞" : db.toFixed(1);

  return (
    <div
      className="flex items-center gap-2.5 px-3.5 border-r border-white/5"
      role="meter"
      aria-label="Master output level"
      aria-valuemin={0}
      aria-valuemax={METER_SEGMENTS}
      aria-valuenow={lit}
    >
      <div className="flex flex-col items-end leading-none gap-0.5">
        <span className="text-[8px] opacity-40 font-bold uppercase tracking-tight">MASTER</span>
        <span className="text-[11px] font-mono font-bold tabular-nums text-text-primary leading-none">
          {dbLabel}
        </span>
      </div>
      <div className="flex flex-col gap-[2px] w-[112px]">
        {/* Host emits ONE aggregate peak today; both rows reflect that same
            output level (honest — not a fabricated stereo split). */}
        <LedLadder lit={lit} />
        <LedLadder lit={lit} />
      </div>
    </div>
  );
}

// ── Segmented LED ladder with a faithful digital-VU colour ramp ──
//    green (safe) → amber (top ~5 segs, hot) → red (top 2 segs, clipping). ──
function LedLadder({ lit }: { lit: number }) {
  return (
    <div
      className="flex gap-[1.5px] h-[8px] p-[1.5px] rounded-[2px] bg-canvas"
      style={{ boxShadow: "inset 1px 1px 3px rgba(0,0,0,0.8)" }}
    >
      {Array.from({ length: METER_SEGMENTS }).map((_, i) => {
        const isLit = i < lit;
        // Faithful VU ramp keyed to position, not arbitrary colour.
        const hue =
          i >= METER_SEGMENTS - 2
            ? "var(--status-clip)"
            : i >= METER_SEGMENTS - 5
              ? "var(--status-warn)"
              : "var(--status-ok)";
        return (
          <div
            key={i}
            className="flex-1 rounded-[0.5px]"
            style={{
              background: isLit ? `hsl(${hue})` : "hsl(240 6% 14%)",
              boxShadow: isLit ? `0 0 3px hsl(${hue} / 0.65)` : "none",
            }}
          />
        );
      })}
    </div>
  );
}

export default BottomStrip;
