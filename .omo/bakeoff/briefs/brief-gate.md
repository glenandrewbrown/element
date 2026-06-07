# Stitch Brief — Audio Gate / MIDI Gate block

**Lane:** A (Stitch design-pass) · **Author:** Designer · **Date:** 2026-06-07
**Plan:** `product-feedback-v4-2026-06-06.md` §3 (template verbatim) · **Wave-3 candidate:** ✅ first, but the control surface is NET-NEW
**Reference frame (LOCKED):** `.omo/qa/frames/lean-block-expanded.png` — simplify THIS, do not redesign.
**Brief-complete (§3):** (a) an ACCEPTED variant id logged to `ui-comments.jsonl` + (b) REAL-CONTROLS cross-checked vs engine params + (c) a `🔍 Review/Gate` story exists.

> ⚠️ **THIS BRIEF IS NOT ACCEPTED UNTIL ITS CONTROLS ARE ENGINE-VERIFIED.** Per plan §3 the gates have
> **NO threshold/attack/hold/release surface today** — the gain is keyed entirely by the "Open" CV input
> (5ms ramp, hardcoded). Every knob below is marked **`pending substrate`**: it cannot bind until the
> §1.6 B-1 spike (a) decides the lock-free param mechanism AND (b) the engine node actually grows that
> atomic+param. Stitch may render the intended layout for Glen's verdict, but the FACE does not ship
> until `validateInlineFace` passes on a real param. This brief intentionally covers BOTH gate nodes (they
> share one face shape) — the only delta is the signal lane (audio vs MIDI).

---

## NOTHING-fake control audit (engine ground truth — `src/nodes/gatenodes.hpp`)

### `element.audioGate` — AudioGateNode
| Control | Real TODAY? | Engine source | Intended (pending) |
|---|---|---|---|
| **Threshold** | ❌ NET-NEW (pending substrate) | — gain is CV-keyed (`open[i] >= 0.5f`), no settable param | the minimal real control: a CV-open threshold (default 0.5) |
| ~~Attack / Hold / Release~~ | ❌ NET-NEW (pending substrate) | ramp is a hardcoded `rampSeconds = 0.005f` | only add if the engine grows real atomics + the spike proves lock-free |
| Open (CV in) | ✅ REAL (a PORT, not a knob) | `cv_open` port; gate follows it | shown as a port well, never a fake knob |

Ports (real): In L, In R (audio) · **Open** (CV in) · Out L, Out R (audio).

### `element.midiGate` — MidiGateNode
| Control | Real TODAY? | Engine source | Intended (pending) |
|---|---|---|---|
| **Threshold** | ❌ NET-NEW (pending substrate) | — gain is CV-keyed; falling-edge fires MIDI panic | same minimal CV-open threshold |
| Open (CV in) | ✅ REAL (a PORT) | `cv_open` port | port well |

Ports (real): MIDI In · **Open** (CV in) · MIDI Out.

> **Minimal-set decision (for Glen):** the ONE intended net-new control is **Threshold** (the CV level at
> which the gate opens — replaces the hardcoded `>= 0.5`). Attack/Hold/Release are deliberately left OUT
> of the first face: they don't exist in the engine and adding four params widens the substrate spike.
> If the spike is cheap, attack/release can be a follow-up. The brief ships the **Threshold-only** face
> as the candidate; the layout reserves room for a future row but renders nothing fake.

---

## Brief (per §3 template) — ONE face shape, two signal lanes

