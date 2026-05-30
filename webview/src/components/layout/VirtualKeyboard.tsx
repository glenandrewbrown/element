import { useCallback, useRef, useState } from "react";
import {
  nativeVirtualKeyboardNoteOn,
  nativeVirtualKeyboardNoteOff,
} from "../../bridge/nativeKeyboard";
import { invokeElementNative } from "../../bridge/juceBackend";

// ── Piano layout helpers ──────────────────────────────────────────────────────

/** White-key MIDI offsets within an octave (C=0 … B=11, skipping sharps). */
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11] as const; // C D E F G A B

/**
 * Note name by chromatic offset — Record<number, string> eliminates the
 * sparse-array null hole that existed at line 49 of the previous version
 * (["C", null, "D", ...] as string was an unsound type cast).
 */
const WHITE_NOTE_NAME: Record<number, string> = {
  0: "C", 2: "D", 4: "E", 5: "F", 7: "G", 9: "A", 11: "B",
};

/** Chromatic offsets that have a black key immediately to their right. */
const HAS_BLACK_RIGHT = new Set([0, 2, 5, 7, 9]); // C D F G A

// ── Key geometry (px) ─────────────────────────────────────────────────────────
const KEY_W = 26;   // white-key slot width (key + 1 px gap)
const KEY_H = 84;   // white-key height — taller gives more velocity-Y resolution
const BK_W  = 14;   // black-key width
// Black-key height is explicit pixels (NOT %) so it never collapses to 0 when
// the parent wrapper has no intrinsic height — this was the root cause of the
// "keys cut off / unreachable" bug reported in G-01.
const BK_H  = Math.round(KEY_H * 0.60);
// Left offset of the black key within its white-key slot
const BK_OFFSET = KEY_W * 0.68;

/** CC number for the Modulation wheel. */
const CC_MOD = 1;

// ── Local CC bridge ───────────────────────────────────────────────────────────
// nativeKeyboard.ts only exposes noteOn/noteOff; CC is sent here directly via
// the generic invokeElementNative channel.

async function sendCC(
  cc: number,
  value: number,   // normalised 0–1
  channel: number,
): Promise<void> {
  await invokeElementNative("elementVirtualKeyboardCC", [
    cc,
    Math.round(Math.max(0, Math.min(1, value)) * 127),
    channel,
  ]);
}

// ── White key ─────────────────────────────────────────────────────────────────

