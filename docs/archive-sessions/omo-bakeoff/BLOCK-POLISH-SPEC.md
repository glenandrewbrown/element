# Block polish spec — mockup-match (2026-05-31)

**Decision:** POLISH FORWARD (Glen, 2026-05-31). NOT revert. Current `Block.tsx` is a ~90%
mockup port — solid bg (transparent-center bug already fixed), gradient header, knobs, RMS
meters, `.port-well` sockets, B/M buttons. tsc 0, renders error-free. Job = close the gap to
the mockup PNGs, fixing Glen's flagged P0s. Keep ALL wiring/props/store hooks/Handles — restyle only.

**Pixel targets (the bar):** `webview/public/review-mockups/{audiofx-knobs,instrument-clean,midifx-ports}.png`
**Files:** `webview/src/components/canvas/Block.tsx` + `webview/src/index.css` (`.nodeblock-v3*`). Nothing else.
**Mandate (Glen, explicit):** use `ui-ux-pro-max` + `neumorphism-generator` skills. Verification-first:
screenshot every state via `node .storybook/shot.mjs <storyId> <out>` (Storybook live :6006) and
self-compare to the mockup PNG BEFORE Glen sees it. Solo (S) button stays OUT (memory).

## Gaps (Glen's own words, prioritised)

**P0**
1. **Closer to the mockup overall** — the meta-issue. Match `audiofx-knobs.png` proportions/spacing.
2. **Ports = the mockup's, not "cheap white-ring circles."** Mockup = small edge pips + neat mono
   labels in columns; **stereo In L/In R + Out L/Out R**; **SC = dashed orange socket**. Signal
   colour-code wells+labels (blue audio / teal midi / orange value). Current `.port-well` (14px
   recessed circle) reads as a white ring — make it read as a physical socket pip like the mockup.
3. **Alignment / attention to detail** — header CPU "22%" pill cramped; format badge (INT/VST3/AU)
   + B/M baseline must line up. Every element on one baseline, even rhythm. (Repeated P0.)
4. **Muted** = RED gradient wash over WHOLE block incl header (no cheap border/stripe); B/M stay
   click-through. **Bypassed** = whole block incl coloured title desaturated/greyed, BUT still show
   signal PASSING THROUGH (bypass = pass-through, unlike mute = blocked).

**P1**
5. **VU meters** — restore the MOCKUP's segmented shape (Glen liked it; a prior pass changed it).
   Faithful DIGITAL-VU LED colours: green→amber→red ramp, lit segments (mockup shows lit orange);
   idle = dim. Keep size/placement consistent across block types (don't make instrument meters huge).
6. **Hover glow** — subtle category-colour glow on hover (mockup's "dopamine" cue). NO shape/size
   change on hover (P0 elsewhere). Currently not noticeable — make it visible but tasteful.
7. **Function icons** — meaningful effect/instrument-type glyphs (reverb, EQ, synth, MIDI-transform),
   NOT abstract diamonds/waves. Mockup uses recognisable icons.
8. **Instrument blocks** — differentiate MIDI vs audio ports; add MIDI-activity feedback (it receives
   MIDI + outputs audio). Mockup handles port differentiation better.

**P2 / polish**
9. No wasted/empty centre space — screen space is precious; fill or tighten.
10. Bottom green load-bar: match the mockup's subtle one (Glen: mine "looks out of place").
11. Stereo: enough ports to match channel count (2 in / 2 out for stereo).
12. Adaptive layout: size/place/truncate to context, never overlap (recurring global rule).

## Verify contract (every iteration)
- `node .storybook/shot.mjs canvas-block--audio-fx /tmp/db-afx.png` (+ instrument, midi-fx, bypassed, muted)
- Compare each to its mockup PNG; iterate until close. Report screenshot paths + a per-gap status.
- Then: non-test tsc 0 (`npx tsc --noEmit | grep -v __tests__ | grep -c 'error TS'`), `npx vite build` exit 0,
  `npm run verify-stories` green. NO new vitest fails.
- Do NOT claim done on self-report — lead re-screenshots + publishes to `🔍 Review/Block` wizard for Glen.
