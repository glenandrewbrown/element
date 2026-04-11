import { useState, useCallback, useRef, useEffect } from "react";
import { NeuButton, NeuToggle } from "../neu";

// ── MIDI note helpers ──

const WHITE_NOTES = [0, 2, 4, 5, 7, 9, 11]; // C, D, E, F, G, A, B in semitones
const BLACK_NOTES = [1, 3, -1, 6, 8, 10, -1]; // C#, D#, skip, F#, G#, A#, skip

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiNoteToName(note: number): string {
  const octave = Math.floor(note / 12) - 1;
  const semitone = note % 12;
  return `${NOTE_NAMES[semitone]}${octave}`;
}

// ── Key component ──

interface KeyProps {
  note: number;
  isBlack: boolean;
  isActive: boolean;
  onNoteOn: (note: number) => void;
  onNoteOff: (note: number) => void;
}

function Key({ note, isBlack, isActive, onNoteOn, onNoteOff }: KeyProps) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onNoteOn(note);
    },
    [note, onNoteOn]
  );

  const handleMouseUp = useCallback(() => {
    onNoteOff(note);
  }, [note, onNoteOff]);

  const handleMouseLeave = useCallback(() => {
    if (isActive) onNoteOff(note);
  }, [note, isActive, onNoteOff]);

  if (isBlack) {
    return (
      <div
        role="button"
        tabIndex={0}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className={[
          "absolute w-6 h-16 -ml-3 z-10 rounded-b transition-all cursor-pointer",
          isActive
            ? "bg-generator shadow-[0_0_8px_rgba(74,144,217,0.6)] translate-y-0.5"
            : "bg-[#1A1A1E] shadow-[2px_2px_6px_rgba(0,0,0,0.5),-1px_-1px_3px_rgba(255,255,255,0.03)] hover:bg-[#252529]",
        ].join(" ")}
        aria-label={midiNoteToName(note)}
      />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      className={[
        "relative w-10 h-24 rounded-b transition-all cursor-pointer flex items-end justify-center pb-1",
        isActive
          ? "bg-generator shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)] translate-y-0.5"
          : "bg-[#E5E5EA] shadow-[2px_2px_6px_rgba(0,0,0,0.3),-1px_-1px_3px_rgba(255,255,255,0.1)] hover:bg-[#D0D0D5]",
      ].join(" ")}
      aria-label={midiNoteToName(note)}
    >
      <span
        className={[
          "text-[8px] font-bold",
          isActive ? "text-white" : "text-[#1A1A1E]/40",
        ].join(" ")}
      >
        {note % 12 === 0 ? midiNoteToName(note) : ""}
      </span>
    </div>
  );
}

// ── Octave component ──

interface OctaveProps {
  baseNote: number;
  activeNotes: Set<number>;
  onNoteOn: (note: number) => void;
  onNoteOff: (note: number) => void;
}

