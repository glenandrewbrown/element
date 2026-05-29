import { useCallback, useRef, useState } from "react";
import {
  nativeVirtualKeyboardNoteOn,
  nativeVirtualKeyboardNoteOff,
} from "../../bridge/nativeKeyboard";

// ── Piano layout helpers ──────────────────────────────────────────────────────

/** White-key MIDI offsets within an octave (C=0 … B=11, skipping sharps). */
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B

/**
 * Black-key positions: offset within octave → column slot (gap-index between
 * white keys, 0-based).  -1 means no black key to the right of that white key.
 */
const BLACK_RIGHT_OF: Record<number, number> = {
  0: 0, // C# right of C (slot 0)
  2: 1, // D# right of D (slot 1)
  // E has no sharp (slot 2 skipped)
  5: 3, // F# right of F (slot 3)
  7: 4, // G# right of G (slot 4)
  9: 5, // A# right of A (slot 5)
  // B has no sharp
};

/** Number of white keys in one octave. */
const WHITES_PER_OCT = 7;

/** Start / end MIDI note (C3 = 48 … B4 = 71 → 2 full octaves = 24 keys). */
const START_NOTE = 48; // C3
const END_NOTE = 71; // B4
const OCTAVE_COUNT = 2;
const TOTAL_WHITES = OCTAVE_COUNT * WHITES_PER_OCT;

// ── Sub-components ────────────────────────────────────────────────────────────

function WhiteKey({
  note,
  active,
  onPress,
  onRelease,
}: {
  note: number;
  active: boolean;
  onPress: (n: number) => void;
  onRelease: (n: number) => void;
}) {
  const octaveOffset = note % 12;
  const noteName = ["C", null, "D", null, "E", "F", null, "G", null, "A", null, "B"][octaveOffset] as string;
  const isC = octaveOffset === 0;

  return (
    <button
      type="button"
      aria-label={`Note ${note}`}
      onMouseDown={() => onPress(note)}
      onMouseUp={() => onRelease(note)}
      onMouseLeave={() => onRelease(note)}
      className={[
        "relative select-none rounded-b-md border border-white/10 transition-all",
        "flex flex-col items-center justify-end pb-1",
        "h-full w-full",
        active
          ? // pressed: inset shadow (neumorphic pressed state)
            "bg-[#c8c8d0] shadow-[inset_2px_2px_6px_rgba(0,0,0,0.35),inset_-1px_-1px_3px_rgba(255,255,255,0.1)]"
          : // raised: neumorphic extruded from surface
            "bg-[#dcdce4] shadow-[2px_4px_8px_rgba(0,0,0,0.45),-1px_-1px_4px_rgba(255,255,255,0.08)] hover:bg-[#e4e4ec]",
      ].join(" ")}
    >
      {isC && (
        <span className="text-[8px] font-bold text-black/40 uppercase select-none">
          {noteName}
          {Math.floor(note / 12) - 1}
        </span>
      )}
    </button>
  );
}