```
COMPONENT: Audio Gate (element.audioGate)  ‖  MIDI Gate (element.midiGate)
SIGNAL ROLE:
  - Audio Gate → modulator/utility → header gradient hsl(266 64% 69%) 28→24% (purple ⬡)
  - MIDI Gate  → midifx            → header gradient hsl(180 65% 47%) 28→24% (teal ▲)
SHAPE GLYPH: ⬡ hexagon (Audio Gate) | ▲ triangle (MIDI Gate)  (left of title, 14px)
REFERENCE FRAME (LOCKED — simplify THIS, do not redesign; attach lean-block-expanded.png):
  - header: 36px, category gradient, 13px title "Audio Gate"/"MIDI Gate" (… truncate), CPU% pill + INT pill + B/M
  - body surface: #252529 raised (.neu-raised paired shadow), 1px top highlight
  - activity well: recessed (.neu-inset), full-width, 6px-segment bar, green→amber→red,
    coloured by signal type — Audio Gate well = Audio #4A90D9 (output level) · MIDI Gate well = MIDI #2BC4C4 (event activity)
  - port lanes: left inputs / right outputs, 11px mono labels, glowing dots by SIGNAL type:
      Audio Gate: In L, In R (Audio #4A90D9) · Open (CV #E8A838) | Out L, Out R (Audio #4A90D9)
      MIDI Gate:  MIDI In (MIDI #2BC4C4) · Open (CV #E8A838) | MIDI Out (MIDI #2BC4C4)
  - the "Open" CV input is a recessed port well with a CV-amber dot — it is the gate key, NOT a knob
  - bottom: 2px category-hue accent underline (purple for audio gate / teal for midi gate)
GRID: 8px base; control row 44px; knob Ø 32px (medium)/40px (large); label 10px mono caps
REAL CONTROLS (engine-verified — NO control w/o a real param):
  - Threshold → knob → 0.0–1.0 (CV-open level), default 0.5   [PENDING SUBSTRATE — net-new param + spike]
  (NOTHING else. attack/hold/release are NOT in the engine — do not draw them as real.)
DENSITY TIERS (same component, three HEIGHTS — NOT three designs):
  - compact:  header + activity well only (≈84px). NO controls. KEEPS the activity well (D5 — output/event activity, never name+dot).
  - medium:   header + Threshold knob + the "Open" port emphasised + activity well + I/O (≈150px). (default)
  - large:    header + Threshold (Ø40px + readout) + activity well + all ports (auto height). (focused block)
              (room reserved for a future attack/release row — rendered EMPTY until those params are real)
STATES (D6):
  - default / hover (4px micro-glow) / selected (cat-hue ring+glow) as the locked recipe
  - muted:    full-block RED gradient wash incl header (heavy)
  - bypassed: whole block desaturated/greyed incl header (heavy) — note: engine bypass = gate fully OPEN
  - active-signal: well animates on REAL output level (audio) / REAL event activity (midi)
  - GATE-STATE (node-specific): a small open/closed indicator driven by the REAL gate gain
    (audioGate currentGain, midiGate prevOpen) — green when open, dim when closed. This is REAL state, not fake.
  - refused: (n/a)
INTERACTION (D6): what moves, on what REAL data, at what rate (respect 30/60Hz idle-gate):
  - Activity well + open/closed indicator: driven by the live gate state from the snapshot (≤60Hz),
    joins the meterlanegate idle-gate (a closed/silent gate pushes NOTHING).
  - Threshold knob (once real): user-dragged; lock-free/no-alloc WRITE to the audio thread (§B contract).
  - The "Open" port pulses/glows when the keying CV is high (reuse the connected-port glow language).
TOKENS (exact): bg #1E1E22 / panel #222226 / surface #252529 / elevated #2A2A2E / pressed #1A1A1E;
  text #E5E5EA / #8E8E93; micro-glow 4px @25% on active; NO glass/backdrop-blur/transparency.
TOGGLES: neumorphic pressed/raised switch (.neu-pressed) — NOT iOS pills (D7).
  (If a future "hard/soft" mode lands as a real enum, use a .neu-pressed segmented switch — not pills.)
MOTION: state transitions on box-shadow + background ONLY — NEVER animate width/height.
```

## Stitch prompt seed (the brief text IS the prompt)

Generate THREE density variants (compact / medium / large) of ONE on-canvas audio-plugin **gate** node card
for a dark **neumorphic** modular audio host (NOT glassmorphism — no transparency, no backdrop-blur). Produce
the layout for BOTH an Audio Gate (purple header) and a MIDI Gate (teal header) — same card shape, different
signal lane. Dark continuous chassis: body `#252529` raised via PAIRED soft shadows (light top-left
`rgba(255,255,255,0.05)`, dark bottom-right `rgba(0,0,0,0.4)`), 1px top highlight. 36px header: purple
(`hsl(266 64% 69%)`) for Audio Gate / teal (`hsl(180 65% 47%)`) for MIDI Gate vertical gradient, a ⬡ hexagon
(audio) or ▲ triangle (midi) glyph + 13px title + CPU% pill + "INT" pill + B/M buttons. A **recessed**
full-width activity meter well (segmented green→amber→red). A distinct small **open/closed gate indicator**
(a recessed pip that glows green when the gate is open). Port lanes with glowing recessed wells coloured by
signal: Audio Gate inputs "In L"/"In R" blue (`#4A90D9`) + an **"Open" CV-key port** amber (`#E8A838`),
outputs "Out L"/"Out R" blue; MIDI Gate "MIDI In" teal (`#2BC4C4`) + "Open" amber, "MIDI Out" teal. ONE
control: a **Threshold** neumorphic knob (Ø32/40px). Bottom: 2px category accent underline. compact = header
+ activity well only (~84px). medium = header + Threshold knob + emphasised Open port + well + ports (~150px).
large = header + larger Threshold knob with readout + well + all ports, with an EMPTY reserved row beneath
(no fake controls). Information-dense, precise, instrument-grade. Match the locked reference frame.

## INTERACTION expectations Glen judges (dynamic, per D6)

- Does the **open/closed indicator + activity well** read the REAL gate state (this node has no knobs to
  judge yet — its honesty is in showing live gating)?
- Does the **"Open" CV-key port** read clearly as *the* control surface (the gate is CV-driven), so the
  single Threshold knob doesn't imply more than exists?
- Is the **Threshold-only** face honest — does the reserved-but-empty row read as "more coming" without
  faking attack/release?
- Audio vs MIDI lane: are the two cards obviously the same family, differentiated only by signal colour +
  glyph?
