# Wizard round-1 feedback → actions (Glen, 2026-06-01)

Source: `.omo/audit/ui-comments.jsonl` (entries 19:55–20:08Z). Tone POSITIVE — reskin approach VALIDATED ("very nice", "great", "brilliant", "big step right direction"). Specifics below.

## Approved (no rework)
- **Toolbar** — no notes (excellent work).
- **Inspector / Block tab** — "very nice work, big step right direction."
- **Inspector / Health tab** — "Great."
- **QuickAdd / port-type** — "brilliant" (+ the recents-first refinement below).

## Refinements (action — designer workflow)
1. **Inspector / Bus tab** (P2): add **activity meters** (incl. volume level) + **sidechain info/config** + a **direct open/close bus editor** (if a bus contains e.g. a reverb, open its controls to work on it). UI itself already praised ("ui is great").
2. **Inspector / Cable tab** (P1): "wrong on both element AND mockup." → REWORK to display **rich, real-time data monitored from the selected wire(s)** (levels/peak/signal-type/activity from `useCableMeterStore`), not a routing editor.
3. **QuickAdd** (P2): default the list to **recents-first**; fuzzy search reveals the rest (not a random block list).

## Conceptual corrections — DECISIONS to propagate (stop building the old way)
4. **NO wireless buses** (P2, prior decision): use **IO blocks that send to / receive from buses**, not "wireless" cables. → rework EdgeContextMenu (#29 "Make Wireless" is wrong), BusInspector (#32), the bus model + Inspector Bus tab framing. Build **Bus Send / Bus Receive blocks**.
5. **Right-click canvas → fuller contextual menu** (P2): one layer ABOVE QuickAdd. Right-clicking the canvas must give a wider, contextual option set — **reference the original native JUCE canvas/menu options** (`src/ui/contextmenus.hpp`). QuickAdd "add block" becomes one entry within it. → folds into NodeContextMenu/canvas-menu (#28) native-parity.

## Engineering flag (engine-side, not UI)
6. Bus processing must apply **latency compensation + phase coherence** to avoid audio artefacts. (Backlog for the C++/engine lane.)

## STANDING design bar — apply to EVERY component (from Block feedback 05-31 + reinforced)
- **Dopamine hover-glow:** subtle category-hue glow/reward on hover/interaction — EVERYWHERE (Glen calls it "genius dopamine UX"). Never change shape/size on hover.
- **Signal colour-coding:** ports + labels colour-coded by signal type (audio/midi/value) AND port count; sidechain ports must be obviously identifiable globally.
- **Faithful digital-VU LED colours** on meters (real VU ramp, not arbitrary).
- **Meaningful function icons** (reverb/eq/etc.) — NOT arbitrary geometric shapes (diamond/hex "mean nothing").
- **NO transparency / no canvas-grid showing through** any block/panel — opaque chassis always.
- **Tight alignment / attention to detail** — misaligned text/elements = unacceptable (use the designer workflow + verify).
- **More white on controls** — the mockup's lighter controls read as more aesthetic.
- **Screen space is precious** — every inch used or reserved; no wasted empty middle space (instrument blocks especially).
- **MANDATE:** every UI change uses the ui/ux-max skill + a specialised **designer agent** workflow (Glen, explicit). Screenshot-verify → wizard-gate. (Being followed.)

---

# Wizard ROUND-2 feedback → actions (2026-06-01, tone positive — refinements, all P2 except the P0 icon item)

**GLOBAL (P0) — category iconography redesign:** replace the abstract glyphs (● instrument / ◆ audio-fx / ▲ midi-fx / ⬡ modulator) with MEANINGFUL, relevant icons — SYSTEM-WIDE (Block, ToolPalette, QuickAdd, Inspector, anywhere category is shown). Echoes the earlier "diamond/hex mean nothing" Block feedback. Foundational design-system task — pick a real icon set, apply everywhere via one source.

**QuickAdd:**
- Fuzzy search must match block **metadata** (category, manufacturer, …), not just name.
- Generic right-click = **recents-first too** + far more contextual options than block-add — folds into the contextual-canvas-menu (#28) task.

**Inspector / Block tab:** smart content layout — **hide empty sections/categories** so they don't bury the important available info (collapse/auto-order by relevance).

**Inspector / Bus tab:** add **SEND + RECEIVE meters** (separate) + sidechain **display**.

**Inspector / Cable tab:** **auto-display** the expanded detail for the currently-selected cable (no extra click); **enrich MIDI + logic-gate/utility/command metadata** for flow-debugging + conditional routing.

(Approved this round: Inspector overall "good", Cable monitor "good", Bus, QuickAdd port-type, BottomStrip — refinements only, no rework.)
