/**
 * TransformFace — the PRIMARY on-block control face for Element's "Transform"
 * MIDI-FX archetype (the pizmidi-native family). It renders DIRECTLY on the
 * canvas Block face (no editor window) and ADAPTS to whichever Transform node
 * mounted it, reading engine truth from `d.inlineParams`:
 *
 *   • element.midiTranspose   → 1 param  (semitones, −48..48)
 *       → a single centred "hero" dial with a wide RAW readout ("+5 st").
 *   • element.midiVelocityAmp → 2 params (scale 0..2, power 0.25..4)
 *       → two compact dials sharing a divided console row ("1.00×" each).
 *
 * The component is the SAME for both — the layout keys off the param count, so a
 * 1-control node is a deliberate hero (never a 2-slot grid with an empty hole)
 * and a 2-control node is a balanced pair. If `d.inlineParams` is empty/undefined
 * it renders NOTHING (honest — the engine exposes no controls, so we fake none).
 *
 * Writes go straight to the engine in RAW units via `nativeNodeSetParam`; the
 * engine clamps. Live values flow back through the 60Hz snapshot (`d.inlineParams`),
 * so this face holds no value state of its own beyond each dial's drag-optimism.
 *
 * Design tools that shaped this: ui-ux-pro-max (density + 1-vs-2 hierarchy,
 * 90–150ms micro-motion, colour-never-the-only-signal), neumorphism-generator /
 * lib/neu.ts (every shadow), uiverse-galaxy (the pressed-well + raised-cap idiom),
 * reactbits (mount fade + settle pulse — compositor-only, reduced-motion-gated).
 */
import type { BlockData, InlineParamRow } from "../../../../data/types";
import { nativeNodeSetParam } from "../../../../bridge/nativeGraph";
import { TransformDial } from "./TransformDial";

/** MIDI Effects signal accent (teal). */
const TEAL = "#2BC4C4";

/**
 * Scoped motion + state styling for the Transform faces. Injected once per mount
 * (cheap, idempotent in practice — identical text de-dupes in the style cache).
 * All animation is compositor-only (opacity/transform) and fully disabled under
 * prefers-reduced-motion, per the locked motion law.
 */
const FACE_CSS = `
.transform-face-root { animation: tf-mount 180ms cubic-bezier(0.16,1,0.3,1) both; }
.transform-dial-mount { animation: tf-rise 200ms cubic-bezier(0.16,1,0.3,1) both; }
@keyframes tf-mount { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
@keyframes tf-rise  { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
/* Settle flash — a brief teal lift on the readout the moment a value commits.
   Lives on a key-remounted <output>, so it replays per commit without a JS timer. */
.transform-dial-readout { animation: tf-flash 320ms ease-out 1; }
@keyframes tf-flash {
  0%   { box-shadow: inset 3px 3px 6px rgba(0,0,0,0.45), inset -3px -3px 6px rgba(255,255,255,0.05), 0 0 0 0 ${TEAL}00; }
  35%  { box-shadow: inset 3px 3px 6px rgba(0,0,0,0.45), inset -3px -3px 6px rgba(255,255,255,0.05), 0 0 5px 0 ${TEAL}59; }
  100% { box-shadow: inset 3px 3px 6px rgba(0,0,0,0.45), inset -3px -3px 6px rgba(255,255,255,0.05), 0 0 0 0 ${TEAL}00; }
}
@media (prefers-reduced-motion: reduce) {
  .transform-face-root, .transform-dial-mount, .transform-dial-readout { animation: none !important; }
}
`;

interface TransformFaceProps {
  d: BlockData;
}

export function TransformFace({ d }: TransformFaceProps) {
  const params: InlineParamRow[] = d.inlineParams ?? [];
  // Honest empty: the engine exposes no inline controls → render nothing.
  if (params.length === 0) return null;

  const write = (key: string, raw: number) => {
    void nativeNodeSetParam(d.id, key, raw);
  };

  const single = params.length === 1;
  // 1 control → md hero; 2+ → sm pair (keeps the block face compact + balanced).
  const dialSize = single ? "md" : "sm";

  return (
    <div
      className="transform-face-root flex w-full min-w-0 justify-center"
      data-testid="transform-face"
      style={{
        gap: single ? 0 : 12,
        padding: "2px 2px 1px",
        // Subtle divider between paired dials → reads as a console, not a grid.
        ...(single ? {} : {}),
      }}
    >
      <style>{FACE_CSS}</style>
      {params.map((row, i) => (
        <div
          key={row.key}
          className="flex items-center"
          style={
            !single && i > 0
              ? {
                  // Hairline pressed divider in the chassis between the two dials.
                  paddingLeft: 12,
                  marginLeft: 0,
                  borderLeft: "1px solid rgba(0,0,0,0.35)",
                  boxShadow: "-1px 0 0 rgba(255,255,255,0.03)",
                }
              : undefined
          }
        >
          <TransformDial nodeId={d.id} row={row} size={dialSize} onWrite={write} />
        </div>
      ))}
    </div>
  );
}
