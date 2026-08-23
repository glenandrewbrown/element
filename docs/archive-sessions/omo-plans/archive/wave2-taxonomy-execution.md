> 🗄️ **ARCHIVED — DONE / SHIPPED. Do NOT re-execute.** The 4-category taxonomy shipped via **Option A** (semantic rename, zero-debt) in `dadc2c67`. The "THE FORK (Glen decides)" below was resolved = Option A. The trailing **G-14 sizing/density** follow-on is now absorbed into the M1 UI lane (`.omo/HORIZON-v3-ui.md`), NOT a standalone TODO. Live state: the shipped taxonomy is documented in `CLAUDE.md`.
> Current state: `.omo/PROJECT-STATE.md` · plans index: `.omo/plans/README.md`. _(Archived 2026-05-30.)_

# Wave 0 + Wave 2 — 4-Category Taxonomy Execution Plan

Status: RESEARCH DONE (3 parallel sub-agents, 2026-05-30) · token-naming fork PENDING GLEN · then execute via sub-agents.
Branch: chromatic-ui-review @ a29ebbfc.

## Ratified taxonomy (Glen, D1)
| New category | Shape | Hex | From (old) |
|---|---|---|---|
| Virtual Instruments | ● circle | #4A90D9 blue | generator |
| MIDI Effects | ▲ triangle | #2BC4C4 teal | logic |
| Audio Effects | ◆ diamond | #E8A838 orange | modifier |
| Modulators / Utilities | ⬡ hexagon | #A87FE0 purple | NEW (LFO/env/CV + utilities; e.g. demoGraph lfoTool, valueConstant move here from logic) |

## D5 — RESOLVED: no persistence, no migration
- Category is NEVER written to the node ValueTree / `.els`. `tags::category` identifier exists but is never set/get on Node state.
- C++ `mapBlockCategory()` (`src/ui/element_webview_host.cpp:184-205`, called at snapshot emit :4285) computes it live from `KnownPluginList` plugin category + node name into a transient DynamicObject (JSON), not ValueTree.
- TS `useJuceBridge.ts:205` `category: (b as any).category ?? inferCategory(b)` — uses emitted value, computes fallback. No saved-state read.
- ⇒ No back-compat migration. No migration fixture. DO add a unit test locking the NEW 4-cat mapping (C++ Boost.Test + TS mappers test).

## Blast-radius manifest (the implement checklist)
- **Union:** `webview/src/data/types.ts:2` `export type BlockCategory = "generator"|"modifier"|"logic";` (+ usages :18 BlockData.category, :106 SignalChainEntry.category).
- **Infer #1:** `webview/src/hooks/useJuceBridge.ts:167-178` `inferCategory(EngineBlock)` (name-based). FIX: `output` currently→generator (wrong, it's a sink); split router into midi-router vs audio-router.
- **Infer #2:** `webview/src/stores/usePluginBrowserStore.ts:16-33` `inferBlockCategory(raw)` (plugin-category-based) + test table `usePluginBrowserStore.test.ts:163-177`.
- **C++ emit:** `src/ui/element_webview_host.cpp` `mapBlockCategory` (:184) → return new strings; emit sites :4285 (block) and the plugin-browser list :4461.
- **Category Records (need `modulator` key + exhaustiveness):** BlockEmbed.tsx (CATEGORY_COLOR), QuickAddPopup.tsx (CAT_ICON — add hexagon), MacroDashboard.tsx (CATEGORY_BORDER/CATEGORY_DOT — but MacroDashboard is SHELVED), ConnectionEditor.tsx (CATEGORY_DOT), QuickAccess.tsx (categoryDot), InspectorHub.tsx:197-203 (ternary → make 4-way Record, currently falls through to logic).
- **demoGraph.ts** 15 category literals (lfoTool:349 + valueConstant:368 → modulator; rest map per table).
- **CSS `@theme` (`webview/src/index.css:18-20`):** the 3 `--color-generator/modifier/logic`; add `--color-modulator:#a87fe0`; add `--shadow-glow-modulator` (:56-58 area) + `.glow-purple` util (:117-127 area). NOTE `--color-badge-au:#a855f7` is a DIFFERENT purple — keep distinct.
- **Shapes:** need a hexagon glyph for Modulators (QuickAddPopup CAT_ICON + any block-header shape renderer).
- **Stories / Chromatic:** ~10 exports encode old cat (canvas-block--generator/modifier/logic, blockembed--*, blockexpandedheight--expanded-modifier, inspectorhub--generator/modifier-selected) → rename = new baselines (expected/acceptable). Many more stories carry category literals in fixtures (re-baseline visual only). `.omo/audit/ui-comments.jsonl` has NO storyId refs to old cat names (safe).
- **Signal-type CONFLATION (landmine):** `ConnectionEditor.tsx:26-28,469-473` uses `text/border/bg-generator|logic|modifier` to mean AUDIO|MIDI|VALUE signal pills, NOT block category. Also NeuBadge/NeuKnob/NeuToggle color props (blue/orange/teal) map to these classes; Toolbar/StatusBar/SessionTree/etc. use them as plain accents. These are colour-correct today only because category hue == signal/accent hue.

## THE FORK (Glen decides) — CSS token naming
- **Option A — semantic rename (zero debt):** `--color-generator→instrument`, `modifier→audiofx`, `logic→midifx`, add `modulator`. ~130 Tailwind class edits / ~28 files. MUST also disambiguate signal pills: add real `--color-audio/midi/value` tokens (audio=#4A90D9, midi=#2BC4C4, value=#E8A838) and point ConnectionEditor + signal accents at those. Cleanest end-state; matches project "no tech debt" value (copilot-instructions). Biggest diff; ~10 Chromatic baselines reset.
- **Option B — aliases (minimal diff):** keep `--color-generator/modifier/logic` as aliases → new semantic vars, add `--color-modulator`. Only union + Records + C++ emit + demoGraph + infer fns change; ~0 Tailwind churn. Lower risk; leaves misleading class names + signal/category conflation as debt.

## Execution waves (after fork picked) — via sub-agents
- **W0-docs (independent of fork's display content; token-name text depends on fork):** apply the 11 anchored doc deltas to CLAUDE.md + ELEMENT_UNIFIED_BLUEPRINT.md + docs/stitch-reference/DESIGN.md (drafted, verbatim anchors held).
- **W2a-types:** union + both infer fns + their tests (atomic — union change breaks Records til updated).
- **W2b-css:** index.css tokens/glow per fork.
- **W2c-consumers:** all category Records → add modulator + exhaustive; InspectorHub ternary→Record; demoGraph; hexagon shape.
- **W2d-cpp:** mapBlockCategory new strings + emit sites; add Boost.Test mapping test.
- **W2e-stories:** rename ~10 story exports + fixture literals; keep verify-stories + run-story-tests green.
- **D5 test:** TS mappers test + C++ mapping test (no migration test).
- **Gate each:** tsc 0 · unit green · run-story-tests green · vite build 0 · app build + bundle sync · Chromatic re-baseline · Glen 💬 confirm.
- **G-14 sizing/density pass** (separate, after taxonomy) — global, touches every panel.

## Risks
1. Union change is atomic with all Records or tsc breaks mid-flight.
2. InspectorHub ternary silently mis-styles modulator until fixed.
3. `output`/`router` mis-inference predates this — fix in same pass.
4. Don't conflate `--color-badge-au #a855f7` with modulator `#a87fe0`.
5. Story-export renames orphan Chromatic baselines (expected).
