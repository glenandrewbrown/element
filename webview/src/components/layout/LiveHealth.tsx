import {
  usePerformStore,
  selectLiveHealth,
  selectAlerts,
} from "../../stores/usePerformStore";
import { Icon } from "../neu";

// ── Signal type config (locked palette — CLAUDE.md V3.0) ──
// Audio: #4A90D9 ●   MIDI: #2BC4C4 ▲   Value/CV: #E8A838 ◆
const SIG_CONFIG = {
  audio: { hex: "#4A90D9", label: "Audio", shape: "●" },
  midi:  { hex: "#2BC4C4", label: "MIDI",  shape: "▲" },
  value: { hex: "#E8A838", label: "Value", shape: "◆" },
} as const;

type SigType = keyof typeof SIG_CONFIG;

// ── Horizontal VU meter — real bridge data only ──
//
// Honest representation: the bridge currently emits a single aggregate
// output peak (`outputPeak`). We render a precise horizontal fill bar
// rather than the legacy 4-bar LED ladder so the value reads unambiguously.
// Input peak, per-channel L/R, and per-type signal counts are not yet
// available (tracked Q-VU-INPUT); their rows show explicit "no data" labels.

function HorizMeter({
  level,
  color,
}: {
  level: number;
  color: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, level)) * 100);
  return (
    <div
      className="flex-1 h-2 bg-pressed rounded-full overflow-hidden shadow-[inset_2px_2px_4px_rgba(0,0,0,0.4),inset_-1px_-1px_3px_rgba(255,255,255,0.05)]"
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${pct}%`}
    >
      {pct > 0 && (
        <div
          className="h-full rounded-full transition-[width] duration-100"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            boxShadow: `0 0 4px ${color}66`,
          }}
        />
      )}
    </div>
  );
}

// ── I/O signal row ──

interface IORowProps {
  /** Stabletest-id for e2e/storybook assertions. */
  testId: string;
  sigType: SigType;
  direction: "in" | "out" | "io";
  /** Real 0–1 meter value. Provide when bridge data exists. */
  meter?: number;
  /** Honest label when no bridge data is available for this signal path. */
  noData?: string;
}

function IORow({ testId, sigType, direction, meter, noData }: IORowProps) {
  const sig = SIG_CONFIG[sigType];
  const dirArrow =
    direction === "in" ? "←" : direction === "out" ? "→" : "⇄";
  const dirLabel =
    direction === "in" ? "IN" : direction === "out" ? "OUT" : "I/O";

  return (
    <div
      className="flex items-center gap-2 h-6"
      data-testid={testId}
      aria-label={`${sig.label} ${dirLabel}`}
    >
      {/* Shape = taxonomy signal-type marker (● ▲ ◆) */}
      <span
        className="text-[9px] font-bold shrink-0 w-3 text-center leading-none"
        style={{ color: sig.hex }}
        data-testid={`signal-type-${sigType}`}
        aria-hidden="true"
      >
        {sig.shape}
      </span>
      {/* Signal label */}
      <span
        className="text-text-secondary w-9 shrink-0 font-medium select-none"
        style={{ fontSize: "var(--text-xs, 10px)" }}
      >
        {sig.label}
      </span>
      {/* Direction indicator */}
      <span
        className="text-text-dim w-8 shrink-0 tabular select-none"
        style={{ fontSize: "9px" }}
        aria-hidden="true"
      >
        {dirArrow} {dirLabel}
      </span>
      {/* Live meter OR honest no-data text */}
      {typeof meter === "number" ? (
        <HorizMeter level={meter} color={sig.hex} />
      ) : (
        <span
          className="flex-1 text-text-dim italic truncate"
          style={{ fontSize: "9px" }}
          data-testid={`${testId}-nodata`}
        >
          {noData ?? "—"}
        </span>
      )}
    </div>
  );
}

/**
 * Perform-mode engine vitals panel — G-08 redesign.
 *
 * Shows per-signal-type I/O rows (Audio / MIDI / Value) with direction
 * indicators (IN / OUT / I/O) and honest data sourcing:
 *   • Audio OUT — live VU bar from bridge `outputPeak` (real).
 *   • Audio IN  — "awaiting bridge" label (Q-VU-INPUT not yet wired).
 *   • MIDI I/O  — "—" (no signal counts from bridge today).
 *   • Value I/O — "—" (no signal counts from bridge today).
 *
 * When `buffer === 0` (engine not started / no device) the I/O section shows
 * an explicit "Engine idle" state rather than flat meters, so the user can
 * distinguish "running and silent" from "not running".
 *
 * CPU, buffer, latency, BPM, and sample-rate are shown below the I/O section.
 * Warning/critical alerts appear inline at the bottom.
 */
export function LiveHealth() {
  const health = usePerformStore(selectLiveHealth);
  const alerts = usePerformStore(selectAlerts);

  // buffer === 0 → no audio device active / engine not started.
  // Distinct from outputPeak === 0 (running but silent).
  const isIdle = health.buffer === 0;

  // CPU colour ramp: teal (safe) → orange (caution) → red (critical)
  const cpuColor =
    health.cpu > 85 ? "#E05555" : health.cpu > 60 ? "#E8A838" : "#2BC4C4";

  const metrics = [
    { label: "Buffer",  value: health.buffer  ? `${health.buffer} smp` : "—" },
    { label: "Latency", value: health.latency ? `${health.latency} ms` : "—" },
    { label: "BPM",     value: health.bpm     ? String(Math.round(health.bpm)) : "—" },
    { label: "Rate",    value: health.sampleRateLabel || "—" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between border-b border-white/5 bg-surface shrink-0 px-3"
        style={{ minHeight: "var(--control-h-md, 28px)" }}
      >
        <span
          className="font-bold text-text-primary uppercase tracking-widest"
          style={{ fontSize: "var(--text-sm, 11px)" }}
        >
          Live Health
        </span>
        <Icon
          name="HeartPulse"
          size={15}
          className={isIdle ? "text-text-dim" : "text-accent-teal"}
          aria-label={isIdle ? "Engine idle" : "Engine running"}
        />
      </div>

      {/* ── Scrollable body ── */}
      <div
        className="flex-1 overflow-y-auto flex flex-col"
        style={{ padding: "var(--space-3, 12px)", gap: "var(--space-4, 16px)" }}
      >
        {/* ── I/O Activity ── */}
        <section aria-label="I/O activity">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="Activity" size={12} className="text-text-dim" aria-hidden />
            <span
              className="text-text-dim uppercase tracking-widest font-bold"
              style={{ fontSize: "9px" }}
            >
              I/O Activity
            </span>
          </div>

          {isIdle ? (
            /* Explicit no-data state when engine is not running */
            <div
              className="flex items-center gap-3 px-3 py-2.5 bg-pressed rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]"
              data-testid="io-engine-idle"
            >
              <Icon
                name="Power"
                size={14}
                className="text-text-dim shrink-0"
                aria-hidden
              />
              <div>
                <div
                  className="text-text-secondary font-semibold"
                  style={{ fontSize: "var(--text-sm, 11px)" }}
                >
                  Engine idle
                </div>
                <div
                  className="text-text-dim"
                  style={{ fontSize: "var(--text-xs, 10px)" }}
                >
                  No audio device active
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col bg-pressed rounded shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)] px-3 py-1.5">
              {/* Audio OUT — real bridge `outputPeak` */}
              <IORow
                testId="io-row-audio-out"
                sigType="audio"
                direction="out"
                meter={health.outputPeak}
              />
              {/* Audio IN — no bridge yet (Q-VU-INPUT) */}
              <IORow
                testId="io-row-audio-in"
                sigType="audio"
                direction="in"
                noData="awaiting bridge"
              />
              {/* MIDI I/O — no numeric data from bridge */}
              <IORow
                testId="io-row-midi"
                sigType="midi"
                direction="io"
                noData="—"
              />
              {/* Value/CV I/O — no numeric data from bridge */}
              <IORow
                testId="io-row-value"
                sigType="value"
                direction="io"
                noData="—"
              />
            </div>
          )}
        </section>

        {/* ── CPU Load ── */}
        <section aria-label="CPU load">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <Icon name="Cpu" size={12} className="text-text-dim" aria-hidden />
              <span
                className="text-text-dim uppercase tracking-widest font-bold"
                style={{ fontSize: "9px" }}
              >
                CPU
              </span>
            </div>
            <span
              className="font-bold tabular"
              style={{ fontSize: "var(--text-sm, 11px)", color: cpuColor }}
              data-testid="cpu-pct"
            >
              {health.cpu}%
            </span>
          </div>
          <div className="h-2.5 bg-pressed rounded-full overflow-hidden shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${health.cpu}%`,
                backgroundColor: cpuColor,
                boxShadow: `0 0 6px ${cpuColor}44`,
              }}
            />
          </div>
        </section>

        {/* ── Engine metrics ── */}
        <section className="grid grid-cols-2 gap-2" aria-label="Engine metrics">
          {metrics.map(({ label, value }) => (
            <div
              key={label}
              className="p-2 bg-surface border border-white/5 rounded shadow-[-2px_-2px_6px_rgba(255,255,255,0.03),2px_2px_8px_rgba(0,0,0,0.35)]"
            >
              <div
                className="text-text-dim uppercase tracking-wider mb-0.5"
                style={{ fontSize: "9px" }}
              >
                {label}
              </div>
              <div
                className="font-bold text-text-primary tabular"
                style={{ fontSize: "var(--text-sm, 11px)" }}
              >
                {value}
              </div>
            </div>
          ))}
        </section>

        {/* ── Alerts ── */}
        {alerts.length > 0 && (
          <section className="flex flex-col gap-2" aria-label="Alerts">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="p-3 bg-[#3d2600]/30 border border-[#c08512]/30 rounded flex items-start gap-3"
                role="alert"
              >
                <Icon
                  name="TriangleAlert"
                  size={16}
                  className="text-accent-orange shrink-0 mt-0.5"
                  aria-hidden
                />
                <div className="flex flex-col gap-0.5">
                  <span
                    className="font-bold text-accent-orange"
                    style={{ fontSize: "var(--text-xs, 10px)" }}
                  >
                    {alert.title}
                  </span>
                  <span
                    className="text-accent-orange/80"
                    style={{ fontSize: "9px" }}
                  >
                    {alert.message}
                  </span>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