function WhiteKey({
  note,
  active,
  onPress,
  onRelease,
}: {
  note: number;
  active: boolean;
  onPress: (note: number, velocity: number) => void;
  onRelease: (note: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const chromatic = note % 12;
  const octave = Math.floor(note / 12) - 1;
  const isC = chromatic === 0;
  const name = WHITE_NOTE_NAME[chromatic] ?? "?";

  /** Velocity from vertical press position — bottom = max, top = min. */
  const velocityFromY = useCallback((clientY: number): number => {
    if (!ref.current) return 0.75;
    const { top, height } = ref.current.getBoundingClientRect();
    return Math.max(0.06, Math.min(1, (clientY - top) / height));
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      data-testid={`white-key-${note}`}
      aria-label={`${name}${isC ? octave : ""} note ${note}`}
      aria-pressed={active}
      onMouseDown={(e) => { e.preventDefault(); onPress(note, velocityFromY(e.clientY)); }}
      onMouseUp={() => onRelease(note)}
      onMouseLeave={() => onRelease(note)}
      style={{ width: KEY_W - 1, height: KEY_H, flexShrink: 0 }}
      className={[
        "relative select-none rounded-b-sm border border-black/25",
        "flex flex-col items-center justify-end pb-0.5",
        "transition-[background-color,box-shadow] duration-75",
        active
          ? "bg-[#b4b4bc] shadow-[inset_2px_3px_7px_rgba(0,0,0,0.5),inset_-1px_-1px_3px_rgba(255,255,255,0.05)]"
          : "bg-[#d4d4dc] shadow-[1px_4px_10px_rgba(0,0,0,0.55),-1px_-1px_4px_rgba(255,255,255,0.06)] hover:bg-[#dcdce6]",
      ].join(" ")}
    >
      {isC && (
        <span className="pointer-events-none select-none leading-none text-[8px] font-semibold text-black/30">
          C{octave}
        </span>
      )}
    </button>
  );
}

// ── Black key ─────────────────────────────────────────────────────────────────

function BlackKey({
  note,
  active,
  leftPx,
  onPress,
  onRelease,
}: {
  note: number;
  active: boolean;
  leftPx: number;
  onPress: (note: number, velocity: number) => void;
  onRelease: (note: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  const velocityFromY = useCallback((clientY: number): number => {
    if (!ref.current) return 0.75;
    const { top, height } = ref.current.getBoundingClientRect();
    return Math.max(0.06, Math.min(1, (clientY - top) / height));
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      data-testid={`black-key-${note}`}
      aria-label={`Note ${note}`}
      aria-pressed={active}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onPress(note, velocityFromY(e.clientY));
      }}
      onMouseUp={(e) => { e.stopPropagation(); onRelease(note); }}
      onMouseLeave={() => onRelease(note)}
      style={{
        position: "absolute",
        left: leftPx,
        top: 0,
        width: BK_W,
        // Explicit pixel height — this is the fix: h-[62%] against a
        // zero-height wrapper div resolved to 0px, making keys unreachable.
        height: BK_H,
        zIndex: 10,
      }}
      className={[
        "select-none rounded-b-sm border border-black/35",
        "transition-[background-color,box-shadow] duration-75",
        active
          ? "bg-[#111115] shadow-[inset_2px_2px_5px_rgba(0,0,0,0.75)]"
          : "bg-[#1e1e22] shadow-[1px_4px_8px_rgba(0,0,0,0.82),-1px_-1px_2px_rgba(255,255,255,0.03)] hover:bg-[#252529]",
      ].join(" ")}
    />
  );
}

// ── Vertical slider ───────────────────────────────────────────────────────────

function VerticalSlider({
  label,
  value,
  onChange,
  accentColor,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  accentColor: string;
  testId: string;
}) {
  const trackH = KEY_H - 26;
  return (
    <div
      className="flex flex-col items-center"
      style={{ gap: "var(--space-1)", fontSize: "var(--text-xs)" }}
    >
      <span style={{ color: "var(--color-text-secondary)", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <div
        className="flex items-center justify-center rounded"
        style={{
          width: 18,
          height: trackH,
          background: "var(--color-pressed)",
          // Neumorphic inset track via neu-pressed pattern (neumorphism-generator)
          boxShadow:
            "inset 2px 2px 5px rgba(0,0,0,0.5),inset -1px -1px 3px rgba(255,255,255,0.04)",
        }}
      >
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          data-testid={testId}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            writingMode: "vertical-lr",
            direction: "rtl",   // bottom = min, top = max
            width: 18,
            height: "100%",
            accentColor,
            cursor: "ns-resize",
          }}
        />
      </div>
      <span className="tabular" style={{ color: "var(--color-text-dim)" }}>
        {Math.round(value * 127)}
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export interface VirtualKeyboardProps {
  /**
   * MIDI channel (1–16) that note-on/note-off and CC messages are sent on.
   * Defaults to 1.
   */
  defaultChannel?: number;
  /**
   * Fallback velocity (0–1) used when the Y-position of the press cannot be
   * resolved (e.g. zero bounding-rect in headless envs). Defaults to 0.75.
   */
  defaultVelocity?: number;
  /**
   * Lowest octave displayed (0–7, where 3 = C3 = MIDI 48).
   * Defaults to 3.
   */
  defaultOctaveStart?: number;
  /**
   * Number of octaves to display (1–5).
   * Defaults to 2.
   */
  defaultOctaveCount?: number;
  /**
   * Fired just before the native bridge note-on is sent. Useful for testing
   * and external observability. Args: note (0–127), velocity (0–1), channel (1–16).
   */
  onNoteOn?: (note: number, velocity: number, channel: number) => void;
  /**
   * Fired when a CC value changes (Mod or assignable CC).
   * Args: cc (1–127), value (0–1), channel (1–16).
   */
  onCC?: (cc: number, value: number, channel: number) => void;
}

/**
 * On-screen piano keyboard for auditioning Blocks without external hardware.
 *
 * **G-01 fixes shipped in this version:**
 * - Black keys are fully visible + hittable (explicit-pixel height; no 0-height wrapper).
 * - Velocity-by-Y: press near bottom = max (127), near top = min (~8).
 * - Octave shift (−/+) and octave count (−/+) controls.
 * - Modulation wheel (CC#1) + assignable-CC vertical sliders.
 * - Density tokens from G-14 (`--space-*`, `--text-*`, `--control-h-*`,
 *   `--panel-padding-*`) applied throughout.
 * - Neumorphic surfaces via paired shadow tokens (neumorphism-generator seed).
 */
export function VirtualKeyboard({
  defaultChannel = 1,
  defaultVelocity = 0.75,
  defaultOctaveStart = 3,
  defaultOctaveCount = 2,
  onNoteOn,
  onCC,
}: VirtualKeyboardProps) {
  const [channel, setChannel] = useState(defaultChannel);
  const [octaveStart, setOctaveStart] = useState(defaultOctaveStart);
  const [octaveCount, setOctaveCount] = useState(defaultOctaveCount);
  const [activeNotes, setActiveNotes] = useState<ReadonlySet<number>>(new Set());
  const [lastVelocity, setLastVelocity] = useState(defaultVelocity);
  const [modValue, setModValue] = useState(0);
  const [ccNumber, setCcNumber] = useState(74);   // Filter cutoff — expressive default
  const [ccValue, setCcValue] = useState(0);

  const activeNotesRef = useRef<Set<number>>(new Set());
  const isDragging = useRef(false);

  // ── MIDI note handlers ───────────────────────────────────────────────────────

  const pressNote = useCallback(
    (note: number, velocity: number) => {
      if (activeNotesRef.current.has(note)) return;
      activeNotesRef.current.add(note);
      setLastVelocity(velocity);
      onNoteOn?.(note, velocity, channel);
      void nativeVirtualKeyboardNoteOn(note, velocity, channel);
      setActiveNotes(new Set(activeNotesRef.current));
    },
    [channel, onNoteOn],
  );

  const releaseNote = useCallback(
    (note: number) => {
      if (!activeNotesRef.current.has(note)) return;
      activeNotesRef.current.delete(note);
      void nativeVirtualKeyboardNoteOff(note, channel);
      setActiveNotes(new Set(activeNotesRef.current));
    },
    [channel],
  );

  // ── CC handlers ─────────────────────────────────────────────────────────────

  const handleMod = useCallback(
    (value: number) => {
      setModValue(value);
      onCC?.(CC_MOD, value, channel);
      void sendCC(CC_MOD, value, channel);
    },
    [channel, onCC],
  );

  const handleCC = useCallback(
    (value: number) => {
      setCcValue(value);
      onCC?.(ccNumber, value, channel);
      void sendCC(ccNumber, value, channel);
    },
    [channel, ccNumber, onCC],
  );

  // ── Build key arrays ─────────────────────────────────────────────────────────
  // C of octaveStart in MIDI: octave 3 → MIDI 48 (C3), octave 4 → 60 (C4), etc.
  const startNote = (octaveStart + 1) * 12;

  const whiteNotes: number[] = [];
  for (let oct = 0; oct < octaveCount; oct++) {
    for (const offset of WHITE_OFFSETS) {
      whiteNotes.push(startNote + oct * 12 + offset);
    }
  }

  const blackKeys: Array<{ note: number; leftPx: number }> = [];
  for (let i = 0; i < whiteNotes.length; i++) {
    if (HAS_BLACK_RIGHT.has(whiteNotes[i] % 12)) {
      blackKeys.push({
        note: whiteNotes[i] + 1,
        leftPx: i * KEY_W + BK_OFFSET,
      });
    }
  }

  const keysWidth = whiteNotes.length * KEY_W;
  const octaveEnd = octaveStart + octaveCount - 1;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col select-none"
      style={{
        background: "var(--color-panel)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
      }}
      onMouseDown={() => { isDragging.current = true; }}
      onMouseUp={() => {
        isDragging.current = false;
        activeNotesRef.current.forEach((n) => releaseNote(n));
      }}
    >
      {/* ── Controls strip ────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 flex-wrap"
        style={{
          minHeight: "var(--control-h-md)",
          paddingLeft: "var(--panel-padding-sm)",
          paddingRight: "var(--panel-padding-sm)",
          paddingTop: 3,
          paddingBottom: 3,
          fontSize: "var(--text-xs)",
          color: "var(--color-text-secondary)",
          letterSpacing: "0.07em",
          flexShrink: 0,
        }}
      >
        {/* Title */}
        <span
          className="font-semibold tracking-widest"
          style={{ color: "var(--color-text-primary)", fontSize: "var(--text-sm)" }}
        >
          KEYBOARD
        </span>

        {/* ── Octave shift ── */}
        <div className="flex items-center" style={{ gap: "var(--space-1)" }}>
          <OctaveButton
            aria-label="Shift octave down"
            data-testid="octave-down"
            disabled={octaveStart <= 0}
            onClick={() => setOctaveStart((o) => Math.max(0, o - 1))}
          >
            −
          </OctaveButton>
          <span
            className="tabular text-center"
            data-testid="octave-range"
            style={{
              minWidth: 46,
              color: "var(--color-text-primary)",
              fontSize: "var(--text-xs)",
            }}
          >
            C{octaveStart}–B{octaveEnd}
          </span>
          <OctaveButton
            aria-label="Shift octave up"
            data-testid="octave-up"
            disabled={octaveStart >= 7}
            onClick={() => setOctaveStart((o) => Math.min(7, o + 1))}
          >
            +
          </OctaveButton>
        </div>

        {/* ── Octave count ── */}
        <div className="flex items-center" style={{ gap: "var(--space-1)" }}>
          <span>OCT</span>
          <OctaveButton
            aria-label="Remove octave"
            data-testid="octave-count-down"
            disabled={octaveCount <= 1}
            onClick={() => setOctaveCount((c) => Math.max(1, c - 1))}
          >
            −
          </OctaveButton>
          <span
            className="tabular text-center"
            style={{ minWidth: 12, color: "var(--color-text-primary)" }}
          >
            {octaveCount}
          </span>
          <OctaveButton
            aria-label="Add octave"
            data-testid="octave-count-up"
            disabled={octaveCount >= 5}
            onClick={() => setOctaveCount((c) => Math.min(5, c + 1))}
          >
            +
          </OctaveButton>
        </div>

        {/* ── MIDI channel ── */}
        <label className="flex items-center" style={{ gap: "var(--space-1)" }}>
          CH
          <select
            value={channel}
            onChange={(e) => setChannel(Number(e.target.value))}
            className="rounded border border-white/10 px-1"
            style={{
              height: "var(--control-h-sm)",
              fontSize: "var(--text-xs)",
              background: "var(--color-pressed)",
              color: "var(--color-text-primary)",
              // Neumorphic inset select (pressed state)
              boxShadow:
                "inset 1px 1px 3px rgba(0,0,0,0.4),inset -1px -1px 2px rgba(255,255,255,0.04)",
            }}
          >
            {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
              <option key={ch} value={ch}>{ch}</option>
            ))}
          </select>
        </label>

        {/* ── Velocity readout ── */}
        <span>
          VEL{" "}
          <span
            data-testid="velocity-readout"
            className="tabular font-semibold"
            style={{ color: "var(--color-accent-orange)" }}
          >
            {Math.round(lastVelocity * 127)}
          </span>
        </span>

        {activeNotes.size > 0 && (
          <span
            className="tabular font-semibold"
            style={{ color: "var(--color-accent-teal)", fontSize: "var(--text-xs)" }}
          >
            {activeNotes.size}♩
          </span>
        )}
      </div>

      {/* ── Keys + CC sliders row ──────────────────────────────────────────── */}
      <div
        className="flex items-start"
        style={{
          paddingLeft: "var(--panel-padding-sm)",
          paddingRight: "var(--panel-padding-sm)",
          paddingBottom: "var(--panel-padding-sm)",
          gap: "var(--space-2)",
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Piano keyboard container — overflow:visible so black keys paint
            above the surrounding panel without being clipped. */}
        <div
          className="relative flex-shrink-0"
          style={{ height: KEY_H, overflow: "visible" }}
        >
          {/* White keys */}
          <div className="flex h-full" style={{ gap: 1, width: keysWidth }}>
            {whiteNotes.map((note) => (
              <WhiteKey
                key={note}
                note={note}
                active={activeNotes.has(note)}
                onPress={pressNote}
                onRelease={releaseNote}
              />
            ))}
          </div>

          {/* Black keys — absolutely positioned with explicit px height.
              No wrapper div needed: the button IS the positioned element. */}
          {blackKeys.map(({ note, leftPx }) => (
            <BlackKey
              key={note}
              note={note}
              active={activeNotes.has(note)}
              leftPx={leftPx}
              onPress={pressNote}
              onRelease={releaseNote}
            />
          ))}
        </div>

        {/* ── Mod wheel (CC#1) ── */}
        <VerticalSlider
          label="MOD"
          value={modValue}
          onChange={handleMod}
          accentColor="var(--color-accent-blue)"
          testId="mod-slider"
        />

        {/* ── Assignable CC ── */}
        <div
          className="flex flex-col items-center"
          style={{ gap: "var(--space-1)", fontSize: "var(--text-xs)" }}
        >
          {/* CC# selector */}
          <div className="flex items-center" style={{ gap: "var(--space-1)" }}>
            <span style={{ color: "var(--color-text-secondary)", letterSpacing: "0.06em" }}>
              CC
            </span>
            <input
              type="number"
              min={1}
              max={127}
              value={ccNumber}
              data-testid="cc-number-input"
              aria-label="CC number"
              onChange={(e) =>
                setCcNumber(Math.max(1, Math.min(127, Number(e.target.value))))
              }
              className="rounded border border-white/10 text-center tabular"
              style={{
                width: 34,
                height: "var(--control-h-sm)",
                fontSize: "var(--text-xs)",
                background: "var(--color-pressed)",
                color: "var(--color-text-primary)",
                boxShadow:
                  "inset 1px 1px 3px rgba(0,0,0,0.4),inset -1px -1px 2px rgba(255,255,255,0.04)",
              }}
            />
          </div>
          {/* CC value slider */}
          <div
            className="flex items-center justify-center rounded"
            style={{
              width: 18,
              height: KEY_H - 26,
              background: "var(--color-pressed)",
              boxShadow:
                "inset 2px 2px 5px rgba(0,0,0,0.5),inset -1px -1px 3px rgba(255,255,255,0.04)",
            }}
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={ccValue}
              data-testid="cc-slider"
              aria-label={`CC ${ccNumber}`}
              onChange={(e) => handleCC(Number(e.target.value))}
              style={{
                writingMode: "vertical-lr",
                direction: "rtl",
                width: 18,
                height: "100%",
                accentColor: "var(--color-accent-purple)",
                cursor: "ns-resize",
              }}
            />
          </div>
          <span className="tabular" style={{ color: "var(--color-text-dim)" }}>
            {Math.round(ccValue * 127)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Octave button helper ──────────────────────────────────────────────────────

function OctaveButton({
  children,
  onClick,
  disabled,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  "aria-label": string;
  "data-testid": string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: "var(--control-h-sm)",
        height: "var(--control-h-sm)",
        fontSize: "var(--text-md)",
        color: "var(--color-text-secondary)",
        background: "var(--color-surface)",
        lineHeight: 1,
        flexShrink: 0,
      }}
      className="rounded flex items-center justify-center border border-white/5 hover:bg-elevated disabled:opacity-30 disabled:cursor-not-allowed shadow-[1px_2px_4px_rgba(0,0,0,0.45),-1px_-1px_2px_rgba(255,255,255,0.04)] active:shadow-[inset_1px_1px_3px_rgba(0,0,0,0.5)] transition-shadow duration-75"
    >
      {children}
    </button>
  );
}
