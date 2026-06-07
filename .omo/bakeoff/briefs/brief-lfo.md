# Stitch Brief — LFO block (to-be-built node)

**Lane:** A (Stitch design-pass) · **Author:** Designer · **Date:** 2026-06-07
**Plan:** `product-feedback-v4-2026-06-06.md` §3 (template verbatim) · **Wave-3 candidate:** ✅ (built WITH a real surface — the FIRST B-1 consumer)
**Reference frame (LOCKED):** `.omo/qa/frames/lean-block-expanded.png` — simplify THIS, do not redesign.
**Brief-complete (§3):** (a) an ACCEPTED variant id logged to `ui-comments.jsonl` + (b) REAL-CONTROLS cross-checked vs engine params + (c) a `🔍 Review/LFO` story exists.

> ⚠️ **THE LFO NODE DOES NOT EXIST YET.** Confirmed: no `element.lfo` in `nodefactory.cpp`, no
> `lfonode.hpp`. It is an approved, scheduled Wave-3 build (plan §0 out-of-scope note: *"LFO node is
> approved but scheduled (Wave 3) behind the param protocol — it's the first real consumer of it"*).
> Because the node is built **with** its real param surface, rate/depth/shape are designed to be REAL
> `AudioProcessorParameter`s from day one (via the §1.6-spike substrate). This is the cleanest case: the
> face and the params are co-designed, so NOTHING-fake holds by construction — the brief specifies exactly
> the params the node will be built to expose, and `validateInlineFace` guards them.

---

## Intended control surface (co-designed with the node build — these become REAL params)

| Control | Kind | Param it WILL expose | Range / default |
|---|---|---|---|
| **Rate** | knob | continuous `AudioProcessorParameter` | 0.01 – 40 Hz (log), default 1 Hz · (free-run; sync is a later follow-up) |
| **Depth** | knob | continuous `AudioProcessorParameter` | 0 – 100 %, default 100 % |
| **Shape** | chooser (enum) | int mode via `nativeNodeSetIntMode` (the proven discrete path — like compare/logic) | Sine / Triangle / Saw / Square — index 0–3 |

> **Why this split is NOTHING-fake-correct:** Rate + Depth are genuinely continuous → real params (the
> §B hybrid B-3 "real where real"). Shape is a genuine enum, NOT a param → the already-shipped
> `opChooser` path (the same mechanism as ComparatorNode/LogicGateNode, `inlineParams.ts:62-68`). No
> fabricated control: every entry maps to a real engine affordance the node is built to have.

Intended ports (to design the lanes against): **Rate** (CV in, optional sync/FM) · **Out** (CV out, the LFO
signal). The card shows the **Out** as the primary signal lane (CV-amber).

---

## Brief (per §3 template)

```
COMPONENT: LFO (element.lfo)   [to-be-built — first B-1 consumer]
SIGNAL ROLE: modulator → header gradient hsl(266 64% 69%) 28→24% lightness vertical (purple)
SHAPE GLYPH: ⬡ hexagon  (left of title, 14px)
REFERENCE FRAME (LOCKED — simplify THIS, do not redesign; attach lean-block-expanded.png):
  - header: 36px, purple category gradient, 13px title "LFO" (… truncate), CPU% pill + INT format pill + B/M
  - body surface: #252529 raised (.neu-raised paired shadow), 1px top highlight
  - activity well: recessed (.neu-inset), full-width — for the LFO this is a LIVE WAVEFORM SCOPE of the
    real CV-out value over time (the activity well's "honest signal" is literally the LFO output), amber CV (#E8A838)
  - port lanes: left input "Rate" (CV #E8A838 dot, optional) · right output "Out" (CV #E8A838 dot),
    11px mono labels, glowing port dots by SIGNAL type
  - bottom: 2px purple (--cat-modulator) accent underline
GRID: 8px base; control row 44px; knob Ø 32px (medium)/40px (large); label 10px mono caps
REAL CONTROLS (engine-verified at build time — NO control w/o a real param):
  - Rate  → knob    → 0.01–40 Hz (log taper), default 1 Hz    [real AudioProcessorParameter]
  - Depth → knob    → 0–100 %,  default 100 %                  [real AudioProcessorParameter]
  - Shape → chooser → Sine / Triangle / Saw / Square (int mode 0–3)   [opChooser — discrete, NOT a param]
DENSITY TIERS (same component, three HEIGHTS — NOT three designs):
  - compact:  header + the live-waveform activity well only (≈84px). NO controls. KEEPS the well (D5 — the LFO IS its motion).
  - medium:   header + Rate + Depth knobs in a row + waveform well + I/O (≈150px). (default)
  - large:    header + Rate + Depth (Ø40px + Hz/% readouts) + Shape chooser row + waveform well + ports (auto height). (focused block)
STATES (D6):
  - default:        purple header gradient, raised body, scope drawing the live waveform
  - hover:          4px purple micro-glow @25% (box-shadow only — never resize)
  - selected:       1.5px --cat-modulator ring + 24px outer glow (index.css:444 recipe)
  - muted:          full-block RED gradient wash incl header (heavy) — scope freezes/dims
  - bypassed:       whole block desaturated/greyed incl header (heavy) — scope flat-lines
  - active-signal:  the waveform scope animates on the REAL CV-out value (this is the node's core honesty)
  - refused:        (n/a)
INTERACTION (D6): what moves, on what REAL data, at what rate (respect 30/60Hz idle-gate):
  - Waveform scope: draws the REAL LFO CV-out value over time, sampled at the snapshot push rate (≤60Hz).
    A running LFO is genuinely never-idle, so it legitimately pushes every frame WHILE the node exists —
    but it must still flow through the meterlanegate (no per-tick painter restyle; transform/canvas redraw only).
  - Rate/Depth knobs: user-dragged; lock-free/no-alloc WRITE to the audio thread (§B contract). Knob shows a
    live Hz / % readout while dragging. Changing Rate visibly changes the scope speed (real feedback loop).
  - Shape chooser: a .neu-pressed segmented switch (Sine/Tri/Saw/Sqr) — selecting redraws the scope shape.
TOKENS (exact): bg #1E1E22 / panel #222226 / surface #252529 / elevated #2A2A2E / pressed #1A1A1E;
  text #E5E5EA / #8E8E93; micro-glow 4px @25% on active; NO glass/backdrop-blur/transparency.
TOGGLES/CHOOSER: neumorphic pressed/raised switch (.neu-pressed) for Shape — NOT iOS pills (D7).
MOTION: control STATE transitions on box-shadow + background ONLY — NEVER animate block width/height.
  (The scope's waveform motion is CONTENT, not a layout transition — it animates the canvas/transform, never reflow.)
```

## Stitch prompt seed (the brief text IS the prompt)

Generate THREE density variants (compact / medium / large) of ONE on-canvas **LFO modulator** node card for
a dark **neumorphic** modular audio host (NOT glassmorphism — no transparency, no backdrop-blur). Dark
continuous chassis: body `#252529` raised via PAIRED soft shadows (light top-left `rgba(255,255,255,0.05)`,
dark bottom-right `rgba(0,0,0,0.4)`), 1px top highlight. 36px header with a **purple vertical gradient**
(`hsl(266 64% 69%)` 28%→24%), a ⬡ hexagon glyph + 13px title "LFO" + CPU% pill + "INT" format pill + B/M
buttons. The recessed full-width well is a **live waveform oscilloscope** drawing an amber (`#E8A838`)
low-frequency sine/triangle trace (this is the LFO's real output). Port lanes: left input "Rate" (amber CV
glowing recessed well, optional), right output "Out" (amber CV well), 11px monospace caps labels. Controls:
two neumorphic circular knobs **Rate** and **Depth** (Ø32px medium / Ø40px large, 10px mono caps labels), and
a **Shape** segmented switch (neumorphic pressed/raised — NOT iOS pills) with Sine / Triangle / Saw / Square.
Bottom: 2px purple accent underline. compact = header + waveform well only (~84px, no knobs). medium = header
+ Rate + Depth knobs + waveform well + ports (~150px). large = header + larger Rate/Depth knobs with Hz/%
readouts + Shape switch row + waveform well + all ports. Information-dense, precise, instrument-grade. The
waveform scope is the hero element. Match the locked reference frame.

## INTERACTION expectations Glen judges (dynamic, per D6)

- The **waveform scope** is the centrepiece — does it read as a live, honest view of the LFO output (the one
  thing that makes an LFO legible at a glance)? Does **Rate** visibly change scope speed and **Shape** change
  the trace?
- Are **Rate/Depth** instrument-grade knobs with useful Hz/% readouts on drag?
- Is the **Shape** chooser a proper neumorphic segmented switch (D7) — not generic pills?
- Does **compact** keep the live scope (D5) so even a collapsed LFO proves it's running?
- The LFO is the FIRST node co-designed with its real params — does the face feel like the params and the
  visuals were built together (no fake, no "coming soon" knobs)?
