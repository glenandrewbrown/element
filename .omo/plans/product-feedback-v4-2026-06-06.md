# Product Feedback v4 — Sequenced Consensus Plan

**STATUS: APPROVED FOR EXECUTION (Glen answered all 9 questions, 2026-06-07 — answers locked in §0). Consensus trail: Architect R2+R3 APPROVE · Critic R2 APPROVE · external /multi-plan pass folded. Execution = wave-gated (ralph/team), Wave 1 + both parallel lanes first.**
**Author:** Planner · **Date:** 2026-06-07 · **Baseline branch:** `local-enhancements` (current: `chromatic-ui-review`)
**Supersedes:** `qa-fix-and-improve-2026-06-05.md` residuals and the named follow-ups (LFO node, expose-host-params, input-RMS, per-node MIDI feed). This is the next major work program after the shipped perf wave (`95b5a173`+`db54be3a`).
**Coverage:** every Glen feedback cluster, every navigation item, and every `.omo/ULTRAQA-EVIDENCE-2026-06-06.md` "next wave backlog" item is mapped to a plan item + wave (or explicitly deferred-with-rationale) in the **Traceability Matrix (§1.5)**. There is no blanket "absorbs the backlog" claim — the matrix is the proof.

**Review trail:**
- iter-1 → `ralplan-v4-architect-r1.md` (ITERATE, 10) + `ralplan-v4-critic-r1.md` (ITERATE, consolidated 15).
- iter-2 → Architect APPROVED.
- iter-3 (this revision) → external `/multi-plan` pass: `multiplan-codex.md` (Codex CLI, code-verified engineering) + `multiplan-gemini.md` (Gemini 3.1 Pro, frontend) + `multiplan-design-review.md` (design specialist, frames-verified) + `multiplan-ux-review.md` (UX researcher, journey + code-verified). All ADDITIVE deltas; wave structure + 4 big decisions retained.

### Iteration-2 changelog (per the consolidated 15-point Architect+Critic review)

1. Added **Traceability Matrix (§1.5)**; assigned the 3 silently-dropped ultraqa defects (QuickAdd autofocus race HIGH, shift+click-additive + silent-refusal, ⌘D-intermittent) + polish residuals (arrowheads/faint-plugs/LR-wells). Removed the unqualified "absorbs the backlog" claim.
2. Rewrote **Question 1** in Glen's words (auto-size vs session-local non-persisted compact/medium/large toggle).
3. **Item 2b** respec'd to ONE honest activity bar off the single conflated `level` scalar; split-MIDI-LED moved to a gated follow-up.
4. Added `mainmenu.cpp:70` "File" menu title (+ `:90` branch) to **4c**.
5. Falsifiable ACs: **N3** ≤16ms/keystroke (sample(1), before/after recorded); **6b** deterministic `rank(history, signalContext, recency)` + vitest contract.
6. Defined Stitch **brief-complete** + **N1 capture checklist** + artifact paths.
7. **Item 4a** corrected to a ONE-LINE webview fix (`SnippetShelf.tsx:18`); deleted the bogus C++ "dead-writes/repair" language.
8. **Item 1** now covers the SECOND IO-node builder (`node.cpp:182-200`); marked Wave-1 long pole.
9. **B-1** confronts the nullptr-`getAudioProcessor()` reality + lock-free param-WRITE contract + degrade path; Wave-3 estimate re-examined.
10. **D-1** constrained to presentation-only over the JSON view; rescan semantics resolved.
11. **B-1 round-trip spike** is now its OWN parallel gated lane (not a Wave-1 line item).
12. **Autosave fix** = remove `timerCallback:366-367` early-return, route through existing `getAutosaveFile()` fallback; undo-orthogonality + ≤60s recovery honesty added.
13. **Perf contract**: new snapshot fields join the idle-gate epsilon pre-pass; A-1 reserves face space; "static graph pushes nothing even with new fields" test added.
14. `variants` = structured `var` array; **5b** split (Container reuses `elementGraphRenameNode`; top-level Board = ONE new native); **5c** composes from `elementGraphConnect`.
15. **3a** split per wave; 8 products enumerated once (§5); G2 wording aligned to empty-board gating; per-wave rollback/degrade notes added.

### Iteration-3 changelog (external multi-model pass — ADDITIVE; wave shape + 4 decisions unchanged)

**Engineering (Codex, code-verified):**
- **E1 [HIGH]** 4b autosave **format trap fixed**: fallback wrote session XML under `.elg`, but `openFile()` treats `.elg` as graph-import and `elementSessionOpenPath` only accepts `.els` → recovery files were unloadable. Now `.els` (`name.autosave.els` / `autosave_<ts>.els`) + explicit recovery loader. Codex `getAutosaveFile()` pseudo-code added.
- **E2 [HIGH]** D-1 made **alias-aware** (not just presentation-only): favorites/recents/usage are keyed by exact identifier (`usePluginBrowserStore.ts:71-178`, `usePaletteFilters.ts:42-53`) — hiding AU rows orphaned starred AUs. Adopted Codex `PluginGroup` model with native-precomputed group metadata.
- **E3 [HIGH]** Item 1 classification source-of-truth corrected: `signalOut` (`host:6516-6534`) is a `PluginDescription` heuristic that misclassifies internal MIDI nodes (midiTranspose/midiVelocityAmp → "value"); provision from **real instantiated node ports/processor capabilities**, not the UI snapshot. Defaults also apply to internal nodes + snippets.
- **E4 [HIGH]** B-1 spike reframed as a **substrate decision**: the internal `Processor`/`Parameter` model exists (`processor.hpp:145-156`) BUT `Parameter::setValueNotifyingHost()` **takes a lock** (`parameter.cpp:21-25,59-73`) — NOT RT-safe as-is. Spike must choose AudioProcessor-shell vs new atomic bridge vs hardened internal-param path.
- **E5 [MED]** Wave-3 candidate matrix re-scored to code truth (envFollower = attack/release only; gates have NO threshold/etc surface today; constant/midiTranspose/midiVelocityAmp = atomics, no param surface).
- **E6 [MED]** Save UX needs ONE new named-save native (`elementSessionSave/SaveAs` still call interactive choosers); removed already-shipped "wire reopen-last-session" from scope.
- **E7 [MED]** 4a second hardcoded insert surface `MoleculesSection.tsx:32` added; one canonical non-cursor default-insert policy defined.
- **E8 [LOW]** Projects shelf: host scan returns .els/.elg/.eln/.elpreset/.elc but only .els opens → shelf shows sessions only (resolved).

**UX journeys (UX researcher, code-verified):**
- **U1 [MAJOR]** Item 1 now **auto-cables** the first drop (`nativeGraphAddPluginConnected`) → audible default path, not just IO nodes. + Glen Q7.
- **U2 [MAJOR]** Reconciled the existing per-param SHOW-ALL/HIDE-ALL "IN" popover (`InspectorHub.tsx`) with Wave-3 faces — ONE curation system (popover = user curation; `inlineParams` = default set). + Glen Q8.
- **U3 [MAJOR]** 5b rename gesture **collision fixed**: double-click is the shipped dive gesture (`GraphCanvas.tsx:340,903`) — rename stays Cmd+R/Cmd+T, with an IN-PLACE editable label (no centered modal, never double-click).
- **U4** N3 scope corrected: QuickAdd already renders Favorites→Recents→All (`QuickAddPopup.tsx:847-899`) — N3 = bigger panel + category browse + search-perf + focus-race only.
- **U5** 6b flow guardrails as AC (pull-not-push, never-steal-focus, never-auto-act, Esc-dismiss, no reflow).
- **U6** Snippet drag-from-shelf moved W4→W2 (same insert path as the W2 cursor fix).
- **U7** Discoverability line per new affordance (Tidy/auto-complete toolbar homes + tooltips; AU reveal; snippet drag).

**Design system (designer, frames-verified):**
- **D1 [HIGH]** Thin Stitch brief template replaced with the design-system-bearing template (exact tokens, header/activity-well/port-lane anatomy, 8px grid, knob Ø, type ramp, density defs, motion rule); `lean-block-expanded.png` LOCKED as the reference frame on every brief; deliverable = "one block tightened at three densities."
- **D2 [HIGH]** Density model corrected: pure A-1 has no compact state — Glen's "3 layouts" exist only WITH the collapse toggle. Recommended combined model (compact = collapsed header+activity well ~84px; medium/large = A-1 auto-height). `InlineFaceSpec` density-variant SCHEMA change added to Wave 3.
- **D3 [HIGH]** State-transition + affordance spec added to 2c/5b (collapse transition choice; {rest/hover/active/focus/disabled} × {knob,toggle,label-edit,port,collapse-chevron} matrix).
- **D4 [MED]** Canvas-polish W2: white terminal-block neumorphic violation + param-port collapser default for dense nodes + signature motion (auto-complete cables draw-in, Tidy glide).
- **D5 [MED]** Compact/collapsed KEEPS the activity well (never name+dot).
- **D6** Brief template gains STATES + INTERACTION rows.
- **D7** Wave-3 inline toggles = neumorphic pressed/raised switch, not iOS pills.

**Gemini (frontend):**
- **G1** QuickAdd = two-pane/sectioned layout (NOT cascading hover menus) — consensus with Designer + UX; per-row shape-glyph + hue; keyboard highlight; virtualize first ~15 rows.
- **G2** Single activity bar gets **semantic colour** by signal classification (magnitude stays the honest conflated scalar; colour = real metadata) — NOTHING-fake compliant.
- **G3** Autosave micro-indicator (non-modal save-pulse on project name).
- **G4** 3a-W2 auto-fit needs hysteresis (~100px band) + smooth xyflow pan.
- **G5** A11y on new surfaces (visible focus ring; inline edits trap keys; ≥4.5:1 contrast; ≥44px hit areas).
- **G6** Optimistic UI (5c pending dashed cables; snippet drop 150ms scale-up spring).

**Divergence surfaced (not silently resolved):**
- **X1** Collapse persistence — Gemini + UX argue for ValueTree persistence (a write-on-click boolean ≈ negligible); internal reviews chose non-persisted on perf/migration grounds. Made part of Question 1 ("should collapsed blocks stay collapsed after reopening?"); engineering note: persisted boolean, write-on-click only, joins idle-gate.

---

## 0. PRD Header

### Problem

Element works but does not yet *feel* like a precision instrument in flow. Glen's authoritative feedback isolates six friction clusters: (1) Boards/presets don't ship with sensible I/O; (2) block GUIs morph by zoom and embedded plugin editors are broken; (3) the canvas feels cramped and blocks don't self-organise; (4) save/recall goes through a native file browser and snippets aren't drag-and-droppable; (5) everyday actions (rename, connect-to-output) have friction; (6) the app should feel predictive. Underneath all of it sits one architectural blocker — **built-in nodes expose zero host parameters**, which is exactly why Bitwig-style on-canvas controls don't exist yet.

### Goals (what "done" means for the program)

- **G1 — Instant sensible start.** A new Board, and the first Block dropped into an **empty** Board, comes with the right ports for what it is — no manual I/O wiring for the common case. (Gated to empty boards by design: a mixed/populated board keeps the all-4 superset — see Item 1.)
- **G2 — One honest block at one size.** Kill zoom-driven GUI morphing. Built-in blocks get real, direct on-canvas controls (Bitwig model). Third-party plugins get a clean fixed card: I/O + activity, nothing fake.
- **G3 — Roomy, self-tidying canvas.** Larger default canvas; blocks auto-arrange on demand and (opt-in) on add.
- **G4 — Fluid save & reuse.** Saving is automatic and in-app with fast recall; snippets are drag-and-droppable; jargon ("import"/"file"/"export") replaced with plain product language.
- **G5 — Frictionless iteration.** Faster rename, an "auto-complete the signal path" action, faster/larger/nested QuickAdd, VST3-preferred plugin list.
- **G6 — Predictive feel & speed.** No perf regressions; context-aware suggestions; the C++ stays lean.

### In-scope

All six feedback clusters + navigation items + the Stitch block-design pass, staged across waves. The `.omo/ULTRAQA-EVIDENCE-2026-06-06.md` "next wave backlog" is mapped item-by-item in the **Traceability Matrix (§1.5)** — each ultraqa defect is either assigned to a plan item+wave or listed deferred-with-rationale. (No blanket-absorption claim: where a defect is not in the matrix, it is NOT covered.)

### Out-of-scope (deferred, with rationale)