function Octave({ baseNote, activeNotes, onNoteOn, onNoteOff }: OctaveProps) {
  return (
    <div className="relative flex">
      {WHITE_NOTES.map((offset, i) => {
        const note = baseNote + offset;
        const blackNoteOffset = BLACK_NOTES[i];
        const hasBlackKey = blackNoteOffset >= 0;

        return (
          <div key={note} className="relative">
            <Key
              note={note}
              isBlack={false}
              isActive={activeNotes.has(note)}
              onNoteOn={onNoteOn}
              onNoteOff={onNoteOff}
            />
            {hasBlackKey && (
              <div className="absolute top-0 right-0">
                <Key
                  note={baseNote + blackNoteOffset}
                  isBlack={true}
                  isActive={activeNotes.has(baseNote + blackNoteOffset)}
                  onNoteOn={onNoteOn}
                  onNoteOff={onNoteOff}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── VirtualKeyboard component ──

interface VirtualKeyboardProps {
  onClose?: () => void;
}

export function VirtualKeyboard({ onClose }: VirtualKeyboardProps) {
  const [octaveShift, setOctaveShift] = useState(0);
  const [velocity, setVelocity] = useState(100);
  const [sustain, setSustain] = useState(false);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const sustainedNotesRef = useRef<Set<number>>(new Set());

  const baseOctave = 4 + octaveShift;
  const baseNote = baseOctave * 12;

  const sendNoteOn = useCallback(
    (note: number) => {
      // In real implementation, call native bridge:
      // void nativeMidiSendNoteOn(note, velocity);
      console.log(`[v0] Note ON: ${midiNoteToName(note)} vel=${velocity}`);
    },
    [velocity]
  );

  const sendNoteOff = useCallback((note: number) => {
    // In real implementation, call native bridge:
    // void nativeMidiSendNoteOff(note);
    console.log(`[v0] Note OFF: ${midiNoteToName(note)}`);
  }, []);

  const handleNoteOn = useCallback(
    (note: number) => {
      setActiveNotes((prev) => new Set(prev).add(note));
      sendNoteOn(note);
    },
    [sendNoteOn]
  );

  const handleNoteOff = useCallback(
    (note: number) => {
      if (sustain) {
        sustainedNotesRef.current.add(note);
        return;
      }
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
      sendNoteOff(note);
    },
    [sustain, sendNoteOff]
  );

  // Handle sustain toggle
  useEffect(() => {
    if (!sustain && sustainedNotesRef.current.size > 0) {
      sustainedNotesRef.current.forEach((note) => {
        setActiveNotes((prev) => {
          const next = new Set(prev);
          next.delete(note);
          return next;
        });
        sendNoteOff(note);
      });
      sustainedNotesRef.current.clear();
    }
  }, [sustain, sendNoteOff]);

  // Keyboard shortcuts
  useEffect(() => {
    const keyMap: Record<string, number> = {
      a: 0, // C
      w: 1, // C#
      s: 2, // D
      e: 3, // D#
      d: 4, // E
      f: 5, // F
      t: 6, // F#
      g: 7, // G
      y: 8, // G#
      h: 9, // A
      u: 10, // A#
      j: 11, // B
      k: 12, // C (next octave)
      o: 13, // C#
      l: 14, // D
    };

    const pressedKeys = new Set<string>();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || pressedKeys.has(e.key.toLowerCase())) return;
      const offset = keyMap[e.key.toLowerCase()];
      if (offset !== undefined) {
        pressedKeys.add(e.key.toLowerCase());
        handleNoteOn(baseNote + offset);
      }
      if (e.key === "z") setOctaveShift((prev) => Math.max(-3, prev - 1));
      if (e.key === "x") setOctaveShift((prev) => Math.min(3, prev + 1));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      pressedKeys.delete(e.key.toLowerCase());
      const offset = keyMap[e.key.toLowerCase()];
      if (offset !== undefined) {
        handleNoteOff(baseNote + offset);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [baseNote, handleNoteOn, handleNoteOff]);

  return (
    <div className="flex flex-col bg-panel border border-white/5 rounded-lg shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-pressed border-b border-white/5">
        <span className="text-[11px] font-bold text-text-primary uppercase tracking-widest">
          Virtual Keyboard
        </span>
        <div className="flex items-center gap-4">
          {/* Octave controls */}
          <div className="flex items-center gap-2">
            <NeuButton size="sm" onClick={() => setOctaveShift((p) => Math.max(-3, p - 1))}>
              -
            </NeuButton>
            <span className="text-[10px] text-text-secondary tabular w-8 text-center">
              Oct {baseOctave}
            </span>
            <NeuButton size="sm" onClick={() => setOctaveShift((p) => Math.min(3, p + 1))}>
              +
            </NeuButton>
          </div>

          {/* Velocity slider */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-secondary">VEL</span>
            <input
              type="range"
              min={1}
              max={127}
              value={velocity}
              onChange={(e) => setVelocity(Number(e.target.value))}
              className="w-16 h-1.5 rounded-full appearance-none bg-[#131317] accent-generator cursor-pointer"
            />
            <span className="text-[10px] text-text-primary tabular w-6">{velocity}</span>
          </div>

          {/* Sustain toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-secondary">SUSTAIN</span>
            <NeuToggle active={sustain} onChange={setSustain} color="blue" />
          </div>

          {onClose && (
            <NeuButton size="sm" onClick={onClose}>
              Close
            </NeuButton>
          )}
        </div>
      </div>

      {/* Keyboard */}
      <div className="flex px-2 py-3 bg-[#131317] justify-center">
        <Octave
          baseNote={baseNote - 12}
          activeNotes={activeNotes}
          onNoteOn={handleNoteOn}
          onNoteOff={handleNoteOff}
        />
        <Octave
          baseNote={baseNote}
          activeNotes={activeNotes}
          onNoteOn={handleNoteOn}
          onNoteOff={handleNoteOff}
        />
        <Octave
          baseNote={baseNote + 12}
          activeNotes={activeNotes}
          onNoteOn={handleNoteOn}
          onNoteOff={handleNoteOff}
        />
      </div>

      {/* Footer hint */}
      <div className="px-4 py-1.5 bg-pressed border-t border-white/5 text-[9px] text-text-dim text-center">
        Use A-L keys to play. Z/X to shift octave. Hold SPACE for sustain.
      </div>
    </div>
  );
}
