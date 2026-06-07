# Stitch Brief — Envelope Follower block

**Lane:** A (Stitch design-pass) · **Author:** Designer · **Date:** 2026-06-07
**Plan:** `product-feedback-v4-2026-06-06.md` §3 (template verbatim) · **Wave-3 candidate:** ✅ FIRST (smallest real surface)
**Reference frame (LOCKED):** `.omo/qa/frames/lean-block-expanded.png` — simplify THIS, do not redesign.
**Brief-complete (§3):** (a) an ACCEPTED variant id logged to `ui-comments.jsonl` + (b) REAL-CONTROLS cross-checked vs engine params + (c) a `🔍 Review/EnvFollower` story exists.

---

## NOTHING-fake control audit (engine ground truth — `src/nodes/envfollowernode.hpp`)

| Control | Real TODAY? | Engine source | Range / default |
|---|---|---|---|
| **Attack** | ✅ REAL | `setAttackMs()` / `getAttackMs()`, `std::atomic<float> attackMs` | 0.1 – 2000 ms · default 5 ms |
| **Release** | ✅ REAL | `setReleaseMs()` / `getReleaseMs()`, `std::atomic<float> releaseMs` | 1 – 5000 ms · default 120 ms |
| ~~Gain~~ | ❌ DOES NOT EXIST | — | brief lists NOTHING else |

> **Substrate caveat (B-1):** the two atomics exist and are runtime-settable, but they are NOT yet exposed as host `AudioProcessorParameter`s — `getAudioProcessor()` returns `nullptr` for this `element::Processor` (`inlineParams.ts:13-16` is law). The §1.6 spike must expose attack/release through the chosen lock-free substrate (mechanism i/ii/iii) before the face binds. The face is **withheld** until `validateInlineFace` passes on real params. This is the smallest real surface (2 continuous params) and the first B-1 consumer — that is why it leads.

---

## Brief (per §3 template)

```
COMPONENT: Envelope Follower (element.envFollower)
SIGNAL ROLE: modulator → header gradient hsl(266 64% 69%) 28→24% lightness vertical (purple)
SHAPE GLYPH: ⬡ hexagon  (left of title, 14px)
REFERENCE FRAME (LOCKED — simplify THIS, do not redesign; attach lean-block-expanded.png):
  - header: 36px, purple category gradient, 13px title "Env Follower" (… truncate), CPU% pill + INT format pill + B/M
  - body surface: #252529 raised (.neu-raised paired shadow), 1px top highlight
  - activity well: recessed (.neu-inset), full-width, 6px-segment bar, green→amber→red,
    coloured by signal type — this node OUTPUTS CV → CV #E8A838 (the well tracks the live Env CV magnitude)
  - port lanes: left=inputs (In L, In R — Audio #4A90D9 dots) · right=outputs (Env — CV #E8A838 dot),
    11px mono labels, glowing port dots by SIGNAL type
  - bottom: 2px purple (--cat-modulator) accent underline
GRID: 8px base; control row 44px; knob Ø 32px (medium)/40px (large); label 10px mono caps
REAL CONTROLS (engine-verified — NO control w/o a real param):
  - Attack  → knob → 0.1–2000 ms (log taper), default 5 ms     [atomic attackMs]
  - Release → knob → 1–5000 ms (log taper),  default 120 ms     [atomic releaseMs]
  (exactly two — there is no gain/threshold/ratio on this node)
DENSITY TIERS (same component, three HEIGHTS — NOT three designs):
  - compact:  header + activity well only (≈84px). NO controls. KEEPS the activity well (D5 — the live Env CV bar, never name+dot).
  - medium:   header + Attack + Release knobs in one row + activity well + I/O (≈150px). (default)
  - large:    header + Attack + Release (larger Ø 40px, with ms readouts) + activity well + all ports (auto height). (focused block)
STATES (D6):
  - default:        purple header gradient, raised body, dim activity well
  - hover:          4px purple micro-glow @25% on the whole block (box-shadow only — never resize)
  - selected:       1.5px --cat-modulator ring + 24px outer glow (index.css:444 recipe)
  - muted:          full-block RED gradient wash over the WHOLE block incl header (heavy)
  - bypassed:       whole block desaturated/greyed incl header (grayscale backdrop, heavy)
  - active-signal:  activity well animates green→amber→red on the REAL Env CV magnitude; knobs unaffected
  - refused:        (n/a — this node accepts attack/release always; no refusal state)
INTERACTION (D6): what moves, on what REAL data, at what rate (respect 30/60Hz idle-gate):
  - Activity well: tracks the live Env CV out magnitude. Updates at the snapshot push rate (≤60Hz),
    joins the meterlanegate idle-gate epsilon pre-pass (a settled-silent graph pushes NOTHING).
  - Attack/Release knobs: user-dragged; the value WRITE must be lock-free/no-alloc to the audio thread
    (the §B contract — the spike proves it). Knob shows a live ms readout while dragging.
  - Nothing else animates. No per-tick painter styles on the block (perf-wave guardrail).
TOKENS (exact): bg #1E1E22 / panel #222226 / surface #252529 / elevated #2A2A2E / pressed #1A1A1E;
  text #E5E5EA / #8E8E93; micro-glow 4px @25% on active; NO glass/backdrop-blur/transparency.
TOGGLES: (none on this node — both controls are continuous knobs.)
MOTION: state transitions on box-shadow + background ONLY — NEVER animate width/height
  (collapse compact↔medium = snap or transform-clip per Item 2c D3, NOT a height tween).
```

## Stitch prompt seed (the brief text IS the prompt)

Generate THREE density variants (compact / medium / large) of ONE on-canvas audio-plugin node card for a
dark **neumorphic** modular audio host (NOT glassmorphism — no transparency, no backdrop-blur). Dark
continuous chassis: body `#252529` raised via PAIRED soft shadows (light top-left `rgba(255,255,255,0.05)`,
dark bottom-right `rgba(0,0,0,0.4)`, ≥8px blur), 1px top highlight. 36px header with a **purple vertical
gradient** (`hsl(266 64% 69%)` 28%→24% lightness), a ⬡ hexagon glyph + 13px title "Env Follower" + a CPU%
pill + an "INT" format pill + small B/M buttons. Below the header a **recessed** (inset-shadow) full-width
activity meter well — a segmented 6px bar that ramps green→amber→red (amber-tinted, it shows a CV envelope
level). Port lanes: left inputs "In L"/"In R" with blue (`#4A90D9`) glowing recessed port wells, right
output "Env" with an amber (`#E8A838`) glowing well, 11px monospace caps labels. Bottom edge: a 2px purple
accent underline. Controls = exactly TWO knobs: **Attack** and **Release** (neumorphic circular knobs,
Ø32px medium / Ø40px large, 10px mono caps label beneath). compact = header + activity well only (~84px,
no knobs). medium = header + both knobs in a row + activity well + ports (~150px). large = header + both
larger knobs with ms readouts + activity well + all ports. Information-dense, precise, instrument-grade.
No rounded-everything; no centered floating controls; match the locked reference frame.

## INTERACTION expectations Glen judges (dynamic, per D6 — judge interaction, not stills)

- Does the **activity well track a real Env CV level** (it must — this node's whole job is audio→CV)?
- Do **Attack/Release** read as real, draggable, instrument-grade knobs (not dead circles)? Is the ms
  readout-on-drag useful?
- Does **compact** still prove the block is alive (keeps the activity well, per D5) rather than going dead?
- Does the block **never reshape** on hover/zoom (only box-shadow glow changes)?