function BlackKey({
  note,
  active,
  onPress,
  onRelease,
}: {
  note: number;
  active: boolean;
  onPress: (n: number) => void;
  onRelease: (n: number) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Note ${note}`}
      onMouseDown={(e) => {
        e.stopPropagation();
        onPress(note);
      }}
      onMouseUp={(e) => {
        e.stopPropagation();
        onRelease(note);
      }}
      onMouseLeave={() => onRelease(note)}
      className={[
        "absolute top-0 select-none z-10 rounded-b-sm border border-white/5",
        "w-[55%] h-[62%]",
        active
          ? "bg-[#1a1a1e] shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)]"
          : "bg-[#252529] shadow-[2px_3px_6px_rgba(0,0,0,0.7),-1px_-1px_2px_rgba(255,255,255,0.04)] hover:bg-[#2a2a2e]",
      ].join(" ")}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface VirtualKeyboardProps {
  /**
   * MIDI channel (1-16) that emitted note-on/note-off messages are sent on.
   * Sets the initial value of the channel selector; the user can change it
   * live. Defaults to 1.
   */
  defaultChannel?: number;
  /**
   * Initial note velocity as a 0-1 fraction (scaled to 0-127 on send). Sets
   * the starting position of the velocity slider, adjustable at play time.
   * Defaults to 0.75.
   */
  defaultVelocity?: number;
}

/**
 * On-screen two-octave (C3-B4) piano for auditioning Blocks without external
 * hardware. Use it in the bottom panel to trigger MIDI note-on/note-off into
 * the active Board — click or drag across keys to play. A channel selector and
 * velocity slider control what each press emits. The note range is fixed; only
 * the initial channel/velocity are configurable.
 */
export function VirtualKeyboard({
  defaultChannel = 1,
  defaultVelocity = 0.75,
}: VirtualKeyboardProps) {
  const [channel, setChannel] = useState(defaultChannel);
  const [velocity, setVelocity] = useState(defaultVelocity);
  const [activeNotes, setActiveNotes] = useState<ReadonlySet<number>>(new Set());
  // Source of truth for dedup. setState updaters must be pure — bridge calls
  // there would double-fire under React StrictMode / concurrent rendering and
  // emit duplicate MIDI noteOn/noteOff messages.
  const activeNotesRef = useRef<Set<number>>(new Set());
  // Track whether mouse button is held so dragging across keys triggers notes.
  const mouseDown = useRef(false);

  const pressNote = useCallback(
    (note: number) => {
      if (activeNotesRef.current.has(note)) return;
      activeNotesRef.current.add(note);
      void nativeVirtualKeyboardNoteOn(note, velocity, channel);
      setActiveNotes(new Set(activeNotesRef.current));
    },
    [velocity, channel],
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

  // Build white-key note list
  const whiteNotes: number[] = [];
  for (let oct = 0; oct < OCTAVE_COUNT; oct++) {
    for (const offset of WHITE_OFFSETS) {
      const note = START_NOTE + oct * 12 + offset;
      if (note <= END_NOTE) whiteNotes.push(note);
    }
  }

  // Build black-key note list with their left-offset in white-key units
  interface BlackKeyEntry {
    note: number;
    whiteIndex: number; // index into whiteNotes (the white key to the left)
  }
  const blackKeys: BlackKeyEntry[] = [];
  for (let i = 0; i < whiteNotes.length; i++) {
    const wNote = whiteNotes[i];
    const octaveOffset = wNote % 12;
    if (octaveOffset in BLACK_RIGHT_OF) {
      const sharpNote = wNote + 1;
      if (sharpNote >= START_NOTE && sharpNote <= END_NOTE + 1)
        blackKeys.push({ note: sharpNote, whiteIndex: i });
    }
  }

  return (
    <div
      className="flex flex-col gap-2 px-3 py-2 bg-panel border-t border-white/5"
      onMouseDown={() => {
        mouseDown.current = true;
      }}
      onMouseUp={() => {
        mouseDown.current = false;
      }}
    >
      {/* Controls row */}
      <div className="flex items-center gap-4 text-[10px] text-text-secondary uppercase tracking-wider">
        <span className="font-bold text-text-primary">Virtual Keyboard</span>

        <label className="flex items-center gap-1.5">
          Ch
          <select
            value={channel}
            onChange={(e) => setChannel(Number(e.target.value))}
            className="bg-pressed text-text-primary rounded px-1 py-0.5 border border-white/10 text-[10px]"
          >
            {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
              <option key={ch} value={ch}>
                {ch}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          Vel
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={velocity}
            onChange={(e) => setVelocity(Number(e.target.value))}
            className="w-20 accent-modifier"
          />
          <span className="w-7 text-right tabular">
            {Math.round(velocity * 127)}
          </span>
        </label>

        {activeNotes.size > 0 && (
          <span className="text-logic font-bold">
            {activeNotes.size} note{activeNotes.size > 1 ? "s" : ""} held
          </span>
        )}
      </div>

      {/* Piano keyboard */}
      <div
        className="relative select-none"
        style={{ height: 72 }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* White keys grid */}
        <div
          className="flex h-full gap-px"
          style={{ width: TOTAL_WHITES * 28 }}
        >
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

        {/* Black keys — absolutely positioned over the white key grid */}
        {blackKeys.map(({ note, whiteIndex }) => {
          // Each white key slot is 28px + 1px gap.
          const slotWidth = 29;
          // Center the black key over the gap between whiteIndex and whiteIndex+1
          const leftPx = whiteIndex * slotWidth + slotWidth * 0.68;
          return (
            <div
              key={note}
              className="absolute top-0"
              style={{ left: leftPx, width: 16 }}
            >
              <BlackKey
                note={note}
                active={activeNotes.has(note)}
                onPress={pressNote}
                onRelease={releaseNote}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