- **Full document-model rewrite of save/open.** Autosave + recents already exist (`sessionservice.cpp:337-372`, `nativeSession.ts`); we surface and extend them, not rewrite the session format. (See ADR / Option C-1.)
- **Shelved D3 features** (Dashboard/Macro/Scene) stay shelved — do not wire into any new UI.
- **A general plugin-parameter-graph / modulation matrix.** The param-exposure work (Wave 3) lights up *built-in* controls only; third-party plugin params remain behind their editor for now.
- **LFO node** is approved but scheduled (Wave 3) behind the param protocol — it's the first real consumer of it.
- **AU→VST3 "convert this plugin" action** (from the navigation feedback): real format conversion is not a thing Element can do; we reinterpret this as a per-plugin "show the AU variant" reveal toggle (Wave 1). Flagged for Glen.
- **Predictive/ML action ranking (Feedback #6b).** Wave 5 ships *heuristic* context suggestions (frequency + signal-type + recency), not a learned model. Flagged for Glen.

### Questions for Glen — ✅ ALL ANSWERED 2026-06-07 (locked decisions)

| # | Question | Glen's answer | Locked decision |
|---|---|---|---|
| 1 | Block sizes (auto-size + collapse; persist?) | **"Yes"** | A-1 auto-height + collapse tier; **collapse state PERSISTS** across reopen (A-2a: per-node boolean in the Board ValueTree, write-on-click, joins idle-gate). X1 fork resolved. |
| 2 | AU hidden behind VST3 + reveal | **"Yes"** | D-1/N2 alias-aware `PluginGroup` ships as specced. |
| 3 | Tidy button + auto-tidy | **"Yes — and ON by default"** | Auto-tidy-on-add ships **ON by default** (user can disable). Overrides the off-by-default recommendation — see Item 3b for the no-fighting-the-user constraints this adds. |
| 4 | Silent save after one inline name | **"Autosave should still restore an untitled session"** | Confirmed + strengthened: a NEVER-named session is autosaved (`autosave_<ts>.els`) and **fully restorable** — protection requires zero naming. Inline-name-once + silent-after stands. |
| 5 | Suggestions heuristic | **"Context-aware: recent usage, historic plugin usage, what kind of block it's connecting from or to"** | 6b `rank(history, signalContext, recency)` confirmed; `signalContext` explicitly = the **connection context** (port/block type being connected from/to), not just board-level signal type. |
| 6 | File-menu word | **"Element"** | `mainmenu.cpp:70` "File" → **"Element"** (+ branch `:90` + guard allowlists). |
| 7 | Auto-cable first drop | **"Yes — adding blocks into existing wires/chains needs to be seamless"** | U1 auto-cable ships **+ NEW scope: cable-splice insertion** (drop/insert a block onto an existing cable → it splices into the chain A→new→B). See Item 1b. |
| 8 | SHOW/HIDE popover drives the face | **"Hide it in a contextual block menu; core = strip down, simplify, unify blocks + direct UI controls that suit each block"** | Popover = the face-curation layer (one system) but **demoted to the block's context menu** — not prominent chrome. The default curated faces carry the experience. |
| 9 | QuickAdd layout | **"Conduct research on how other developers handle this — decide yourself"** | Layout decided by the competitive-research artifact `.omc/state/qa-wave-reports/quickadd-pattern-research.md` (Bitwig/Ableton/VCV/Blender/Unreal/palette patterns). Direction = two-pane/sectioned per the 3-reviewer consensus; research refines anatomy + keyboard model. **No further Glen design-pattern questions — research-first is now standing policy.** |

---

## 1. RALPLAN-DR Summary

### Principles (decision-shaping, 3-5)

1. **Speed wins every tie.** Any appearance-vs-speed trade goes to speed. No reintroduction of per-tick inline painter styles; the perf-wave guardrail vitests stay green.
2. **Nothing fake, ever.** Every meter/control binds to real engine data. Knob faces stay withheld until a *real* validated parameter exists (`inlineParams.ts:10-32` is law).
3. **Surface before you build.** Where capability already exists (autosave, recents, auto-layout, molecules, ghost-cables), the cheap win is wiring/UX, not a rewrite. Big rocks are gated behind the cheap wins so Glen sees motion next session.
4. **One honest size, plain words.** Kill mode/zoom gimmicks; speak in product language (Project/Board/Block/Snippet), enforced by the two terminology guards.
5. **Design via Stitch, judged in motion.** Block redesign runs through Google Stitch → Review-wizard stories → Glen verdict; never make Glen tab-hunt; judge interaction not stills.

### Decision Drivers (top 3)

- **D1 — The param blocker gates the headline feature.** Bitwig-style direct controls (Glen's stated #2c priority) are impossible until built-ins expose real params. This is the long pole; it must start early but ship behind a clean fallback.
- **D2 — Visible-wins-fast vs deep-rocks tension.** Defaults, naming, dedupe, QuickAdd size, and save-UX surfacing are 1-session wins; param protocol + Stitch redesign + predictive are multi-session. Sequencing must front-load the wins.
- **D3 — Don't regress the perf wave.** The just-shipped 50%→14% idle / 137%→29% drag result is load-bearing for the "instrument in flow" feel. Every new render path inherits the painter/idle-render guardrails.

### Viable Options for the BIG architectural decisions

#### A. Block-size model (replaces zoom-tier `zoomToTier`, `useGraphStore.ts:132-136`)

- **A-1 Content-driven auto-size.** Block height/width derive from its real control set + I/O count; zoom only scales, never swaps GUI. Pros: matches "one honest block", kills the morphing complaint directly. **Cons (iter-3, Designer D2):** pure A-1 has **no "compact" state** — a dense block is simply always tall. So A-1 *alone* cannot deliver Glen's "compact/medium/large" (the same block shown three ways); it gives N heights for N control-counts, not 3 deliberate tiers.
- **A-2 User-set collapse (the compact tier) — TWO persistence sub-variants:**
  - **A-2a *persisted* collapse** (a boolean per node in the Board ValueTree, **write-on-click only**). Pros: an expert's deliberate "collapse my 20 settled utility nodes" layout **survives reopening**. Cons iter-1 feared: ValueTree writes feeding the 40ms push/idle-gate — but iter-3 (Gemini X1) notes a single boolean flip on a deliberate click is negligible vs the continuous meter lanes, and it joins the idle-gate like any field.
  - **A-2b *session-local, non-persisted* collapse** (pure webview state). Pros: zero ValueTree/migration cost. Cons (UX + Gemini): a meticulously-collapsed dashboard is **destroyed on reload** — for a precision instrument that's a real workflow loss, not a nicety.
- **A-3 Fixed single size for all.** Invalidated — a 6-control built-in and a 0-control reroute look identical; fights information density.

  > **Pick (iter-3, combined model): A-1 auto-height for the medium/large continuum + A-2 collapse as the compact tier.** Rationale: Designer D2 is decisive — Glen's "3 layouts" are **fiction under pure A-1**; the three deliberate tiers only exist if a collapse state ships (compact = collapsed header+activity well ≈84px; medium/large = A-1 auto-height by controls). This is ONE coherent model and the only reading under which the Stitch "3 layouts" deliverable isn't fiction. The Stitch lane's core deliverable therefore **depends on** the collapse decision (the dependency iter-1/2 had backwards).
  >
  > **Persistence — RESOLVED (Glen, 2026-06-07, Q1 = yes): A-2a PERSISTED.** Collapse state is a per-node boolean in the Board ValueTree, write-on-click only, joins the idle-gate. The X1 fork is closed; A-2b is dead.
  >
  > **Schema impact (Designer D2):** `InlineFaceSpec` (`inlineParams.ts:76`) has **no density/layout field today** — it maps identifier→entries[] with no compact/medium/large concept. So "three layouts per component" needs an `InlineFaceSpec` **density-variant schema change** before any face can BE three sizes. Added to Wave-3 scope (Item 2c).

#### B. Built-in parameter exposure protocol (the gate for G2 direct controls)

**The reality this decision must confront (iter-2, sharpened by Codex iter-3 E4):** built-in `element::Processor`s do **not currently have a `juce::AudioProcessor` at all** — `getObject()->getAudioProcessor()` returns `nullptr`, which is *literally why* `getParameters()` is empty (`inlineParams.ts:13-16`). There **is** a separate internal parameter model on `Processor` (`include/element/processor.hpp:145-156`, `src/engine/processor.cpp:945-965`) — **but Codex verified it is NOT RT-safe as-is:** `Parameter::setValueNotifyingHost()` → `setValue()` then takes a `ScopedLock` on `listenerLock` (`src/engine/parameter.cpp:21-25,59-73`), and the default `RangedParameter` stores a plain float. So the internal path is a *lockful* notify, not a drop-in lock-free substrate. **B-1 is therefore a SUBSTRATE DECISION, not just a round-trip proof** — the §1.6 spike must pick one of THREE mechanisms with this lock finding cited:

- **(i) AudioProcessor shell** — wrap/extend the built-in `Processor` so it owns a real `juce::AudioProcessor` (or `AudioProcessorValueTreeState`) whose `getParameters()` the existing host enumerator (`buildNodeParametersJson`) already reads. Most JUCE-idiomatic; `AudioProcessorParameter::setValue` is atomic-float (lock-free); gets host automation for free. Cost: invasive per pure-`Processor` node.
- **(ii) New atomic bridge** — expose node-param metadata + a lock-free atomic setter through `buildNodeParametersJson`, bound directly to existing atomic node state, without a full `AudioProcessor`. Minimal JUCE plumbing; no host-automation; new setter protocol.
- **(iii) Hardened internal-param path** — make `Processor::Parameter`/`RangedParameter` RT-safe (replace the `ScopedLock` notify with a lock-free atomic write + deferred listener notify off the audio thread) and standardise on it. Leverages existing control-port concepts; requires hardening the lockful path FIRST before it's safe.
  - **B-1 Real param surface on built-ins (mechanism (i), (ii), or (iii) — the spike decides).** The *existing* validated knob/toggle face infra (`inlineParams.ts:158-173`, `validateInlineFace`) lights up with **zero webview changes** the moment a node exposes real, validated params (whether via a JUCE `getParameters()` shell, the atomic bridge, or the hardened internal path). Pros: webview already built+tested; honest; one face protocol. Cons: the substrate work above — real C++ per node; the param-WRITE path must be lock-free (contract below).
  - **B-2 Generalised custom bridge protocol** extending `elementNodeSetIntMode` as a *parallel* system. Pros: precedent exists. Cons: if built as a *second* face consumer it doubles surface on both sides of the bridge (the face infra is already built against the real-param shape); more "fake"-drift surface. *(Note: mechanism (ii) above is the disciplined version of this — a real lock-free setter feeding the EXISTING face infra, not a parallel face system.)*
  - **B-3 Hybrid (CHOSEN).** A real param surface (spike picks (i)/(ii)/(iii)) where a node has genuinely-continuous automatable state; keep `setIntMode` for the discrete op-choosers (compare/logic) that are genuinely enum-not-param. Pros: minimal churn (choosers already ship), real params only where real, honest by construction. Cons: two code paths — but they're already two paths today.

    > **Pick: B-3 (hybrid); the §1.6 spike selects the substrate mechanism with the lock finding cited.** Rationale: the chooser path is already live and correct; forcing compare/logic ops into fake "params" would *violate* nothing-fake. New continuous controls (envFollower attack/release, future LFO rate/depth) get a **real, validated, lock-free** param surface. Invalidate B-2-as-parallel-system: a second face consumer is parallel-implementation debt; if the bridge route (ii) wins, it must feed the existing face infra, not a clone of it.
    >
    > **Lock-free param-WRITE contract (mandatory, per CLAUDE.md RT rules; sharpened iter-3 E4).** Reads are message-thread (atomic — fine). The knob→engine *write* must hand the value to the audio thread with **no lock and no allocation**. **Codex-verified hazard:** the internal `Parameter::setValueNotifyingHost` currently takes a `ScopedLock` (`parameter.cpp:21-25,59-73`) — so mechanism (iii) is NOT usable until that notify is made lock-free (atomic write + deferred off-thread listener notify). Mechanism (i) gets this free (`AudioProcessorParameter::setValue` = atomic float). Mechanism (ii) must hand-build the lock-free setter (the established `std::atomic` pattern — same discipline as the render-op swap and `std::atomic<MidiOutput*>` in CLAUDE.md). **The spike's deliverable INCLUDES proving the chosen write path is lock-free; "atomic reads" alone is insufficient.**
    >
    > **Degrade path (mandatory).** A built-in whose param-write cannot be made lock-free for a given control **falls back to chooser/readout-only and drops off the Wave-3 candidate list** — it never ships a fake or non-RT-safe knob. This is the per-node escape hatch.
    >
    > **Estimate re-examination.** Because B-1 is "create a param surface where none exists" (not "add a layout") AND the only pre-existing internal param path is lockful, per-node cost is higher than iter-1 assumed. Wave 3 = **4-6 sessions**; the §1.6 spike picks the mechanism and calibrates true per-node cost before the rest are scheduled.

#### C. Project save/recall model (Feedback #4b)

- **C-1 Surface existing autosave + in-app recall shelf (CHOSEN).** Autosave already exists (`sessionservice.cpp:337-372`) but only fires once a file exists; recents already feed the Projects tab (`nativeSession.ts:57-67`, `ToolPalette.tsx:264-288`). Make saving silent-after-naming, fix the "no autosave until first save" gap, and build an in-app recall shelf. Pros: ~days not weeks; reuses proven plumbing; no format risk. Cons: still needs *one* name on first save (mitigated by an inline prompt, not an OS browser).
- **C-2 Full document-model rewrite.** New project container, dirty-tracking, versioned snapshots, in-app browser. Pros: clean long-term. Cons: weeks of work, format-migration risk, blocks every other wave. Invalidated for this program (deferred).
  
  > **Pick: C-1.** Rationale: Principle 3. The capability is 80% there; the friction is purely UX surfacing + closing the new-board autosave gap.

#### D. VST3/AU dedupe location (nav feedback)

- **D-1 Native list filtering (CHOSEN)** in `buildPluginListJson()` (`element_webview_host.cpp:6492-6556`). Group/suppress AU rows that duplicate a VST3 (same manufacturer+name), emit a `variants` (structured `var` array — never a concatenated escaped string) + a primary row. Pros: single source of truth, smaller payload (helps the "search is slow" payload size), every consumer (QuickAdd + sidebar) benefits automatically. Cons: C++ change + rescan semantics (resolved below).
- **D-2 Webview grouping** in `usePluginBrowserStore.ts`. Dedupe client-side. Pros: no C++; fast to iterate. Cons: full ~2000-row payload still crosses the bridge (doesn't help payload-size half of "slow"), and every consumer must re-implement the grouping; drifts from native truth.
  
  > **Pick: D-1, constrained to a PRESENTATION-ONLY filter over the JSON view.** Rationale: it shrinks the payload and gives one truth for both QuickAdd and the sidebar. The "convert to AU" request becomes a reveal of the suppressed variant (Question 2).
  > 
  > **Session-load compat hard constraint (iter-2).** D-1 **must never mutate `KnownPluginList` or any saved plugin identifier.** Saved `.elg` projects reference plugins by `desc.createIdentifierString()` (`:6513`) and the engine resolves that identifier independently of the *list* — so existing AU-referencing projects still load. The dedupe is a pure view filter at JSON-build time. The "also available as AU" reveal **must let a NEW drop pick the AU variant** (its real identifier), because a user may rely on the AU's distinct latency/behaviour vs the "same" VST3.
  >
  > **Alias-aware grouping (iter-3, Codex E2 — presentation-only is NOT enough on its own).** Favorites/recents/usage are keyed by **exact identifier** in both native and webview state (`usePluginBrowserStore.ts:71-178`, `QuickAddPopup.tsx:523-599`, `usePaletteFilters.ts:42-53`). If D-1 simply hides the AU row, a **starred or recently-used AU silently disappears** from Favorites/Recents (its identifier no longer maps to any visible row). So the group must carry alias semantics. Adopt Codex's model, **precomputed native-side in the snapshot** (no per-keystroke alias expansion in QuickAdd):
  > ```ts
  > type PluginGroup = {
  >   primaryId: string          // VST3 identifier (the shown row)
  >   aliases: string[]          // all variant identifiers incl. the AU
  >   variants: VariantMeta[]    // {format, identifier} per variant (structured var)
  >   usageCount: number         // AGGREGATED across aliases
  >   isFavorite: boolean        // any alias starred
  >   recentRank: number | null  // best (lowest) alias rank
  > }
  > ```
  > Favorites/Recents/usage-ranking then operate on the **group** (star any alias ⇒ group starred; the group surfaces in Recents if any alias is recent). This preserves the existing identifier-keyed UX without orphaning starred AUs. Grouping stays O(n log n) over the plugin list; the metadata ships in the snapshot so consumers never re-group per keystroke (Codex perf note §5).
  >
  > **Rescan semantics (resolved).** Dedupe + group metadata are recomputed every time `buildPluginListJson()` runs (it iterates the live `getKnownPlugins().getTypes()`), so: (a) a rescan re-collapses variants from the fresh list — no stale state; (b) a newly-scanned AU for a plugin that already has a VST3 joins the existing group's `aliases`/`variants` on the next build; (c) a newly-scanned VST3 for a plugin previously AU-only promotes VST3 to `primaryId`. No persisted dedupe table exists to drift.

---

## 1.5 Traceability Matrix (coverage proof — every input mapped)

**Source of truth for the backlog:** `.omo/ULTRAQA-EVIDENCE-2026-06-06.md` "New defects logged this audit (next wave backlog)" + the T-row residuals. If a row is not here, it is not covered.

### Glen feedback clusters → plan item → wave

| Glen feedback                             | Plan item                                                 | Wave                   |
| ----------------------------------------- | --------------------------------------------------------- | ---------------------- |
| #1 Port defaults by plugin type           | Item 1                                                    | 1 (long pole)          |
| #7-addendum Seamless insert into existing chains (Glen 2026-06-07) | Item 1b (cable-splice)                  | 2                      |
| #2a GUI morphs by zoom                    | Item 2a                                                   | 2                      |
| #2b Third-party = I/O + activity only     | Item 2b                                                   | 2                      |
| #2c Built-in Bitwig-style direct controls | Item 2c (+ B-3, §1.6 spike)                               | 3                      |
| #3a Larger / auto-resizing canvas         | Item 3a (split: W1 larger+⌘0+insert / W2 auto-fit-extent) | 1 + 2                  |
| #3b Blocks auto-arrange / self-tidy       | Item 3b                                                   | 2                      |
| #4a Drag-drop snippets/quick-access       | Item 4a                                                   | 2 (save-as) + 4 (drag) |
| #4b Automatic in-app save + fast recall   | Item 4b                                                   | 2                      |
| #4c Kill "import/file/export" jargon      | Item 4c (incl. File menu)                                 | 1                      |
| #5a Frictionless experimentation          | emergent (5b/5c + W1)                                     | —                      |
| #5b Better rename                         | Item 5b                                                   | 1                      |
| #5c Auto-complete the signal path         | Item 5c                                                   | 4                      |
| #6a Lean C++ / perf                       | Item 6a (guard)                                           | 1 + 5                  |
| #6b Predictive actions                    | Item 6b                                                   | 5                      |

### Navigation items → plan item → wave

| Nav item                                  | Plan item         | Wave |
| ----------------------------------------- | ----------------- | ---- |
| Descriptive I/O node names                | N1 (VERIFY-FIRST) | 1    |
| VST3-preferred, AU hidden + reveal        | N2 / D-1          | 1    |
| QuickAdd truncated / slow / no categories | N3                | 1    |

### ultraqa "next wave backlog" → plan item → wave (NO item dropped)

| ultraqa defect (severity)                                                                                          | Disposition                                                 | Plan item                                         | Wave       |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------- | ---------- |
| **#1 QuickAdd autofocus race (HIGH)** — first keystrokes leak as global keys, add stray blocks + auto-open editors | **ASSIGNED** (was dropped in iter-1)                        | **N3** (its own focus AC)                         | **1**      |
| #3 ⌘0 zooms instead of Fit                                                                                         | ASSIGNED                                                    | 3a                                                | 1          |
| #4 Viewport jumps on first selection                                                                               | ALREADY FIXED in perf Wave-2 (`h-8` reserve) — verify holds | 3a                                                | 1 (verify) |
| **#5 Shift+click multi-select not additive + silent group-refusal**                                                | **ASSIGNED** (was dropped in iter-1)                        | **new selection item (§2, "Selection fixes")**    | **1**      |
| **#6 ⌘D duplicate intermittent**                                                                                   | **ASSIGNED** (was dropped in iter-1)                        | **Selection fixes (sits with ⌘0 keyboard fixes)** | **1**      |
| #7 editors auto-open on add (Comparator editor = EMPTY window)                                                     | ASSIGNED                                                    | 2a/2b (no embedded editor on face)                | 2          |
| #7 QuickAdd spawn off-viewport                                                                                     | ASSIGNED                                                    | 3a (reuse positioned-insert)                      | 1          |
| #7 raw-UUID breadcrumb tabs after grouping                                                                         | ASSIGNED                                                    | 5b                                                | 1          |
| T7 Container labelled "GRAPH (NESTED)" + default name "Graph"                                                      | ASSIGNED                                                    | 5b                                                | 1          |
| #2 glyph corruption under paint storm                                                                              | RESOLVED by perf wave — monitor only                        | 6a                                                | —          |
| **T9 arrowheads not observed + faint endpoint plugs**                                                              | **ASSIGNED** (was untraced in iter-1)                       | **new "Canvas polish" item (§2)**                 | **2**      |
| **T4 decorative LR port-wells on non-audio blocks**                                                                | **ASSIGNED** (was untraced in iter-1)                       | **Canvas polish (pairs with 2a/2b face work)**    | **2**      |
| Named follow-up: LFO node (approved)                                                                               | ASSIGNED                                                    | 2c (first B-1 consumer)                           | 3          |
| Named follow-up: expose host params on built-ins                                                                   | ASSIGNED                                                    | B-3 / 2c                                          | 3          |
| Named follow-up: input-side RMS for Audio Output meter                                                             | ASSIGNED                                                    | Canvas polish / 2b                                | 2          |
| Named follow-up: per-node MIDI activity feed (split lane)                                                          | DEFERRED-with-rationale                                     | gated follow-up to 2b (see Item 2b)               | post-2     |

### iter-3 external-review deltas → plan item → wave

| External finding (source)                                              | Plan item                                  | Wave |
| ---------------------------------------------------------------------- | ------------------------------------------ | ---- |
| E1 autosave `.elg` format trap (Codex)                                 | 4b (`.els` fallback + recovery loader)     | 2    |
| E2 dedupe must be alias-aware (Codex)                                  | D-1 / N2 (`PluginGroup`)                    | 1    |
| E3 classify from real node ports, not `signalOut` (Codex)              | Item 1                                     | 1    |
| E4 internal `Parameter` notify is lockful → substrate decision (Codex) | §B + §1.6 spike                            | 3 / spike |
| E5 candidate matrix vs code truth (Codex)                              | §3 candidate table                         | 3/4  |
| E6 named-save native; drop reopen-last (Codex)                         | 4b                                         | 2    |
| E7 second insert surface `MoleculesSection.tsx:32` (Codex)             | 4a                                         | 2    |
| E8 Projects shelf `.els`-only (Codex)                                  | 4b                                         | 2    |
| U1 auto-cable the first drop (UX)                                      | Item 1 (+ Q7)                              | 1    |
| U2 reconcile SHOW/HIDE popover with faces (UX)                         | 2c (+ Q8)                                  | 3    |
| U3 rename gesture collides with dive (UX)                              | 5b (in-place, Cmd+R, not double-click)     | 1    |
| U4 QuickAdd already has favs/recents (UX)                              | N3 (scope narrowed)                         | 1    |
| U5 6b flow guardrails (UX)                                             | 6b ACs                                     | 5    |
| U6 snippet drag → W2 (UX)                                              | 4a                                         | 2    |
| U7 discoverability per affordance (UX)                                 | 3b, 5c (toolbar homes)                      | 2/4  |
| D1 design-system brief template + locked frame (Designer)              | §3                                         | lane |
| D2 density model + `InlineFaceSpec` schema (Designer)                  | Decision A + 2c                            | 2/3  |
| D3 state-transition + affordance matrix (Designer)                     | 2c, 5b                                     | 1/3  |
| D4 white terminal-block + param-collapser + motion (Designer)          | Canvas polish                              | 2    |
| D5 collapsed keeps activity well (Designer)                            | 2a                                         | 2    |
| D6 brief STATES + INTERACTION rows (Designer)                          | §3 template                                | lane |
| D7 neumorphic toggles not iOS pills (Designer)                         | 2c                                         | 3    |
| G1 two-pane QuickAdd + shape-glyph + virtualize (Gemini)               | N3                                         | 1    |
| G2 semantic colour on the single activity bar (Gemini)                 | 2b                                         | 2    |
| G3 autosave micro-indicator (Gemini)                                   | 4b                                         | 2    |
| G4 auto-fit hysteresis + smooth pan (Gemini)                           | 3a-W2                                      | 2    |
| G5 a11y: focus ring / trap keys / contrast / 44px (Gemini)             | 5b, N3, 2c, Canvas polish                  | 1/2/3 |
| G6 optimistic UI (dashed cables / drop spring) (Gemini)                | 5c, 4a                                     | 2/4  |
| X1 collapse persistence fork (Gemini vs internal)                      | Decision A + Question 1 (surfaced)         | 2    |

---

## 1.6 B-1 Parameter Substrate Spike (parallel gated lane — de-risks the keystone early)

**Why a lane, not a Wave-1 item (iter-2, resolving the Architect/Critic split).** The single architectural keystone Glen named — built-ins have no real params, so no on-canvas knobs — is the program's highest-uncertainty work (the nullptr-`AudioProcessor` reality, §B). Discovering its hazards in Wave 3 (session ~6-8) is dangerously late. But Wave 1 is already 8 items + Stitch kickoff; jamming a hard JUCE/RT discovery into it risks blowing the visible-wins reinstall gate Glen's motivation depends on. **Resolution: run a tiny spike as its own gated lane PARALLEL to Wave 1 (like the Stitch lane), framed as a spike — not a shippable feature.**

- **Primary deliverable = a SUBSTRATE DECISION (iter-3, Codex E4), not just a round-trip.** The spike must choose between the three mechanisms in §B — **(i) AudioProcessor shell · (ii) new lock-free atomic bridge feeding the existing face infra · (iii) hardened internal-`Processor::Parameter` path** — and record the choice with the verified lock finding cited (`Parameter::setValueNotifyingHost` takes a `ScopedLock`, `parameter.cpp:21-25,59-73`, so (iii) is unusable until that notify is made lock-free).
- **Round-trip proof (the demonstration):** prove ONE real param on ONE built-in round-trips set→engine→snapshot-echo through the *already-built* `validateInlineFace` path (a one-line `INLINE_FACE_REGISTRY` entry, `inlineParams.ts:119`, generic deck fallback). NO Stitch dependency (styling ≠ capability).
- **What it calibrates:** the chosen mechanism, the true per-node cost, and whether the **lock-free write** holds — feeding the Wave-3 estimate (4-6 sessions) before the rest are scheduled.
- **Degrade outcome:** if no mechanism yields a lock-free write on the chosen node, that finding reshapes Wave 3 (degrade-path nodes drop to chooser/readout) BEFORE the dependent sequencing commits.
- **Gate (spike):** mechanism chosen + lock finding cited; set→measurable engine change→snapshot echo demonstrated on one node; **lock-free write proven** (no audio-thread alloc/lock); per-node cost recorded. Does NOT gate Wave-1 reinstall — a spike slip never drags the visible-wins gate.
- **Concurrency note:** this lane + the Stitch lane both run alongside Wave 1. They share the single serialized live-verify actor — the spike's "engine round-trip" check is a ctest/headless measurement (`cli-anything-element`), not a GUI drive, so it does not contend for the one live-app actor with N1's GUI capture.

---

## 2. Per-Item Design (mapped to file:line)

> Legend: **WV** = webview (force-bundle + reinstall to test), **C++** = native (full rebuild), **VERIFY-FIRST** = must live-confirm the symptom before coding.

### Item 1 — Port Defaults (Feedback #1) · Wave 1 · **LONG POLE (two-site C++ surface)**

**Symptom/goal:** Boards & presets should default to the I/O appropriate to the hosted plugin: MIDI fx → MIDI in/out; instrument → MIDI in + audio out; etc.
**Verified facts — TWO graph-builder sites, not one (iter-2 correction):**

1. `EngineService::addGraph()` (`engineservice.cpp:294-298`) creates a new Board via `Graph::create(name, numAudioIns, numAudioOuts, true, true)` — **all 4 IO unconditionally**. `Graph::create` (`graph.cpp:10-42`) builds only **ports** from those flags.
2. **`node.cpp:182-200` is a SECOND graph builder** that hardcodes 6 ports (Audio In 1/2, MIDI In, Audio Out 1/2, MIDI Out) **AND creates the four real IO *child nodes*** — it loops `types = {"audio.input","audio.output","midi.input","midi.output"}` and adds each as a child `Node` in the graph's nodes ValueTree. `graph.cpp::create` does NOT create these child nodes — only this path does. **Per-Block IO provisioning must interact with this IO-*node* path, not only the port flags.** Provisioning ports without the matching IO child nodes would leave the Board with port stubs and no actual IO endpoints to cable to.
   A new empty Board can't know its future plugin, so the *Board* default (all-IO superset) is fine. The real ask is **per-Block**: when the first Block is dropped into an empty Board, the auto-created surrounding IO *child nodes* should reflect that block's capabilities — **and be pre-cabled to it** (U1, below).

   **Classification source-of-truth (iter-3, Codex E3 — corrected).** Do **NOT** classify from the `signalOut` UI heuristic (`element_webview_host.cpp:6516-6534`): Codex verified it is a `PluginDescription`-only inference that **misclassifies internal MIDI nodes** — `element.midiTranspose` and `element.midiVelocityAmp` don't set a MIDI category, so `signalOut` tags them `"value"`, which would provision the wrong board IO. Instead classify from the **real instantiated node's ports / processor capabilities** (the actual audio/MIDI/CV in/out counts on the created node), which is correct for internal nodes, third-party plugins, and snippets alike. **Scope (Codex):** smart defaults apply to **internal Element nodes + snippets too**, not just scanned third-party plugins — same engine provisioning path.
   **Approach:**
- C++: define a single pure classification helper — node → {needsMidiIn, needsMidiOut, needsAudioIn, needsAudioOut} — derived from the **instantiated node's real port/capability set**, not the UI snapshot.
- At first-Block insertion into an **empty** Board, drive **both** the port set (graph.cpp flags) **and** the IO-child-node creation (`node.cpp:182-200` path) from that classification, so a sampler-instrument gets a MIDI In node + Audio Out node (and matching ports), a MIDI fx gets MIDI In + MIDI Out, an EQ gets Audio In + Audio Out.
- **Auto-cable the first drop (iter-3, UX U1 — the actual "instant sensible start").** Provisioning the right ports is not enough: an expert who drops a synth into an empty board and gets correctly-typed-but-**unconnected** IO still has to draw 2 cables — the friction Item 1 exists to remove. The mechanism exists — `nativeGraphAddPluginConnected(identifier, x, y, originNodeId, originPortId, originIsSource)` (`nativeGraph.ts:31-48`) — and/or composing `elementGraphConnect` per cable. Wire MIDI In → synth → Audio Out (by signal type) so the dropped instrument **makes sound immediately**. Cables are real, undoable ops. (Glen Q7 — recommend auto-cable.)
- Keep the all-4 superset whenever the Board is already non-empty / mixes types.
  **C++/WV split:** C++ (port flags + IO-child-node provisioning + auto-cable at insert); WV reflects the snapshot.

**Item 1b — Cable-splice insertion (Glen Q7 addendum, 2026-06-07: "adding blocks into existing wires/chains needs to be seamless") · Wave 2.**
Dropping/inserting a block ONTO an existing cable splices it into the chain: `A→B` becomes `A→new→B`.
- **Gesture:** dragging a block (from QuickAdd drop, snippet-shelf drag, or an existing block on the canvas) over a cable highlights that cable (reuse the selection-glow language); releasing splices. Type-gated: the cable only highlights if the block has a type-compatible input AND output for that signal (an audio cable won't highlight for a MIDI-only block) — NOTHING-fake: no fake drop targets.
- **Mechanism (compose existing natives — no new bulk native):** disconnect `A→B` (`elementGraphDisconnect`-equivalent path), connect `A→new` + `new→B` via `elementGraphConnect`; the three ops group as one undoable action (compound undo, same pattern as T10 grouping).
- **WV:** cable hit-testing during drag (React Flow edge proximity), highlight state, drop handler. **C++:** none expected beyond existing connect/disconnect natives — verify a disconnect native exists (the context-menu Disconnect path implies it).
- **Acceptance:** dragging a compatible block over a cable highlights it; dropping splices (A→new→B), original cable gone, both new cables real + the action undoes as ONE step; an incompatible block never highlights the cable; works from QuickAdd-drop, snippet-drag, and moving an existing unconnected block.
  **Risk:** two-site surface + classification-from-real-ports + auto-cable → the long pole of Wave 1. If it slips, it slips the Wave-1 reinstall gate (all items reinstall together). Gate behind "Board is empty" so we never strip IO from a populated Board.
  **Rollback/degrade:** if per-Block provisioning or auto-cabling proves unsafe for any node class, fall back to the current all-4 default + no-auto-cable for that class (no regression — today's behaviour) and ship the rest. Auto-cable and provisioning are separable: provisioning can ship even if auto-cable is deferred for a class.
  **Acceptance:** dropping a sampler into an empty Board yields exactly {MIDI In node, Audio Out node} with matching ports, **pre-cabled MIDI In→synth→Audio Out, producing an audible default path** (real `elementGraphConnect` ops, undoable); a MIDI router yields {MIDI In, MIDI Out}; an EQ yields {Audio In, Audio Out}; a mixed Board keeps all 4; an internal `midiTranspose` classifies as MIDI (not value) and provisions MIDI IO. A new ctest covers the capability-classifier (incl. the internal-MIDI-node case) AND asserts the correct IO *child nodes* + cables exist after insert.

### Item 2 — GUI / Module Focus (Feedback #2a/2b/2c)

**2a — Kill zoom-driven GUI morphing + ship the collapse tier (WV · Wave 2).** Remove `zoomToTier`/`ZoomTier` swap behaviour (`useGraphStore.ts:120-136`); blocks render at one **content-driven (A-1) height** and zoom only scales them. **Add the collapse tier (Decision A combined model, iter-3 Designer D2):** the *compact* layout is a user-collapsed state (header + activity well ≈84px), not a zoom artifact — medium/large are A-1 auto-height. **Persistence LOCKED (Glen Q1): persisted per-node boolean in the Board ValueTree, write-on-click, joins the idle-gate — a collapsed layout survives reopening.** **D5 — the collapsed state KEEPS the activity well** (never "name + dot" — dropping the live-signal contradicts the lean block and NOTHING-fake's spirit). **Absorbs ultraqa defect:** editors-auto-open-on-add is partly this (expanded tier mounts heavy faces). **Risk:** BlockEmbed (`BlockEmbed.tsx:82-200`, stereo meter + 28-bar FFT) is the heaviest face — must stay perf-guarded; spectrum strip only where a real audio block warrants it. **Acceptance:** zooming never swaps a block's control set; a block can be collapsed to header+activity-well and re-expanded; collapsed state shows real activity (not a dead dot); a vitest asserts `zoomToTier` is gone and block content is zoom-invariant.
**2b — Third-party plugins = I/O + ONE honest activity bar (WV · Wave 2).** For non-built-in nodes, render a fixed card: name, category dot/shape, real I/O ports, and **a single activity bar driven by the existing per-node `level` scalar**. No embedded editor on the canvas face. **Absorbs ultraqa defects:** "Comparator editor = EMPTY window", auto-open editors (#7).

> **NOTHING-fake — the conflated-scalar trap (iter-2 correction).** The engine exposes exactly ONE per-node activity float via `nodeOutputLevel` (`element_webview_host.cpp:6343-6375`, pushed in `buildNodeMetersJson`): it returns audio RMS if the node has audio outputs, **ELSE `0.75f` if `hasMidiOutputActivity()`**, ELSE the loudest CV peak. An audio-output node's RMS *wins the branch* — so its MIDI activity is never separately surfaced. Therefore **we MUST NOT render a dedicated audio-VU AND a separate MIDI LED on the same card** — that would fabricate a two-lane distinction the engine doesn't expose. The card shows ONE honest activity bar off `level` (which already encodes MIDI activity for MIDI-only nodes, so a MIDI router/fx still lights up — not falsely dark). This is real and shippable in Wave 2 with **no** C++ change.
> **Semantic colour on the single bar (iter-3, Gemini G2 — NOTHING-fake compliant).** The bar's **magnitude stays the honest conflated `level` scalar**, but its **colour** is set by the node's primary signal classification using the real signal tokens — Audio `#4A90D9` / MIDI `#2BC4C4` / CV `#E8A838`. The colour is real metadata (the node's signal type), not a fabricated second lane; it answers "is this block passing audio or MIDI?" without faking a separate feed. This is the design fix for "a bare bar that jumps tells you nothing" (Gemini + Designer) while honouring the one-scalar reality.
> **Deferred split-lane follow-up (gated, post-Wave-2).** A genuinely separate audio-VU-vs-MIDI-activity *magnitude* display requires a NEW per-node split snapshot field (e.g. `hasMidiOutputActivity` as a distinct boolean alongside `level`) pushed from C++ FIRST. Until that field exists, no face shows a separate MIDI *magnitude* lane (colour-coding the single bar is fine and ships in W2). (This is the "per-node MIDI activity feed" named follow-up — DEFERRED in §1.5, sequenced before any split-lane face.)
> **Acceptance:** a Valhalla VST3 shows only I/O + a single live activity bar that moves with its audio, reads 0 when silent, and is **coloured by its signal type (blue=audio)**; a MIDI-only third-party node shows the same bar lighting **teal** from MIDI activity; **no card renders two independent audio/MIDI magnitude indicators off the single scalar**; double-click still opens the plugin's native editor in a window (unchanged), it just isn't embedded on the face.
**2c — Built-in direct controls, Bitwig-style (C++ + WV · Wave 3, the headline).** Depends on Decision B-3 (substrate chosen by the §1.6 spike — see §B) and on the spike having proven the lock-free write. Give built-ins a real, validated param surface for continuous controls; the existing face infra (`inlineParams.ts`, `validateInlineFace`) renders them. Compare/logic stay chooser-only (already shipped). **Degrade path:** any node whose param-write can't be made lock-free drops to chooser/readout-only and off the candidate list. **Candidate list + briefs:** see §3 — a face ships only after its brief is ACCEPTED. **Perf:** any new per-node param/snapshot field joins the `meterlanegate` idle-gate epsilon pre-pass (Item 6a).

> **U2 — reconcile with the EXISTING per-param SHOW-ALL/HIDE-ALL popover (iter-3; Glen Q8 ANSWERED).** A per-parameter *exposure* surface already ships (`InspectorHub.tsx`, `param-config-popover.png`). Wave 3 must NOT ship a *second* parameter-visibility system. **Resolution locked (Glen, 2026-06-07):** ONE curation model — the `inlineParams` registry is the **default** set shown on a face; the SHOW/HIDE popover is the user's curation layer over the *real* params — **but the popover is DEMOTED to the block's contextual menu** (right-click → "Choose face controls…"), not prominent chrome. Glen: "the core needs to be stripping down and simplifying/unifying the blocks, and adding direct UI controls to the blocks which suit it" — the curated default faces carry the experience; curation is an expert escape hatch in the context menu. A param can only be toggled "IN" if it is a real validated param (NOTHING-fake).
> **D2 — `InlineFaceSpec` density-variant SCHEMA change (iter-3, Designer).** The face spec (`inlineParams.ts:76`) maps identifier→entries[] with **no density/layout field today** — so a face can only ever be ONE size. Add a density-variant schema (e.g. `densities: { compact, medium, large }`, or a per-entry density-visibility flag) so a single face can deserialize the three Stitch layouts. Without this, "three layouts per component" is unbuildable. This is the data structure the Stitch layouts (D1 template) deserialize into.
> **D3 — collapse transition + affordance matrix (iter-3, Designer — currently absent).** (a) **Pick the compact↔medium/large transition:** the locked motion rule (`index.css` "transition box-shadow + background only — never size") means a naive height animation violates it AND risks React Flow re-measure mid-frame (Architect E3). Choose either **snap** (honest, perf-safe, matches the rule — recommended default) or **transform-based clip-reveal** on the body with reserved space (the perf-wave `h-8` reserve trick extended to the body; never layout width/height). (b) **Affordance matrix** {rest / hover / active / focus / disabled} × {knob, toggle, label-edit, port, collapse-chevron}, each mapped to a token treatment (micro-glow, inset, hue) — otherwise the controls ship looking dead/undiscoverable.
> **D7 — inline toggles = neumorphic pressed/raised switch** (the `.neu-pressed` recipe), NOT iOS-style pills (the most generic element in the system today).
> **G5 — a11y on the new controls:** visible high-contrast focus ring (not shadow-only); knob/value targets ≥44px hit area (invisible padding ok); dimmed/inactive params keep ≥4.5:1 text contrast against the dark chassis.

**Acceptance:** the accepted Wave-3 candidate built-ins show working on-canvas controls that round-trip the engine (set → measurable change → snapshot echo) with a **lock-free write**; the SHOW/HIDE popover controls which real params appear on the face (one curation system); `InlineFaceSpec` carries density variants so a face renders compact/medium/large; toggles are neumorphic; `validateInlineFace` falls back to the generic deck for anything not yet curated.

### Item 3 — Canvas & Auto-Arrangement (Feedback #3a/3b)

**3a — split across two waves (iter-2):**

- **3a-W1 — Roomier canvas + correct insert/fit (WV · Wave 1).** Increase the default React Flow viewport/extent so a fresh Board feels roomy; make ⌘0 = Fit (ultraqa #3); make generic QuickAdd insert land in-viewport at the cursor by reusing the positioned-insert path `nativeGraphAddPluginConnected(identifier, x, y, …)` (`nativeGraph.ts:31-48`) instead of the off-viewport top-right path (ultraqa #7); verify the perf-Wave-2 viewport-jump fix (reserved `h-8` strip) still holds (ultraqa #4). **Acceptance:** new Board shows a noticeably larger working area; ⌘0 fits all blocks; QuickAdd inserts at the cursor in-viewport; no viewport jump on first selection.
- **3a-W2 — Auto-fit extent to block bounds, with hysteresis (WV · Wave 2).** Auto-fit the translateExtent to block bounds as blocks are added. **Deferred to W2 deliberately** because it interacts with A-1 variable-height nodes — doing it before A-1 lands would churn. **G4 hysteresis (iter-3, Gemini + UX + the prior viewport-jump lesson):** the extent expands ONLY when a block lands within an outer ~100px padding band, and it pans via the existing `@xyflow/react` smooth transition — **never an instantaneous jerk**, and never while a cable is being dragged near the edge. **Acceptance:** the canvas extent tracks the block bounding box smoothly (hysteresis band, animated pan); no viewport jerk on add or on edge-drag.
  **3b — Blocks auto-arrange / self-tidy (WV · Wave 2).** Auto-layout already exists (`autoLayout.ts:59-189`, Sugiyama-lite) but is only invoked via context menu. Add a one-press "Tidy" action (toolbar + ⌘-shortcut) and an "auto-tidy on add" toggle — **ON BY DEFAULT (Glen Q3, 2026-06-07: "yes and on by default", overriding the off-by-default recommendation; "blocks should clean themselves up instinctively")**. Add snap-to-grid (absent in webview today). **No-fighting-the-user constraints (mandatory, since it's ON):** (a) auto-tidy fires only on ADD (a debounced relayout after a new block lands), NEVER on a user's drag — a deliberately moved block is never yanked back; (b) the relayout **animates** (transform glide, D4), never teleports, so the user tracks what moved; (c) the toggle is discoverable next to Tidy in the toolbar (U7) so it's one click to disable; (d) a manual drag DURING the debounce window cancels that relayout pass. **Acceptance:** "Tidy" relayouts the current Board via the existing algorithm; auto-tidy is ON by default — adding a block triggers a debounced animated relayout; dragging a block never triggers relayout and cancels a pending one; the toggle turns it off; snap-to-grid aligns dragged blocks.

### Selection fixes (ultraqa #5 + #6, were dropped in iter-1) · Wave 1

**Symptom/goal:** three live keyboard/selection defects that corrupt the board or break expectations, co-located with the Wave-1 keyboard work.

- **QuickAdd autofocus race (HIGH, ultraqa #1) — see N3** (lives in the same `QuickAddPopup` rebuild; tracked under N3 with its own focus AC).
- **Shift+click multi-select not additive (ultraqa #5).** Shift+click should ADD to the selection; today it replaces. **Acceptance:** Shift+click on a second block keeps the first selected; a vitest asserts additive selection.
- **Silent group-refusal (ultraqa #5).** When a group/Container operation is refused, the user gets no feedback. **Acceptance:** a refused group action surfaces a visible reason (toast/inline), never silent.
- **⌘D duplicate intermittent (ultraqa #6).** First ⌘D duplicates once, subsequent presses inert. **Acceptance:** ⌘D duplicates the current selection reliably on every press; a vitest covers repeated invocation.
  **C++/WV split:** WV (selection state + keyboard handling in `useKeyboard`/`GraphCanvas`); duplicate may touch the native duplicate path — verify.
  **Rollback/degrade:** each is independent; any one can ship or defer without blocking the others.

### Canvas polish (ultraqa T9 + T4, were untraced in iter-1) · Wave 2

**Symptom/goal:** visual residuals seen live, paired with the 2a/2b face work so they're fixed in the same canvas pass.

- **Arrowheads not observed + faint endpoint plugs (ultraqa T9).** Cable redesign shipped bezier but arrowheads weren't visible at audit zoom and endpoint plugs are faint. **Acceptance:** cable direction arrowheads are visible across the standard zoom band; endpoint plugs read clearly **at ≥4.5:1 contrast (G5)**. **Perf constraint:** must NOT reintroduce per-tick inline painter styles on Cable (perf-wave guardrail vitests enforce) — use the established class-based approach.
- **Decorative LR port-wells on non-audio blocks (ultraqa T4).** Stereo port-wells render on blocks with no audio I/O. **Acceptance:** port-wells render only where a real audio port exists; non-audio blocks don't show decorative wells (NOTHING-fake — no port chrome without a real port).
- **White terminal-block neumorphic violation (iter-3, Designer D4 — net-new, unowned today).** The flow-debug `Out`/`In` terminal blocks render as **flat pure-white (`#FFFFFF`) cards with a single drop shadow** — no token surface, no paired soft shadow, pale text on white. This is the single most off-system element on the canvas (violates "one continuous dark chassis"). **Acceptance:** terminal blocks re-skinned to the dark token surface (`#252529` + `.neu-raised` paired shadow), text legible at ≥4.5:1; visually of-a-piece with every other block.
- **Param-port collapser as the dense-node default (iter-3, Designer D4).** The lean block's `▸ N params` collapser (hides the param port-list behind a pill, shows only In/Out) must be the **default collapsed state for dense nodes**, or A-1 auto-height regresses long port lists into the unreadable `A-tiers` mono-11px wall. **Acceptance:** a dense node defaults to In/Out + a `▸ N params` pill; expanding the pill reveals the full param port-lane.
- **Signature motion for auto-complete + tidy (iter-3, Designer D4 + Gemini G6 — transform-based, guardrail-safe).** The two best memorable-motion moments in the program: **(a) auto-complete (5c)** cables **animate drawing in** (reuse the existing dashed-cable language); **(b) Tidy (3b)** blocks **glide** to their new positions (CSS transform on node position — NOT layout, NOT per-tick painter styles). **Acceptance:** auto-completed cables draw in (not teleport); Tidy animates block movement via transform; perf guardrails stay green.
- **Input-side RMS for Audio Output meter (named follow-up).** The Audio Output node's meter should read its input RMS. **Acceptance:** the Audio Output meter moves with the signal reaching it, reads 0 when silent (real data).
  **C++/WV split:** mostly WV (Cable + Block + terminal-block render); input-RMS may need the existing input-level read path — verify it's already pushed.

### Item 4 — Workflow & Snippets (Feedback #4a/4b/4c)

**4a — Drag-and-drop snippets/quick-access (mostly WV · all in Wave 2 now, iter-3 U6).** Molecule infra exists and the `SnippetShelf` component **already exists**. **The native handler is NOT broken (iter-2 correction):** `elementMoleculeInsert` (`element_webview_host.cpp:3412-3454`) **correctly** writes `tags::x/y` per node from its `insertX/insertY` args (default 100,100), and `nativeMoleculeInsert(name, x, y)` already exists (`nativeGraph.ts:321`). **TWO hardcoded insert surfaces (iter-3, Codex E7):** `SnippetShelf.tsx:18` hardcodes `nativeMoleculeInsert(name, 120, 120)` AND `MoleculesSection.tsx:32` inserts at a second hardcoded point. **Fix both** + define ONE canonical non-cursor default-insert policy (recommend: current viewport centre when there's no cursor/drop point — Codex non-blocking Q). (The iter-1 claim of "dead `tags::x/y` writes at host:3119-3132 / repair the x/y write path / (140,140)" was wrong — `host:3119-3132` is `elementSessionSetActiveGraph`, unrelated. Deleted.)

- (i) **Wave 2:** "Save selection as Snippet" from canvas/right-click (uses existing `MoleculeLibrary` add).
- (ii) **Wave 2:** fix BOTH hardcoded inserts (`SnippetShelf.tsx:18` + `MoleculesSection.tsx:32`) to use cursor/drop coords, falling back to the one canonical default (viewport centre).
- (iii) **Wave 2 (moved up from W4, U6):** drag-from-shelf-to-canvas, passing the drop point through the same `nativeMoleculeInsert(name, x, y)` arg — it reuses the identical insert path the (ii) fix touches, so it costs little marginal work and **completes the capture→reuse loop in one wave** (instead of splitting drag ~5-9 sessions later). **G6 latency-mask:** the dropped snippet blocks animate in with a fast (~150ms) scale-up spring (transform-based, guardrail-safe) to mask C++ instantiation latency.
  **Acceptance:** select 3 blocks → "Save as Snippet" → appears in the shelf → click-insert lands at the cursor/centre (not 120,120) → **drag onto canvas inserts at the drop point** as real connected blocks, with a 150ms scale-up; neither insert surface uses a hardcoded coordinate.
  **4b — Automatic in-app saving + fast recall (C++ + WV · Wave 2).** Decision C-1. **Verified:** autosave is wired (`startAutosave()` at `sessionservice.cpp:45`, 60s timer); `timerCallback` (`:360-372`) early-returns if `!hasSessionChanged()` AND if `! sessionFile.existsAsFile()` (`:366-367`) → a never-saved Board is never autosaved.

> **E1 — autosave FORMAT TRAP (iter-3, Codex, code-verified — HIGH, was a latent recovery bug).** `getAutosaveFile()` (`:348-358`) writes session content under a **`.elg`** name (`name.autosave.elg` / `autosave_<ts>.elg`). But `openFile()` (`sessionservice.cpp:87-122`) treats **`.elg` as graph-IMPORT, not session-load**, and `elementSessionOpenPath` (`host:3090-3107`) **only accepts `.els`** (SessionDocument is `.els`, `sessiondocument.cpp:9-10`). So the iter-2 plan ("remove the guard, route through the existing fallback") would have produced **recovery files the app cannot load as sessions.** Fix: autosave/recovery files must be **`.els`** (session format), plus an explicit recovery load path. Codex `getAutosaveFile()` shape:
> ```cpp
> File SessionService::getAutosaveFile() {
>   if (sessionFile.existsAsFile()) return sibling("name.autosave.els");
>   return defaultSessionDir()/("autosave_" + timestamp + ".els");
> }
> ```
> Plus: an explicit "recover newer autosave" loader that treats the autosave content as session XML (regardless of how the open path branches on extension).

Plan: (i) **remove the `:366-367` early-return** and route first-run autosave through the corrected `.els` fallback + recovery loader (E1); (ii) make Save silent after naming — **needs ONE new native (E6):** `elementSessionSave`/`SaveAs` still call interactive `FileBasedDocument` choosers, so "inline first save, no OS browser" requires a new named-save / save-to-path native (it is NOT achievable by reuse); (iii) build an in-app recall shelf from `nativeSessionListFiles` (`nativeSession.ts:57-67`). **E8:** the host file scan returns `.els/.elg/.eln/.elpreset/.elc` but only `.els` opens via `elementSessionOpenPath` → the **Projects shelf shows `.els` sessions only** (filter the scan to `.els`, or the shelf lists files it can't open). (iv) **REMOVED from scope (E6):** "wire reopen-last-session" — `openLastUsedSessionKey`/`lastSessionKey` is already wired; don't re-do it.

> **G3 — autosave micro-indicator (iter-3, Gemini + UX, for silent-save trust):** on a successful autosave, a subtle non-modal cue near the project name (soft pulse / a checkmark that fades in ~2s). Never a dialog. This is what makes "silent" trustworthy instead of anxiety-inducing.
> **Honesty notes (iter-2):** (a) **Autosave is orthogonal to undo** — autosave is a whole-file snapshot (`:370`); undo is in-memory ValueTree. Silent autosave does NOT create undo boundaries and Cmd+Z is unaffected. (b) **Recovery guarantee is "within the last autosave (≤60s)," not "everything."**
> **Untitled-session restore is MANDATORY (Glen Q4, 2026-06-07: "autosave should still restore an untitled session").** A session that has NEVER been named/saved is autosaved (`autosave_<ts>.els` via the corrected fallback) and is **fully restorable** — on relaunch after a crash/quit, the newest untitled autosave is offered for recovery (and appears in the recall shelf as "Untitled — recovered"). Protection requires zero user action, zero naming.
> **Acceptance:** create a Board, make a change, wait past one autosave tick, force-quit → relaunch → work is recovered **as a loadable `.els` session** **to within the last autosave (≤60s)**; first save shows an inline name prompt (no OS dialog) via the new named-save native; subsequent saves are silent with a non-modal save-pulse; the recall shelf opens a recent `.els` session in-app; Cmd+Z behaviour unchanged.
  > **4c — Replace jargon (WV + C++ strings · Wave 1).** Replace, across BOTH native and webview:
- **The native menu-bar title "File" (`mainmenu.cpp:70`) — the exact word Glen named** — plus the `if (name == "File")` branch (`:90`) and the File submenu item strings. Replacement word per Question 6 (Glen picks — "Project"? "Element"?). *This was missed in iter-1 and is the single most-visible occurrence of "file".*
- "Import board"/"Export current board" (`guiservice.cpp:782,785`), dialog titles "Import Board"/"Export Board" (`:968,:987`).
- Toolbar "New/Open/Save/As…" (`Toolbar.tsx:224-227`), CommandPalette "Save Project"/"Open Project…" (`CommandPalette.tsx:181,188`).
  **File-menu word LOCKED (Glen Q6): "Element"** — `mainmenu.cpp:70` "File" → "Element" + the `:90` branch. Remaining fluid copy ("Bring in…"/"Send out…" for import/export) finalised in-wave. **MUST update both terminology guards** (`util/check_terminology.py` + `webview/src/__tests__/terminologyGuard.test.ts` + `terminology-allowlist.json`) when introducing new strings — including the new menu title.
  **Acceptance:** no "import"/"export"/"file" jargon in user-facing chrome **including the top menu bar**; both guards pass.

### Item 5 — Frictionless Iteration (Feedback #5a/5b/5c)

**5b — Better rename (WV + a small native · Wave 1).** Block rename is a Cmd+R modal overlay (`GraphCanvas.tsx:1069-1099` → `elementGraphRenameNode`, host `:2660`). **GESTURE COLLISION (iter-3, UX U3 — code-verified):** double-click on a block is the **shipped dive-into-Container gesture** (`onNodeDoubleClick`, `GraphCanvas.tsx:340,903`; CLAUDE.md lists "Double-click Block → Dive into nested Board" as core navigation law). So rename **must NOT be bound to double-click** — that would break dive or create a fragile label-vs-body hit-test. **Re-spec:** keep the existing **Cmd+R / Cmd+T trigger**, but replace the centered z-9999 modal with an **in-place editable label at the block's position** (the field appears over the label, not as a detached overlay). **Three distinct cases:**

- **Block:** Cmd+R/Cmd+T → in-place editable label (no modal, never double-click); reuses existing `elementGraphRenameNode`. WV-only.
- **Container:** a Container IS a node in its parent's node list → **reuses `elementGraphRenameNode`** (rename by node id). Fixes the "GRAPH (NESTED)" label + default name "Graph" + raw-UUID breadcrumb tabs (ultraqa #7 + T7). WV-only.
- **Top-level Board:** a Board is a Session graph addressed by index via `setActiveGraph`, **NOT a node id — no rename native exists** (`grep` for `RenameGraph`/`setGraphName`/`renameBoard` = zero). This case needs **ONE new native** (rename the active/indexed graph). C++ + WV.
  **G5 a11y (iter-3, Gemini + UX):** the in-place edit field **traps keys** (`e.stopPropagation()`, Enter commits / Esc reverts) so a keystroke never leaks to global transport (e.g. Space=play) — same focus discipline as the N3 autofocus-race fix; visible high-contrast focus ring (not shadow-only); rename hit-target ≥44px; the label signals editability on hover (cursor + subtle affordance) so it's discoverable.
  **Acceptance:** Cmd+R/Cmd+T opens an in-place editable label at the block (NOT a centered modal, NOT double-click — dive still works on double-click); typing never triggers a global shortcut (Enter commits, Esc reverts); a Container renames via the existing native and the breadcrumb shows the real name (never a UUID, never "GRAPH (NESTED)"); a top-level Board renames via the one new native.
  **5c — Auto-complete the signal path (WV-first + reuse existing native · Wave 4).** No global "complete path to output" exists; ghost-cable proximity suggestions do (`autoRouteSuggestions.ts`). Add an "auto-complete" action that, from the current selection/dangling outputs, **computes the cables client-side and creates them by calling the existing `elementGraphConnect` (host `:70`) per cable** — NOT a new bulk native (prefer composition). **G6 optimistic UI + Designer signature-motion (iter-3):** draw the pending cables **instantly client-side as dashed "pending" cables** (reuse the existing dashed-cable language), solidifying to real neumorphic cords as each `elementGraphConnect` resolves — the cables **animate drawing in**, never teleport. **U7 discoverability:** the action has a visible home (toolbar icon + tooltip; also command-palette entry) — an expert must be able to find it. **Acceptance:** with an instrument→fx chain whose last node is unconnected, one action connects it through to Audio Out; cables draw in (pending→solid), only type-valid cables are created (honest), each connect is undoable; the action is discoverable from the toolbar/palette.
  **5a — Frictionless experimentation** is the *emergent* result of 5b/5c + Wave-1 wins; no separate item.

### Item 6 — Performance & Predictive (Feedback #6a/6b)

**6a — C++ stays lean (Wave 1 guard + Wave 5 micro-pass).** The perf wave already did the deep dive; this program must **not regress** it. Painter guardrails + idle-render reconcile (`useGraphStore.ts:88-101`) stay. A later micro-wave may chase the remaining idle residue (CVDisplayLink vblank floor) but it's near platform floor on Intel. **Acceptance:** the existing guardrail vitests + a fresh idle/drag CPU re-measure show no regression vs `index-DQcH7wdK.js`.
**6b — Predictive/context suggestions (WV · Wave 5).** Heuristic (Glen Q5, 2026-06-07: "context-aware suggestions based on recent usage, historic plugin usage, what kind of block it's connecting from or to"): rank QuickAdd + next-action suggestions by usage frequency (`PluginUsageTracker`), **connection context** — the port/block type being connected FROM and TO (the port-typed QuickAdd already carries this; weight blocks whose I/O fits the live connection), and recency.

> **Falsifiable AC (iter-2).** The suggestion list is a **deterministic pure function `rank(history, signalContext, recency)`**. A vitest asserts: (a) identical input → identical ranked output (determinism); (b) a block matching the current signal-type context outranks an equal-frequency block that does NOT match it; (c) given identical signal-context and frequency, the more-recently-used block ranks higher. No fabricated "smart" output — every rank input is real persisted/contextual data.
> **Flow-state guardrails as AC (iter-3, UX U5 — inherit the proven ghost-cable model, which fires drag-only and never idle).** 6b is a **ranking** layer, not a proactive prompt: (1) **pull, never push** — it only re-orders surfaces the user already opened (QuickAdd list order, ghost-cable ranking); NO unsolicited popup/banner/toast/"clippy" ever appears on its own. (2) **never steals focus or keyboard** — explicit, mirroring the N3 autofocus-race fix (this bug class is live here). (3) **re-ranks, never auto-acts** — no "I connected this for you" (that's 5c, the *explicit* user-invoked version). (4) if any inline suggestion chip is shown, **Esc dismisses it and it never reflows the canvas** (perf-wave reserve-space discipline).
> **Acceptance:** the `rank()` contract passes its vitest; suggestions only re-order already-open surfaces; no suggestion surface appears unsolicited or captures the next keystroke; any inline chip is Esc-dismissable and causes no canvas reflow.

### Navigation items · Wave 1

- **N1 — Descriptive I/O node names (C++ · VERIFY-FIRST).** Code creates plain names {"Audio In 1","MIDI In",…} at TWO sites (`node.cpp:182-200` IO child nodes + names {"Audio In","Audio Out","MIDI In","MIDI Out"}; `graph.cpp:19-39` ports). **Glen's complaint doesn't match these plain strings** — he may be seeing device-derived MIDI node names or T10 auto-IO names. The capture's whole job is to disambiguate WHICH of three naming sources produced the bad label, so we rename the right strings.
  - **Mandatory capture checklist (serialized, one live actor — a GUI drive, so it does NOT overlap the §1.6 spike's headless round-trip):** launch the installed build and capture the label of (1) a fresh-Board graph IO node, (2) a **device-derived MIDI input node**, (3) a **T10 auto-provisioned IO node** (after a ⌘⇧D group-into-Container). Save a screenshot to `.omc/state/qa-wave-reports/n1-io-label-capture.png` + a one-line text note (`…n1-io-label-capture.txt`) recording each **verbatim string** and its **suspected source file:line**.
  - **Decision rule:** rename ONLY the source whose captured string matches Glen's complaint; if all three match the plain code strings, the complaint is about something else (escalate to Glen, do not rename blind).
    **Acceptance:** the capture artifacts exist with verbatim strings + suspected source per node type; the matching source is renamed to be self-evident; terminology guards updated if strings change.
- **N2 — VST3-preferred, AU hidden + reveal (C++ · Wave 1).** Decision D-1 + the **alias-aware `PluginGroup`** model (E2 — see §D). Dedupe in `buildPluginListJson()` (`element_webview_host.cpp:6492-6556`): group AU+VST3 by maker+name into a `PluginGroup` (primaryId=VST3, aliases[], variants[], aggregated usageCount, isFavorite=any-alias, recentRank=best-alias), emit the group + "also available as AU" reveal (Question 2). **Acceptance:** the list shows one row per plugin family (VST3 primary); a starred or recently-used AU is **NOT orphaned** (the group stays favourited/recent via its aliases); the reveal lets a NEW drop pick the AU's real identifier; `KnownPluginList`/saved identifiers are never mutated.
- **N3 — QuickAdd bigger + browse + faster + autofocus-race fix (WV · Wave 1; search profile + race are VERIFY-FIRST).** **Scope corrected (iter-3, UX U4 — code-verified):** QuickAdd **already renders Favorites → Recents → All in both modes** (`QuickAddPopup.tsx:847-899`, comment at `:419`). So N3 does **NOT** rebuild the fav/recents taxonomy — N3 = **(a) bigger panel + (b) category/manufacturer browse + (c) search-perf + (d) focus-race fix** only.
  - **Layout = research-decided (Glen Q9, 2026-06-07: "conduct research on how other developers handle this — decide yourself").** Competitive research artifact: **`.omc/state/qa-wave-reports/quickadd-pattern-research.md`** (Bitwig pop-up browser, Ableton browser, VCV Rack, Max/MSP, Blender Shift+A, Unreal Blueprint context palette, command-palette pattern) — its DECISION section is the binding layout spec for N3. Direction (3-reviewer consensus + research): a **drill-able visible hierarchy** (split-pane: left rail = ★Favorites / Recent / by Manufacturer / by Category; right = results), keyboard-first — NOT cascading fly-out submenus (motor friction, hover-tunnel fragility). Reuse the sidebar's existing palette IA/visual treatment (`palette/*`) for the left rail; **reuse the existing `favoriteIdentifiers`/`recentIdentifiers`/group data — add NO new fetch**.
  - **Per-row scanning + keyboard (G1 + Designer):** each result row carries its category **shape-glyph ● ▲ ◆ ⬡ + hue** (the colour-blind-safe taxonomy already in tokens — free to apply), so scanning is by shape not just text. A **visible selected-row highlight** moves with arrow keys; Enter inserts. **G5 a11y:** high-contrast focus ring (not shadow-only), ≥4.5:1 row text.
  - **Autofocus race (ultraqa #1, HIGH — the worst live defect):** on open, the first keystrokes leak to global key handlers, adding stray blocks + auto-opening editors. A **focus-management** bug, distinct from search speed. **Acceptance (its own AC):** the first keystroke after QuickAdd opens goes ONLY to the search field; **no global shortcut fires; no stray block is added.** Vitest on the focus-grab path; the field traps keys (`stopPropagation`).
  - **Search-speed AC (falsifiable):** per-keystroke filter + render of the full ~2000-row list completes in **≤16ms (one frame)** on the Intel reference machine, measured via the `sample(1)`/perf-trace method (baseline `index-DQcH7wdK.js`); **before/after numbers recorded**. **G1 virtualization:** render the first ~15 rows immediately, defer the rest, to hit ≤16ms without layout thrash.
  - **Layout AC:** QuickAdd is a two-pane browser (left rail categories/favs/recents/manufacturers, right results), visibly larger (explicit max-height); rows carry shape+hue; arrow-key highlight + Enter-insert work.

### Block Design Method — see §3 (first-class lane).

---

## 3. The Stitch Design-Pass Workstream (parallel lane, gates the Block reskin)

Glen explicitly named **Google Stitch** (`mcp__stitch__*`) for a brief-by-brief simplification pass on the new blocks. **The deliverable (iter-3, Designer D1) is "ONE block tightened at three densities," not three new block designs.** The lean block (`lean-block-expanded.png`) is the strongest design artifact in the app — gradient category header, recessed activity-meter well, port-lane wells, bottom accent underline. The Stitch pass must *simplify THIS*, not regenerate it. This lane runs **parallel** to engineering; its ACCEPTED outputs *gate* the Item-2c faces.

> **Why the brief template must carry the design system (Designer D1, HIGH).** Stitch is a general-purpose generator; "neumorphic tokens" is a *pointer*, not a spec, and will yield generic grey-card neumorphism that doesn't match the chassis (amber gradient header + recessed well + `--cat-*` HSL hues + paired-shadow recipe). Each coherence-reject is a Stitch round-trip + a session of churn. The richer template below + the LOCKED reference frame prevent that.

### Candidate list — which built-ins get on-canvas faces (re-scored to CODE TRUTH, iter-3 Codex E5)

Built-ins from `nodefactory.cpp:125-150+`. **Real-param column = what the node actually exposes today** (Codex-verified) — several iter-2 entries claimed controls the nodes don't have:

| Built-in                                      | Real param surface TODAY (code truth)                              | Wave-3 candidate?                 |
| --------------------------------------------- | ------------------------------------------------------------------ | --------------------------------- |
| envFollower                                   | **attack/release ONLY** (no "gain") — needs a real surface (B-1)   | ✅ first (smallest real surface)   |
| audioGate / midiGate                          | **NO threshold/attack/hold/release surface today** — must be built | ✅ first, but surface is net-new   |
| compare                                       | enum op (chooser — already shipped)                                | ✅ (done)                          |
| logic                                         | enum mode (chooser — already shipped)                              | ✅ (done)                          |
| LFO (to be built)                             | rate/depth/shape — built WITH a real surface (first B-1 consumer)  | ✅ (Wave 3)                        |
| constant / midiTranspose / midiVelocityAmp    | **atomics only, NO host param surface** — surface is net-new       | ⏳ Wave 4 (degrade-aware)          |
| add/subtract/multiply/divide                  | atomics only                                                       | ⏳ Wave 4                          |
| trigger / readout                             | none meaningful                                                    | ❌ activity-only                   |
| audioRouter / midiRouter / splitter / monitor | routing, not knobs                                                 | ❌ I/O + activity card             |

> **Implication (Codex E5):** the candidate cost is dominated by *creating* param surfaces, not styling them — every "✅"/"⏳" node except compare/logic needs the §1.6-spike substrate work first, and any node where the lock-free write can't be achieved drops to chooser/readout (the §B degrade path). The matrix above feeds realistic Wave-3 sequencing.

### Brief template (one per candidate — design-system-bearing, iter-3 Designer D1/D6, D5)

```
COMPONENT: <name> (<identifier>)
SIGNAL ROLE: <category> → header gradient hsl(var(--cat-X)) 28→24% lightness vertical
SHAPE GLYPH: ● circle | ▲ triangle | ◆ diamond | ⬡ hexagon  (left of title, 14px)
REFERENCE FRAME (LOCKED — simplify THIS, do not redesign; attach lean-block-expanded.png):
  - header: 36px, category gradient, 13px title (… truncate), CPU% pill + format pill + B/M
  - body surface: #252529 raised (.neu-raised paired shadow), 1px top highlight
  - activity well: recessed (.neu-inset), full-width, 6px-segment bar, green→amber→red,
    coloured by signal type (Audio #4A90D9 / MIDI #2BC4C4 / CV #E8A838)
  - port lanes: left=inputs right=outputs, 11px mono labels, glowing port dots by SIGNAL type
  - bottom: 2px category-hue accent underline
GRID: 8px base; control row 44px; knob Ø 32px (medium)/40px (large); label 10px mono caps
REAL CONTROLS: <param → knob|toggle|chooser → range/enum>  (engine-verified; NO control w/o a real param)
DENSITY TIERS (same component, three HEIGHTS — NOT three designs):
  - compact:  header + activity well only (≈84px). NO controls. KEEPS the activity well (D5 — never name+dot).
  - medium:   header + 1–2 primary knobs + activity + I/O (≈150px). (default)
  - large:    header + full control grid + activity + all ports (auto height). (focused block)
STATES (D6): default / hover / selected / muted (red+heavy) / bypassed (grey+heavy) / active-signal / refused
INTERACTION (D6): what moves, on what REAL data, at what rate (must respect the 30/60Hz idle-gate)
TOKENS (exact): bg #1E1E22 / panel #222226 / surface #252529 / elevated #2A2A2E / pressed #1A1A1E;
  text #E5E5EA / #8E8E93; micro-glow 4px @25% on active; NO glass/backdrop-blur/transparency.
TOGGLES: neumorphic pressed/raised switch (.neu-pressed) — NOT iOS pills (D7).
MOTION: state transitions on box-shadow + background ONLY — NEVER animate width/height (collapse = snap or transform-clip per Item 2c D3).
```

### Per-brief flow (gated)

1. Author brief (engine-verified controls only — cross-check the real params the §1.6-spike substrate will expose; if a control has no real param surface, it does not go in the brief).
2. `mcp__stitch__generate_screen_from_text` + `generate_variants` → the three density tiers (compact/medium/large) of the SAME block.
3. Build a `🔍 Review/<Component>` side-by-side Storybook story (mine ‖ Stitch candidate). **Attach `lean-block-expanded.png` as `parameters.design` (the LOCKED reference frame, D1) — the Stitch output is the CANDIDATE, the existing block is the ref** (inverts iter-2, where the Stitch export was the ref). Route feedback to `ui-comments.jsonl`.
4. Glen verdict in the Review wizard (judge interaction, not stills).
5. **If Glen rejects all variants → regenerate** (`mcp__stitch__edit_screens` / `generate_variants`). The brief is NOT done until a variant is ACCEPTED.
6. Implement the accepted layout as the curated face; `validateInlineFace` guards it; generic deck fallback.
7. `run-story-tests` (interaction + a11y) green before merge.

> **Definition of brief-complete (iter-2):** a brief is DONE iff **(a) a CHOSEN/ACCEPTED variant's id is logged to `ui-comments.jsonl`**, **(b) its REAL-CONTROLS list is cross-checked against the engine params that will exist** (no control without a real param), AND **(c) a stub `🔍 Review/<Component>` story exists**. A verdict of "all three are wrong" is a *captured* verdict but NOT a complete brief — it triggers the regenerate loop (step 5).

**Gate:** an Item-2c face for a component MUST NOT ship before its brief is *complete* (an ACCEPTED variant, not merely a captured verdict). Design lane runs ahead of engineering; engineering consumes accepted briefs as they land. **The Wave-2 gate requires ACCEPTED verdicts for ≥3 Wave-3 candidates — not just captured ones.**

---

## 4. Sequencing (dependency-aware waves)

> Rule reminders baked into sequencing: WV-only changes need force-bundle + reinstall of all 8 products before "done"; the C++ param protocol (B-3) blocks built-in faces; Stitch briefs block face implementations; live-verify steps are serialized with ONE app actor; every wave ends on its gates.

### Wave 1 — Visible wins (Glen must feel it next session) · ~2-3 sessions

Front-loaded, low-risk, high-perceived-value. Mostly independent → parallelisable across ralph/team workers.

- **1** Port defaults by hosted-plugin type (C++, two-site `node.cpp`+`graph.cpp`) — **Wave-1 long pole**.
- **N1** I/O naming — **VERIFY-FIRST live capture (checklist → artifacts)**, then rename matching source (C++).
- **N2** VST3-preferred + AU reveal, presentation-only over JSON view (C++, D-1).
- **N3** QuickAdd **two-pane browser** (not cascading menus) + bigger panel + faster + **autofocus-race fix (HIGH)** — fav/recents already ship (U4), so scope = panel/browse/perf/race; **profile search first** (WV; pairs with N2 payload shrink).
- **4c** Jargon replacement incl. **"File" menu title** + guard updates (WV + C++ strings).
- **5b** **In-place** Block rename on Cmd+R/Cmd+T (NOT double-click — collides with dive) + Container rename (reuse native) + top-level Board rename (one new native) + UUID-tab/"GRAPH (NESTED)" fix (WV + small C++).
- **Selection fixes** Shift+click additive + silent group-refusal + ⌘D reliable (WV).
- **3a-W1** Roomier canvas + ⌘0=Fit + in-viewport QuickAdd insert + verify viewport-jump fix holds (WV).
- **6a** Perf no-regression guard (re-measure after Wave-1 reinstall).
- **Parallel lanes (do NOT gate the Wave-1 reinstall):** (1) Stitch lane kickoff — author briefs for envFollower + gate(s) + LFO; generate first variants. (2) **§1.6 B-1 round-trip spike** — prove one real param on one built-in (headless ctest/`cli-anything-element`, no GUI contention with N1's capture).
- **Rollback/degrade:** Item 1 falls back to today's all-4 default per node-class if unsafe; each Selection fix is independent; N1 escalates to Glen rather than renaming blind if the capture doesn't match. A parallel-lane slip (Stitch or spike) never blocks the Wave-1 reinstall.
- **Gate W1:** vitest + tsc + verify-stories + ctest green; terminology + painter + nothing-fake guards green; full build + force-bundle dist→bundle + reinstall the **8 products (see §5)**; one live smoke (`cli-anything-element ... verify assert --alive --no-crash`); **N3 search ≤16ms/keystroke before/after recorded**; idle/drag CPU re-measure ≥ parity with `index-DQcH7wdK.js`.

### Wave 2 — Block size model + canvas tidy/polish + save UX + third-party card · ~3-4 sessions

Depends on Wave 1 (naming/IO stable). Decision A combined model (A-1 auto-height + A-2 collapse-to-compact) lands here; collapse-persistence per Question 1 (recommend persisted boolean, write-on-click, joins idle-gate).

- **2a** Kill zoom-morph → A-1 auto-height + **A-2 collapse tier** (compact = header + activity well, KEEPS the live activity — D5); persistence per Q1 (WV; persisted boolean is a tiny C++ touch if Glen says persist).
- **2b** Third-party card = I/O + **ONE honest activity bar** off the conflated `level` scalar, **coloured by signal type** (G2), no embed (WV).
- **3a-W2** Auto-fit extent to block bounds **with ~100px hysteresis + smooth pan** (G4) (WV; after A-1).
- **3b** "Tidy" action (**visible toolbar home + tooltip — U7**) + auto-tidy-on-add **ON by default (Glen Q3)** with the no-fighting-the-user constraints + snap-to-grid; **Tidy animates blocks gliding** (transform-based — D4) (WV).
- **1b** Cable-splice insertion (Glen Q7): drop a compatible block onto a cable → type-gated highlight → splice A→new→B as one undoable action, composed from existing connect/disconnect natives (WV + verify disconnect native).
- **Canvas polish** arrowheads + endpoint plugs (class-based, ≥4.5:1) + **white terminal-block re-skin to dark token surface (D4, net-new)** + param-port collapser default for dense nodes (D4) + remove decorative LR wells on non-audio blocks + Audio Output input-RMS meter (WV; pairs with 2a/2b).
- **4b** Save: corrected **`.els` autosave fallback + recovery loader (E1)**, **ONE new named-save native for silent inline first-save (E6)**, in-app recall shelf (**`.els`-only — E8**), **autosave micro-indicator (G3)**; reopen-last already wired (removed from scope — E6) (C++ + WV).
- **4a (ALL in W2 now — U6)** "Save selection as Snippet" + fix **BOTH** hardcoded inserts (`SnippetShelf.tsx:18` + `MoleculesSection.tsx:32` — E7) + **drag-from-shelf** with a 150ms scale-up spring (G6) (mostly WV).
- **2c schema heads-up (D2):** the `InlineFaceSpec` density-variant schema change is a Wave-3 deliverable, but if the collapse tier (2a) and the Stitch density briefs need it earlier, land the schema in W2 as a no-op-until-consumed addition.
- **Parallel:** Stitch lane — drive briefs to **ACCEPTED** Review-wizard verdicts for Wave-3 candidates (envFollower/gate/LFO) using the design-system-bearing template + locked reference frame; §1.6 spike result feeds the Wave-3 estimate.
- **Rollback/degrade:** A-1 reserves face space (no graph reflow on async face mount); if A-1 variable-height churns React Flow measuring, ship a fixed-height-per-density variant as the degrade. Collapse transition = snap if the transform-clip proves to fight re-measure (D3). Canvas-polish items are independent. The autosave format fix (E1) is low blast radius but **must ship with the recovery loader** or recovery files stay unloadable.
- **Gate W2:** all W1 gates + a saved multi-block project exists (enables heavy-board perf parity run) + **ACCEPTED** Stitch verdicts for ≥3 Wave-3 components (not merely captured) + 2b shows exactly ONE activity indicator per card (NOTHING-fake) + **autosave round-trips as a loadable `.els`** (E1 recovery test).

### Wave 3 — Param protocol + built-in direct controls (the headline) · ~4-6 sessions (re-estimated, iter-2)

Depends on B-3 protocol + the §1.6 spike (which calibrated mechanism + per-node cost) + **ACCEPTED** Stitch verdicts (Wave 2). Estimate raised from 3-5 because B-1 must *create* a param surface where built-ins have none (nullptr `getAudioProcessor()`), not add a layout.

- **B-3/B-1** Real `AudioProcessorParameter` surface (mechanism (i)) on envFollower + gate(s); LFO node built with real params (its first consumer). **Lock-free, no-alloc param-WRITE per the §B contract.**
- **Degrade path:** any node whose write can't be made lock-free drops to chooser/readout-only and off the candidate list — never a fake/non-RT knob.
- **2c** Curated faces for the ACCEPTED candidates via the existing `inlineParams.ts` infra; generic deck fallback validated.
- **Rollback/degrade:** the spike's finding bounds the risk before Wave 3 starts; if a node degrades, Wave 3 still ships the nodes that don't (no all-or-nothing). New param/snapshot fields join the idle-gate epsilon pre-pass (Item 6a) or they're rejected by the perf gate.
- **Gate W3:** new ctest proves each param round-trips engine (set → measurable change → snapshot echo) **with a lock-free write (no audio-thread alloc/lock)**; `validateInlineFace` rejects any unbacked face; nothing-fake gate (signal→meter>0) green; **"static graph pushes nothing even with the new param fields" idle-gate test** green; reinstall + live verify each face moves real data.

### Wave 4 — Auto-complete + more faces · ~2-3 sessions

> *(Snippet drag-from-shelf moved to Wave 2 — U6 — so the capture→reuse loop completes in one wave.)*

- **5c** Auto-complete-signal-path action — composes from existing `elementGraphConnect` per cable; **optimistic dashed→solid cables that animate drawing in** (G6 + D4); **visible toolbar/palette home + tooltip** (U7) (WV-first).
- **2c (more)** Wave-4 candidate faces (constant/math/midiTranspose) as ACCEPTED briefs land — each needs a net-new param surface (E5), so each is degrade-aware.
- **Rollback/degrade:** 5c only creates type-valid cables (skips invalid pairs rather than failing); each is undoable. Additional faces follow the §B degrade rule (no lock-free write → chooser/readout).
- **Gate W4:** auto-complete only creates type-valid undoable cables that animate in; gates green; reinstall + live verify.

### Wave 5 — Predictive feel + perf micro-pass · ~1-2 sessions

- **6b** Heuristic context suggestions — deterministic `rank(history, signalContext, recency)` (WV).
- **6a** Optional idle-residue micro-pass (CVDisplayLink) if measurably worth it.
- **Rollback/degrade:** 6b is a pure ranking layer over existing data — if it mis-ranks, it falls back to the current frequency-only order (no functional loss). The micro-pass is optional and skipped if not measurably worth it.
- **Gate W5:** `rank()` vitest contract passes (determinism + signal-context-outranks + recency); final full idle/drag re-measure; `/review-video` readiness check (feature-complete signal to Glen).

**Wave-1 lands:** Item 1, N1, N2, N3 (+autofocus race), 4c (+File menu), 5b, Selection fixes, 3a-W1, 6a-guard. **Parallel lanes alongside W1:** Stitch kickoff + §1.6 B-1 spike.
**Deferred past Wave 1:** 2a/2b/2c, 3a-W2, 3b, Canvas polish, 4a/4b, 5c, 6b, param protocol, LFO, full Stitch reskin, the split-MIDI-activity follow-up.

---

## 5. Test Plan (per wave) + Guard Updates

**The "8 products" (enumerated once, per the reinstall gate).** Build targets (`CMakeLists.txt`): `element_app` (host GUI) + `element_sandbox_host` (out-of-process helper, nested into `Element.app/Contents/Helpers`) + the 3 plugins `element_instrument` / `element_effect` / `element_midi_effect`, each in **AU / LV2 / VST3** (`ELEMENT_PLUGIN_FORMATS="AU;LV2;VST3"`). The installed/verified set = the app bundle + the sandbox helper + the plugin-format bundles (the perf-wave evidence's "5 installed plugins"). "Done" requires a full build + **force-bundle dist→bundle** (webview-only changes can otherwise leave the embedded webview stale) + reinstall of this set into `~/Applications` + the plugin dirs.

**Standing gates (every wave):** `npx tsc -b` clean · `vitest` green (incl. perf guardrail + selector-guard + terminology) · `npm run verify-stories` (render gate) · `ctest --output-on-failure` · full build + force-bundle + reinstall the 8-product set above · one serialized live smoke via `cli-anything-element ... verify assert --alive --no-crash`.

**Perf contract (every wave, iter-2).** Any NEW per-node snapshot field (Item-1 IO classification echo, N2 `variants`, A-1 size, 2b/polish activity, Wave-3 params) **must join the `meterlanegate` idle-gate epsilon pre-pass**, and A-1 variable-height nodes **must reserve face space** (the perf-wave `h-8` reserve trick) so an async face mount never reflows the graph. **New test (added each wave a field is introduced): "a static graph pushes NOTHING even with the new field"** — asserts the idle re-push produces zero downstream re-renders (extends the existing `reconcileArray` idle-gate coverage). No wave may reintroduce per-tick inline painter styles on Cable or any `backdropFilter` (perf-wave guardrail vitests enforce).

- **Wave 1:**
  - *Unit/ctest:* port-classification helper (Item 1) **+ assert the correct IO *child nodes* (not just ports) exist after insert via the `node.cpp:182-200` path**; plugin-list dedupe (N2) — AU duplicating a VST3 is suppressed + `variants` (structured `var`) populated + **dedupe never mutates `KnownPluginList`**.
  - *Interaction (vitest):* **in-place** Block rename on Cmd+R/Cmd+T (NOT double-click; double-click still dives — U3) + **the edit field traps keys (Enter commits / Esc reverts, no global shortcut leaks — G5)**; Container rename via existing native; **QuickAdd autofocus — first keystroke goes only to the search field, no global shortcut fires, no stray block added**; **Shift+click additive selection**; **⌘D duplicates on every repeated press**; **QuickAdd two-pane render (left rail + results), rows carry shape-glyph + hue, arrow-key highlight + Enter-insert** (U4/G1); jargon strings absent (incl. menu title).
  - *Guards:* **update both terminology guards** for new fluid strings incl. the new File-menu title (`check_terminology.py`, `terminologyGuard.test.ts`, `terminology-allowlist.json`).
  - *Perf:* **N3 search ≤16ms/keystroke** on the Intel reference machine via `sample(1)`/trace, before/after recorded; first ~15 rows render immediately (G1 virtualization); idle/drag CPU ≥ parity with `index-DQcH7wdK.js`.
  - *Live/e2e (serialized one actor):* **N1 capture checklist** (3 node sources → `.omc/state/qa-wave-reports/n1-io-label-capture.{png,txt}` with verbatim strings + suspected source) BEFORE any rename; **Item-1 first-drop produces an audible pre-cabled path (U1)**; ⌘0=Fit; QuickAdd insert in-viewport; no viewport-jump on first selection.
  - *Parallel-lane gates (do NOT block W1 reinstall):* §1.6 spike — **substrate mechanism chosen (lock finding cited)** + one param set→engine→snapshot echo + **lock-free write proven** (ctest/headless); Stitch — first variants generated against the design-system-bearing template + locked reference frame.
- **Wave 2:**
  - *vitest:* `zoomToTier` removed + block content zoom-invariant (2a); **block collapses to header+activity-well and re-expands, collapsed state still shows real activity (D5), and the collapsed flag persists through a save/load round-trip (Q1)**; **cable-splice (1b): compatible block over cable highlights it, drop yields A→new→B with the original edge gone, single undo step, incompatible block never highlights**; **auto-tidy ON by default: add triggers debounced animated relayout, a user drag never does and cancels a pending pass (Q3)**; **third-party card shows exactly ONE activity indicator off `level`, coloured by signal type — never a separate audio-VU + MIDI-LED magnitude pair (NOTHING-fake)** (2b/G2); Tidy calls existing autoLayout + animates via transform (3b/D4); 3a-W2 hysteresis (no jerk) (G4); A-1 reserves face space (no reflow on async mount); arrowheads/plugs class-based + ≥4.5:1; non-audio blocks render no decorative wells; **terminal blocks use the dark token surface, not white (D4)**; toggles are `.neu-pressed` not iOS pills (D7); both snippet insert surfaces use cursor/centre, not hardcoded (E7).
  - *ctest/native:* **autosave writes `.els` and the recovery loader re-opens it as a session (E1 — the format-trap test)**; never-saved Board is autosaved via the corrected fallback (guard removed); **inline first-save via the new named-save native shows no OS dialog (E6)**; autosave does not alter undo state; Projects shelf lists `.els` only (E8).
  - *Live:* force-quit → relaunch recovers **a loadable `.els` session** to within the last autosave (≤60s); autosave micro-indicator pulses (G3); recall shelf opens in-app; heavy-board perf parity run.
  - *Design coherence (Review wizard):* ≥3 Wave-3 candidate briefs reach **ACCEPTED** verdicts against the locked reference frame; each accepted variant carries its STATES + INTERACTION rows (D6).
- **Wave 3:**
  - *ctest:* each new param round-trips (set → measurable engine change → snapshot echo) **with a lock-free, no-alloc audio-thread write** (the §B contract; the spike's chosen mechanism); degrade-path node correctly drops to chooser/readout; **"static graph pushes nothing even with the new param fields"** idle-gate test.
  - *vitest:* `validateInlineFace` rejects a face whose param is absent (fallback proven); **`InlineFaceSpec` renders compact/medium/large from the density-variant schema (D2)**; **the SHOW/HIDE popover drives which real params appear on the face — one curation system, and an "IN" toggle is impossible for a non-existent param (U2 + NOTHING-fake)**; nothing-fake (signal→meter>0) for each new face.
  - *Live:* each curated face moves real data; collapse↔expand transition is the chosen one (snap or transform-clip, no graph reflow — D3); generic deck fallback renders for non-curated.
- **Wave 4:** auto-complete creates only type-valid undoable cables composed from `elementGraphConnect`, drawn in as pending→solid (vitest + live; G6/D4); (snippet drag now tested in W2).
- **Wave 5:** `rank(history, signalContext, recency)` vitest — determinism + signal-context-match outranks equal-frequency non-match + recency tiebreak; **flow guardrails (U5): no suggestion surface appears unsolicited, none captures the next keystroke, any inline chip is Esc-dismissable + causes no canvas reflow**; final idle/drag CPU re-measure ≥ parity.

---

## 6. ADR — Product Feedback v4 Program

- **Decision:** Stage Glen's six-cluster feedback as a 5-wave program: front-load visible UX wins (port defaults **+ auto-cabled first drop**, naming, **alias-aware** dedupe, **two-pane** QuickAdd + the HIGH autofocus-race fix, **in-place** rename, jargon incl. the File menu, selection fixes, roomy canvas) in Wave 1; land the **combined block-size model (auto-height + collapse tier)** + save-UX (**`.els` recovery + named-save native**) + third-party cards + **canvas polish incl. the white-terminal-block fix + snippet drag** in Wave 2; ship the headline Bitwig-style built-in controls in Wave 3 behind a **hybrid param protocol whose substrate the §1.6 spike chooses** (AudioProcessor-shell vs lock-free atomic bridge vs hardened internal-param path — the existing internal `Parameter` notify is lockful), with a lock-free write contract + per-node degrade path; auto-complete + more faces in Wave 4; heuristic predictive feel + perf micro-pass in Wave 5. Run **TWO parallel gated lanes** alongside Wave 1: the **Google Stitch** block-redesign (deliverable = "one block tightened at three densities" against a LOCKED reference frame; ACCEPTED verdicts gate Wave-3 faces) and the **§1.6 B-1 spike** (a SUBSTRATE DECISION, not just a round-trip). Surface existing autosave/recents rather than rewriting the document model; every coverage claim is proved by the **Traceability Matrix (§1.5)**.
- **Drivers:** (D1) the zero-host-params blocker gates the headline feature, so the param protocol must start early (the spike) but ship behind a validated fallback; (D2) Glen must feel improvement next session, forcing visible-wins-first sequencing; (D3) the just-won perf result is load-bearing and must not regress.
- **Alternatives considered:** full document-model rewrite for save (C-2, rejected); a *parallel* custom param system (B-2-as-clone, rejected — doubles the face-consumer surface; the disciplined version is mechanism (ii), a lock-free bridge feeding the EXISTING face infra); **block size** — pure A-1 auto-size alone CANNOT deliver Glen's compact/medium/large (no compact state), so the chosen model is A-1 + a collapse tier; collapse *persistence* is the open fork (X1) surfaced to Glen — *persisted* (A-2a, recommended: a write-on-click boolean, negligible cost) vs *session-local* (A-2b, perf-safe fallback); webview-side AU dedupe (D-2, rejected — full payload still crosses the bridge); **presentation-only AU dedupe alone (rejected — orphans starred AUs; must be alias-aware, the `PluginGroup` model)**; fixed single block size (A-3, rejected).
- **Why chosen:** it honours Speed-wins and Nothing-fake (no fabricated controls — the conflated-`level` bar is ONE honest bar coloured by *real* signal metadata; perf guardrails + idle-gate intact), respects Surface-before-build (autosave/recents/autoLayout/molecules/ghost-cables/SnippetShelf/the SHOW-HIDE popover all already exist — the plan *wires* them, e.g. the popover becomes the face-curation layer rather than a second system), gives Glen fast visible motion (auto-cabled first sound, in-place rename, two-pane QuickAdd) while the long pole progresses on two gated lanes, and reuses proven gestures (double-click stays dive; rename stays Cmd+R) rather than introducing collisions.
- **Consequences:** Wave 3 is **4-6 sessions** because the substrate must be *created* (built-ins have no `juce::AudioProcessor`; the only internal param path takes a `ScopedLock` and is not RT-safe as-is) — the §1.6 spike picks the mechanism and proves a lock-free write before Wave 3 commits; the per-node degrade path (can't be lock-free → chooser/readout) bounds the risk. The candidate matrix is re-scored to code truth (envFollower = attack/release only; gates/constant/midiTranspose have no param surface today). **Save: the autosave format trap is fixed (`.els` + recovery loader) — recovery is a loadable session, guaranteed only to within the last autosave (≤60s); autosave is orthogonal to undo; a new named-save native is required (reuse was overstated).** AU dedupe is presentation-only AND alias-aware (never mutates `KnownPluginList`/saved identifiers; starred AUs are not orphaned). The `InlineFaceSpec` needs a density-variant schema before faces can be three sizes. The collapse tier (not pure A-1) is what makes Glen's "3 layouts" real. Terminology guards (incl. the File-menu title) update in lockstep.
- **Follow-ups / open:** ~~Glen's 9 answers~~ **ALL ANSWERED 2026-06-07 (locked in §0)** — net changes: collapse persists (A-2a), auto-tidy ON by default, untitled-restore mandatory, File→"Element", NEW Item 1b cable-splice (W2), popover demoted to block context menu, N3 layout = research artifact (`quickadd-pattern-research.md`), suggestions weight connection-context. Still open: the N1 capture checklist (escalate if it doesn't match); the deferred per-node split-MIDI-activity *magnitude* field; heavy-board perf parity run; learned (ML) predictive ranking deferred; per-plugin (third-party) param exposure deferred; the CVDisplayLink idle-residue micro-pass optional.

---

## 7. Wave Estimates & Wave-1 vs Deferred

| Wave / Lane    | Theme                                                                                                                                           | Est. sessions     | Risk                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------ |
| 1              | Visible wins: port defaults (long pole), naming, dedupe, QuickAdd (+autofocus race), rename, jargon (+File menu), selection fixes, roomy canvas | 2-3               | LOW                            |
| 2              | Combined size model (auto-height + collapse tier) + tidy + canvas polish (incl. white-block) + save UX (`.els` recovery + named-save) + third-party card + snippet save **and drag** (U6) | 3-4               | MED                            |
| 3              | Hybrid param protocol (substrate chosen by spike; create param surface) + built-in direct controls + LFO (headline)                             | **4-6**           | HIGH                           |
| 4              | Auto-complete path + more faces (snippet drag moved to W2)                                                                                       | 2-3               | MED                            |
| 5              | Heuristic predictive + perf micro-pass + review-video readiness                                                                                 | 1-2               | LOW                            |
| Lane A (∥ W1+) | Stitch block-redesign briefs → ACCEPTED verdicts                                                                                                | folded into W1-W3 | LOW                            |
| Lane B (∥ W1)  | §1.6 B-1 round-trip spike (de-risk keystone)                                                                                                    | ~0.5-1            | MED (isolates HIGH risk early) |

**Total: ~12-18 sessions** across 5 waves + 2 parallel lanes (Wave 3 re-estimated up 3-5 → 4-6 after confronting the nullptr-`AudioProcessor` reality). This is a LARGE program — not one wave. Glen sees real improvement after Wave 1; the deep rocks (param protocol, Stitch reskin, predictive) run gated/parallel so they never block the visible wins, and the spike surfaces the keystone's hazards by session ~2-3 instead of ~6-8.

**Wave-1 lands:** Item 1 (+auto-cable), N1, N2 (alias-aware), N3 (two-pane +autofocus race), 4c (+File menu), 5b (in-place Block/Container/Board rename), Selection fixes, 3a-W1, 6a-guard. **Parallel lanes:** Stitch kickoff (design-system template + locked frame) + §1.6 B-1 substrate spike.

**Open questions: NONE for Glen** — all 9 answered 2026-06-07 (§0 table). Remaining verify-gates: N1 live capture; §1.6 spike substrate decision; N3 layout per `quickadd-pattern-research.md`.
