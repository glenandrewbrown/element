# QA Fix + Bounded Improvements — 2026-06-05

STATUS: approved — Scope B (full dive), team execution
MODE: ralplan consensus / DELIBERATE
BASELINE BRANCH: `local-enhancements` · CURRENT BRANCH: `chromatic-ui-review`
AUTHOR: planner (ralplan loop)

---

## 1. PRD Header

### Problem
A QA sweep traced 8 confirmed defects across the Element webview + C++ bridge, plus one open backlog item. They cluster into three failure classes that all cut against the **precision-instrument-for-experts-in-flow** paradigm:

1. **Lifecycle integrity** — the embedded plugin editor (the flagship out-of-process reliability feature) can be *opened* from the canvas but never *closed* from the canvas, and is *orphaned* (left mounted, pointing at a dead node) when its Block is deleted. This is both a UX dead-end and a heap-corruption hazard (CLAUDE.md teardown gotcha).
2. **NOTHING-fake violations / adjacents** — a Container Block renders hardcoded `NODE_A`–`NODE_D` placeholders; the Block VU holds its last value forever on silence (stale green meter with no signal).
3. **Speed-of-iteration friction** — breadcrumb "dive" into a nested board is cosmetic (canvas never swaps content); `Cmd+K` palette won't close on `Esc`; LiveHealth shows un-rounded floats (13dp CPU, 2-line latency wrap); the zoom-tier band skips "standard"; QuickAdd over-truncates plugin names and has no favourite toggle.

### Goals
- **G1** Fix every confirmed defect (P1-A, P2-A, P2-B, P2-C, P3-A, P3-B, P3-C) + the backlog item, each with a testable acceptance criterion.
- **G2** Make the embedded-editor *open → tweak → close* loop a first-class fast gesture (the instrument's core "poke a plugin and get out" interaction).
- **G3** Eliminate the two NOTHING-fake offenders with *honest* affordances + real data (the Container shows real child names via the dive's `containerChildren`; the meter reads real signal with ballistics) — never a fabricated grid or a stale meter.
- **G4** Ship **5** improvements anchored 1:1 to QA observations + the keyboard/gesture spec — including the **full host-driven Container dive (P2-A1, Glen Scope-B override)**. Only Portal link-traversal / Module tier / persisted-per-board viewport remain deferred.
- **G5** End with a fresh, serialized, end-to-end visual QA sweep (the e2e gate) that re-verifies every fix on a clean launch.

### IN-SCOPE
- The 7 P-defects + backlog item, fixed at the file:line sites in §3 — with **P2-A delivered as BOTH P2-A0 (honest affordance, the compact/not-yet-dived state) AND P2-A1 (the full host-driven container dive)**. Glen override 2026-06-05: Scope B — build the real dive THIS batch.
- 5 improvements (§ "Improvements"): editor fast-close gesture (I1); honest container affordance as the not-yet-dived preview (I2/P2-A0); **the full host-driven container dive** (I5/P2-A1 — primary nested navigation); proper VU attack/decay ballistics + idle-vs-dead state (I3); QuickAdd name-priority + per-row favourite star (I4).
- Build + ad-hoc-sign + reinstall to `build-merged/element_app_artefacts/Element.app`, then the e2e gate.

### OUT-OF-SCOPE (hard)
- Wiring/restoring shelved **Dashboard / MacroDashboard / Scene / Preset / Perform-mode** UI (decision D3 — keep code, hide UI). Not touched.
- Ripping out or re-architecting the out-of-process editor — we fix its *lifecycle*, the architecture stays.
- Any change to the audio-thread RT path, sandbox IPC, or graph-build ops.
- General refactors, file-splitting, dependency bumps, new node types.
- The reliability ship-gate (R2 AU-hang → R6 default-ON → R8 crash harness) — separate workstream, separate gate.
- **Beyond the dive: Portal `.elboard` external linking, the Module tier, and persisted-per-board viewport** — P2-A1 delivers Container dive (≥2 levels of nesting) with snapshot-driven breadcrumb; Portals get the honest "external portal — open to edit" affordance only (no link-traversal). These remain deferred.
- **Scope-B bridge/snapshot surface (the truthful count):** this batch adds **3 new bridge fns** (`elementToggleFavorite` for I4; `enterContainer(nodeId)` + `exitContainer()` for P2-A1) **and 1 new snapshot field** (`containerChildren` real nested-node payload for P2-A1). The snapshot **builder is parametrised** to walk a new `currentBoardNode` instead of `getCurrentGraph()` — a change to the core snapshot contract (regression-guarded, see Wave 2b). No OTHER new snapshot fields.

---

## 2. RALPLAN-DR Summary

### Principles (non-negotiable order)
1. **NOTHING-fake is absolute.** No placeholder/mock/idle stand-in ships. A silent meter reads 0; an unknown nested-node list shows an honest count, not invented names.
2. **Safety-critical teardown ordering wins over everything.** The editor must be torn down (via `~PluginWindowContent`'s ordered AX-peer → `editorBeingDeleted`-on-LIVE-processor → null-children sequence) **while its engine `Processor` is still usable** — i.e. close at delete *initiation*, before `RemoveNodeMessage` releases + drops the processor. Verified ordering in `GraphManager::removeNode`: `processor.removeNode(uid)` pulls the node from the graph (`graphmanager.cpp:552`), `releaseResources()` at `:564` (resources released, object not yet destroyed), `nodes.removeChild` fires the `valueTreeChildRemoved` listener at `:575`, then the final `ProcessorPtr` ref-drop `obj=nullptr` at `:579`. A reactive close at `:575` would call `editorBeingDeleted` on a processor already pulled-from-graph + `releaseResources()`-ed (unsafe regardless of the exact destruction point). Any editor-lifecycle change is validated against use-after-free / heap-corruption risk first, UX second.
3. **Speed of iteration is the supreme metric.** Every gesture fix must make the expert *faster* (Esc-to-close, one-key favourite, honest "open to edit" container affordance), never add a modal step or a fake-but-pretty dead-end.
4. **Minimal blast radius, contained where it can't be minimal.** Prefer a 3-line guard over a new subsystem; keep every small fix additive. The one structurally-large item — the host-driven container dive (P2-A1) — is **in scope this batch (Glen Scope-B)** but quarantined to its own serialized wave (Wave 2b), behind a hard regression guard: the existing PASS top-level canvas/breadcrumb/zoom/semantic-tiers must still pass after the snapshot-builder is parametrised. A half-built dive is worse than none, so its critical interactions (exit-desync, dive-with-editor-open, delete-while-dived, multi-level) are designed up front, not discovered.
5. **One actor drives the live app at a time.** Concurrent app-driving previously produced a *false* crash reading. All live-app verification is serialized.

### Decision Drivers (top 3)
- **D-1 Reliability credibility.** The embedded editor is the marketed flagship; an editor you can't close (and that orphans on delete) actively undermines the "Bitwig-grade reliability" claim. P1-A is the highest-value fix.
- **D-2 Trust / honesty.** Visible fake data (`NODE_A`–`D`, stale VU) is the fastest way to lose an expert user's trust. NOTHING-fake offenders are P-priority, not cosmetic.
- **D-3 Bounded delivery.** This must land as a coherent, reviewable, shippable batch — not balloon into a nested-board navigation epic. Scope discipline is itself a driver.

### Viable Options

#### Decision (a) — SCOPE  *(re-decided 2026-06-05 — Glen override to Scope B)*
| Option | Pros | Cons |
|---|---|---|
| **A1. Fix-only** (7 defects + backlog, no improvements) | Smallest blast radius; fastest to green; lowest regression risk | Editor loop clumsy; breadcrumb stays cosmetic (a *lie*); fails the instrument-paradigm bar |
| **A2. Fix + bounded improvements, container = P2-A0 honest affordance only** *(real dive P2-A1 deferred)* | Closes each defect + its workflow root; breadcrumb stops lying via an honest affordance; reviewable; smallest viable blast radius | Container *navigation* not delivered — the keyboard-table "double-click → dive into nested Board" promise is still unmet; the affordance is a holding pattern, not the feature |
| **A3 / Scope B. Fix + improvements + the FULL host-driven Container dive (P2-A1)** — real nested-board content swap, ≥2-level nesting, snapshot-driven breadcrumb path | Delivers the *actual* speed-nav gesture the spec promises; the canvas shows the REAL nested board, not a placeholder; folds in P3-B real-names | Structurally large: new `currentBoardNode` pointer + parametrised snapshot builder + breadcrumb-PATH emitter + `isUnderCurrentBoard` + 2 bridge fns + 1 snapshot field; touches the core snapshot contract → real regression surface; needs the critical-interaction design (exit-desync / editor-open / delete-while-dived / multi-level) done up front |

**CHOSEN: A3 / Scope B (Glen override, 2026-06-05).** Glen explicitly overrode the prior deferral: **build the full host-driven dive (P2-A1) THIS batch.** A1/A2 are rejected because the honest affordance, while not a lie, still leaves the spec's core nested-navigation gesture unbuilt — Glen wants the real thing now. P2-A0 is **retained** as the not-yet-dived in-Block preview (the compact state); P2-A1 is the primary navigation that swaps the canvas to the real nested board on double-click. The cost is accepted and **contained**: P2-A1 is quarantined to its own serialized wave (Wave 2b) behind a regression guard (existing top-level canvas must still pass), with its four critical interactions designed in §3 P2-A1. Verified-in-code premise stands: the snapshot is hardwired to the top-level active graph tab (`:5188/:5214/:5218-5221/:4924-4941`) with no nested-board concept — so P2-A1 is a genuine feature build, scoped honestly below. Portals stay the honest affordance (no `.elboard` link-traversal this batch).

#### Decision (b) — P3-A VU decay location
| Option | Pros | Cons |
|---|---|---|
| **B1. Client-side ballistic decay in the selector** (`useBlockNodeLevel` / a small ballistics hook over `useNodeMeterStore`) | Pure webview change — no C++ rebuild needed to iterate; fast to tune attack/decay constants; isolated to the meter render path; the host already pushes a *real* 60 Hz full snapshot so decay is applied to real data, never fabricated *up* | Decay is a *display* ballistic computed in JS on each frame; must be implemented as a falling-only envelope (never raises a value above the host value) so it can't fake signal; needs an animation frame / rAF tick when host pushes stop |
| **B2. Host-side ballistics in `buildNodeMetersJson` / the metering source** | One canonical meter ballistic shared by every consumer (cable + node + bus meters); closer to "real DAW meter" semantics; no per-frame JS work | Requires C++ change + full rebuild per tune; risks touching the 60 Hz push contract used by 3+ stores; the stale-hold bug is specifically "host *stops* pushing" → host-side decay can't run when the host isn't pushing (the exact failure mode), so B2 alone does **not** fix the reported defect |

**CHOSEN: B1 (client-side falling envelope), with a documented constraint.** B2 is *invalidated for the reported symptom*: the bug is the host **stopping** its push (graph idle / no audio callbacks) and the last value sticking — a host-side decay loop cannot tick when the host isn't pushing, so it would not clear the stale value. A client-side falling envelope decays toward 0 on the webview's own rAF clock regardless of host cadence, which is exactly the missing behaviour. The constraint (encoded as an acceptance test): the envelope may only ever **lower** the displayed value toward 0 between host pushes; a host push always snaps the displayed value up to the real value. This keeps NOTHING-fake intact (we never display *more* signal than the host reported).

### Pre-mortem (DELIBERATE — 4 failure scenarios)

**PM-1 · Heap corruption / crash on editor teardown (highest severity).**
*Failure:* A new fast-close path (`Esc` / click-away / toggle) calls `pluginEditorClose()` → `pluginEmbedEditor.reset()` while the editor is mid-callback or while AppKit holds a cached AX ref → EXC_BAD_ACCESS.
*Guards:*
- Route **every** new close trigger through the single existing `pluginEditorClose()` (`element_webview_host.cpp:4738`). Do **not** add a second teardown path — `~PluginWindowContent` (`pluginwindow.cpp:75-102`) already owns the correct order (AX-peer teardown via `setAccessible(false)` → `editorBeingDeleted` on the live processor → null the children). We add *callers*, not teardown logic.
- The webview never frees the editor; it only requests close via the bridge. C++ owns the `unique_ptr` lifetime exclusively. `reset()` is idempotent.
- All close triggers run on the **message thread** (bridge handlers + ValueTree listeners + window keydown all fire there) — never from an audio/engine callback.
- Note: the CLAUDE.md "close window + clear content BEFORE removing from hierarchy" VST3 gotcha targets the `PluginWindow`/`DocumentWindow` *wrapper* teardown; the **embed path uses `PluginWindowContent` WITHOUT that wrapper** (`createPluginEditorPanel` → bare content, `pluginwindow.cpp:418-435`), and `~PluginWindowContent` already does the equivalent ordered teardown — so the gotcha is independently satisfied for the embed. (The *delete-while-open* ordering risk is separate → PM-4.)

**PM-2 · NOTHING-fake regression.**
*Failure:* The VU decay envelope is implemented as a generic smoothing that can *rise* toward a target, momentarily showing signal the host never sent; OR a dead engine fades to the same `0`/green resting state as idle and erases the liveness cue (R4); OR the Container affordance fabricates a count/name when the real field is absent.
*Guards:*
- VU envelope is **falling-only** (`displayed = max(decay(displayed), 0)`, snapped up only on a host push). Unit test: after the last host push of value `v`, every subsequent displayed sample is `≤ v` and monotonically non-increasing until the next push.
- **Idle-vs-dead (R4):** a host push of **0** decays to 0 (idle — honest). But if pushes **stop entirely** for >250 ms, render a distinct **"stale / no-data"** treatment (NOT a green meter) so a wedged/dead engine is visibly different from an idle-but-live one. Preserves NOTHING-fake *and* the dead-engine liveness cue.
- P3-B/P2-A0: the Container affordance uses only the **real `containerNodeCount`** ("N Blocks") — never `NODE_x`. Enforced by **GATE-NODE** (a Wave-1 grep guard added to `verify-stories.mjs`: fails if the literal `NODE_` reappears in `Block.tsx` — see P3-B; no such gate exists today).

**PM-3 · Half-built container dive (worse than none) + core-snapshot regression.**
*Failure (Scope B):* P2-A1 ships but a critical interaction is unhandled → **desync** (breadcrumb says "inside Reverb" but canvas shows the parent; or exit leaves a stale nested snapshot); a **dangling embedded editor** when you dive while an editor is open; a **crash/orphan** when a node is deleted while dived inside its board; or the **snapshot-builder parametrisation breaks the existing PASS top-level canvas** (zoom/tiers/breadcrumb regress). Any of these is worse than the honest P2-A0 affordance.
*Guards:*
- **Bound the feature:** P2-A1 = Container dive, **≥2 levels**, snapshot-driven breadcrumb. Explicitly NOT in P2-A1: Portal `.elboard` link-traversal, Module tier, persisted-per-board viewport (these stay deferred). Frozen scope, designed interactions — see §3 P2-A1's four critical-interaction specs (exit-desync / dive-with-editor-open / delete-while-dived / multi-level).
- **Lockstep invariant:** the breadcrumb is driven by the snapshot's `breadcrumbs` PATH (already consumed by `hydrateFromEngine`, `useGraphStore.ts:419-422`), never by an independent client push — so canvas + breadcrumb cannot diverge. `enterContainer`/`exitContainer` set `currentBoardNode` host-side and trigger a normal push; React renders whatever board the host serves.
- **P2-A0 is the fallback/compact state, not removed:** the honest "N Blocks — open to edit" in-Block preview remains as the not-yet-dived render; the dive is the navigation on top of it. If `currentBoardNode` is at the top level, the snapshot behaves exactly as today.
- **Hard regression guard (acceptance):** after parametrising the snapshot builder, the existing top-level canvas/breadcrumb/zoom/semantic-tiers still pass (Storybook + the existing Vitest + a clean-launch top-level sanity in 5b). The dive is gated by both a deterministic round-trip check (5a, if scriptable) and the 5b visual dive-in/out.
- NOTHING-fake still holds: the dived canvas shows the **real** nested nodes (`containerChildren` / real nested-board payload), never placeholders.

**PM-4 · Use-after-free on delete-while-editor-open (the ordering trap).**
*Failure:* The embedded editor is open on a Block that gets deleted; teardown runs **after** the engine has already pulled + released the node's `Processor` → `~PluginWindowContent`'s `editorBeingDeleted(object->getAudioProcessor())` (`pluginwindow.cpp:91-95`) operates on a processor that's been removed-from-graph (`graphmanager.cpp:552`) and `releaseResources()`-ed (`:564`), with its final ref dropped right after (`obj=nullptr`, `:579`). The `valueTreeChildRemoved` listener (`:4982`) fires *in between*, at `nodes.removeChild` (`:575`) — so a reactive close there is unsafe regardless of where exact destruction lands.
*Guards:*
- Close the editor at **delete INITIATION** — in the bridge `elementGraphRemoveNode` handler (`element_webview_host.cpp:1696-1715`), **before** `postMessage(RemoveNodeMessage)` at `:1709`, while the processor is still alive (identity already resolved at `:1706-1707`). Cover the parent-container-delete case (embedded UUID resolves under the removed graph).
- Do **NOT** rely on `valueTreeChildRemoved` as the primary close path (processor already freed there). Keep at most a defensive no-op-if-already-closed check there.
- Deterministic gate (§R3): scripted `open-A → delete-A`, `open-A → delete-B`, `open-A → delete-A's-parent-container` cases × 200, `verify assert --alive --no-crash` after each.

### Expanded Test Plan (DELIBERATE)
- **Unit (webview, Vitest):**
  - VU falling-envelope monotonic-non-increase + snap-up-on-push (PM-2).
  - VU **idle-vs-dead** (R4): host-push-0 → decays to 0 (idle); no push for >250 ms → "stale/no-data" state flagged, not a coloured meter.
  - `zoomToTier` band coverage: assert a wheel-step sequence lands in `standard` (no compact↔expanded skip) for the new band/hysteresis.
  - LiveHealth rounding: CPU `.toFixed(1)`, latency `.toFixed(1)`, single-line.
  - **Single Esc authority** (R6): a unit/logic test over the Esc priority resolver — palette-open beats embed-open beats deselect.
  - QuickAdd ranking unchanged after star-toggle wiring; name column gets priority width.
- **Interaction / a11y (Storybook MCP `run-story-tests`):**
  - CommandPalette: `Esc` closes even when focus is in the `NeuInput` (regression story), routed through the single authority.
  - QuickAdd: star toggle adds/removes favourite, keyboard nav unaffected, name not over-truncated at the standard popup width.
  - Container Block story renders the honest "N Blocks — open to edit" affordance (not-yet-dived state), **zero** `NODE_` literals.
- **P2-A1 dive (Scope B) — regression + round-trip:**
  - **Regression guard (critical):** the existing top-level canvas/breadcrumb/zoom/semantic-tier Storybook stories + Vitest still pass after the snapshot-builder is parametrised to walk `currentBoardNode` (default = top level → identical output to today).
  - Bridge round-trip: `enterContainer(nodeId)` → snapshot serves that container's real nested nodes/edges + a multi-level `breadcrumbs` path; `exitContainer()` → parent restored; both reflected via `hydrateFromEngine`.
  - Edit-inside round-trip: a node added/moved INSIDE the dived board triggers a push (proves `isUnderCurrentBoard` generalisation works — else the round-trip silently fails).
  - 2-level nesting: enter Container→Container, breadcrumb shows the full path, exit pops one level at a time.
- **Integration (build + bridge):**
  - `npx tsc -b` clean; `npm run build`; `npm run verify-stories` (mount-time throw gate **+ GATE-NODE**: the grep guard fails if `NODE_` reappears in `Block.tsx` — RED before the P3-B fix, GREEN after).
  - C++ compiles; **Scope-B surface = 3 new bridge FNs (`elementToggleFavorite` I4; `enterContainer`/`exitContainer` P2-A1) + 1 new snapshot FIELD (`containerChildren`)**; confirm the P1-A close-at-initiation guard compiles + the defensive `valueTreeChildRemoved` check is a no-op when already closed.
  - **`elementToggleFavorite` re-push (Critic note 3 — verified):** `PluginUsageTracker::toggleFavorite` already calls `sendChangeMessage()` (`pluginusagetracker.cpp:81`), BUT the host does **NOT** subscribe to the tracker (no `addChangeListener` on it anywhere; the `favoriteIdentifiers` snapshot is built ad-hoc at `element_webview_host.cpp:5597/5645-5649`). So the handler **must** explicitly `scheduleGraphPush(40)` after `toggleFavorite` — there is no auto-re-push to deduplicate against. Executor: do NOT assume a broadcast-driven re-push; add the explicit push (one per toggle is correct, not redundant).
- **e2e (live app, serialized — §5):** **5a** = deterministic scripted-OSC crash/round-trip gate (×200 crash cycles + the P2-A1 dive round-trip if scriptable, `verify assert --alive --no-crash`, NOT computer-use); **5b** = `video-qa-capture` visual/interaction sweep (feel only, incl. dive-in/out). 5a and 5b never overlap.
- **Observability:** all bridge failures already route through `logBridgeError`; 5a tails the Element log + macOS `.ips` via `cli-anything-element app status` to catch any silent teardown/UAF fault that doesn't surface visually.

---

## Improvements — the set (5, each anchored to a QA observation)

| # | Improvement | Anchored to | Why it fits the instrument paradigm |
|---|---|---|---|
| **I1** | Embedded-editor **fast-close gesture set**: `Esc` while embed focused/open, double-click the Block again to toggle-close, a breadcrumb/overlay **✕** affordance, and click-away on the host chassis → all route to `pluginEditorClose()`. | P1-A | The open→tweak→close loop is the single most-repeated expert gesture; a dead-end editor breaks flow. Speed-of-iteration. |
| **I2** | **Honest container preview (P2-A0)**: the not-yet-dived in-Block state — "▦ N Blocks — open to edit" (real count). This is the compact render that the dive (I5) launches FROM; it stays honest if not dived. | P2-A / P3-B | Kills the fake `NODE_A`–`D` grid; gives the Container a truthful resting state and an obvious dive affordance. |
| **I5** | **Full host-driven Container dive (P2-A1, Scope B)**: double-click a Container → the canvas swaps to that container's **real** nested board; snapshot-driven breadcrumb path; ≥2-level nesting; `Esc`/double-click-empty/breadcrumb-up exits in lockstep. | P2-A | Makes the keyboard table's "double-click Block → dive into nested Board (150ms)" promise actually true. The supreme speed-nav gesture. |
| **I3** | **Proper VU ballistics** — a deliberate falling attack/decay envelope (fast attack, defined decay) + idle-vs-dead state, replacing the stale snapshot. | P3-A | Real DAW meters have ballistics; a frozen meter is both fake-adjacent and unreadable. Honest + legible. |
| **I4** | **QuickAdd name-priority (Part A, WV) + per-row favourite star (Part B, cross-boundary)** — give the plugin name its width back, and add a far-right star toggle on every QuickAdd/command row. The star **persists** via a new `elementToggleFavorite` bridge fn → existing `PluginUsageTracker::toggleFavorite` (the webview can't reach the native write path today — Critic B2). | Backlog `1780358016383-kb3rh` | Faster recognition + one-key curation of the expert's go-to chain. Speed-of-iteration. |

**Still deferred → § Deferred** (Portal `.elboard` link-traversal, Module tier, persisted-per-board viewport, host-side meter ballistic refactor, command-palette redesign).

---

## 3. Per-Defect Fix Design

> Legend: 🔴 = touches safety-critical teardown · 🟡 = touches NOTHING-fake rule · C++ / WV = side of the split.

### P1-A 🔴 — Embedded editor can't be closed from canvas + orphans on node delete
**Approach (two parts, both reusing the existing `pluginEditorClose()`):**

*Part 1 — fast-close gestures (I1), WV-led:*
- `webview/src/components/canvas/GraphCanvas.tsx` — the double-click open path (`:234-236`) currently always *opens*. Make it a **toggle**: track the currently-embedded node id (read it back from a tiny `useEditorEmbedStore`, or from a `nativePluginEditorOpen` return + local state) and if the double-clicked Block is the one already embedded, call `nativePluginEditorClose()` instead of re-opening.
- **Esc-to-close** is handled by the **single shared Esc authority** (R6, see P2-B): the existing `useKeyboard.ts` window listener gains one Escape branch with priority *palette-open → embed-open → deselect*. P1-A does **not** register its own `window.addEventListener` — it contributes the "embed-open → `nativePluginEditorClose()`" rung to that one handler. This guarantees a designed order, not an incidental "topmost-first".
- Add a small **✕ close affordance** rendered by the host-side overlay (or a webview overlay button positioned over the embed slot) → `nativePluginEditorClose()`. Lowest-risk variant: a webview button in the breadcrumb/chrome when `embedOpen` is true.
- Click-away: a transparent catcher behind the embed (webview) that calls close — optional; gate behind not stealing plugin-editor mouse events.

*Part 2 — close-on-delete, C++ — MUST close at delete INITIATION, not reactively:*

> **Safety attribution (corrected, Architect R2).** The safe-teardown locus is **NOT** `createPluginEditorPanel`. It is **`~PluginWindowContent`** (`pluginwindow.cpp:75-102`): it (a) `setAccessible(false)` to tear down the AX peer subtree on the message thread (`:79-89`), then (b) calls `proc->editorBeingDeleted(e)` on the **LIVE** processor obtained via `object->getAudioProcessor()` (`:91-95`), then nulls `editor`/`toolbar`/panels (`:98-101`). `pluginEditorClose()` (`element_webview_host.cpp:4738`) is *only* `pluginEmbedEditor.reset()` + clear — all safety lives in that destructor. The embed uses `PluginWindowContent` **without** the `PluginWindow`/`DocumentWindow` wrapper (`createPluginEditorPanel` returns the bare content, `pluginwindow.cpp:418-435`).

> **Ordering finding (verified — this is the crux).** Deleting a Block goes: bridge `elementGraphRemoveNode` (`:1696-1715`) → `postMessage(new RemoveNodeMessage(n))` (`:1709`, async, message thread) → `GraphManager::removeNode(uid)` (`graphmanager.cpp:550`). Inside `removeNode`, the sequence is: `processor.removeNode(uid)` pulls the node from the graph (`:552`) → `obj->releaseResources()` (`:564`, resources released, object not yet destroyed) → `nodes.removeChild(data, nullptr)` (`:575`, **this fires the `valueTreeChildRemoved` listener**) → final `ProcessorPtr` ref-drop `obj = nullptr` (`:579`). So the listener fires *between* release (`:564`) and final destruction (`:579`), on a processor already removed-from-graph + released. A reactive close there → `~PluginWindowContent` → `editorBeingDeleted` on that pulled-and-released processor = **use-after-free / unsafe regardless of the exact destruction point**. ❌ Do NOT close reactively in `valueTreeChildRemoved`.

- **Fix:** close the editor at **delete initiation**, in the bridge `elementGraphRemoveNode` handler (`:1696-1715`), **before** `postMessage(RemoveNodeMessage)` at `:1709`. The handler already resolves the node identity at `:1706-1707` on the message thread while the processor is still alive. Guard: if `findNodeByUuidInGraph(...)` resolves a node whose UUID == `pluginEmbedNodeUuid` (`include/element/ui/element_webview_host.hpp:166`), call `pluginEditorClose()` first, then post the remove. Also cover the "delete a parent container that *contains* the embedded node" case — if the removed node is a graph and the embedded UUID resolves under it, close first.
- Belt-and-braces: keep a **defensive** UUID check in `valueTreeChildRemoved` too, but it must only `reset()` if the embed is *still* open for a now-absent node — it can never be the primary path (processor already gone). Primary correctness is the initiation-time close.
- All of this is message-thread (bridge handler + ValueTree listener both run there) → `reset()` is safe.

**C++/WV split:** Part 1 WV (+ optional C++ overlay button) · Part 2 C++.
**Risk:** 🔴 high (use-after-free / heap corruption) — mitigated by PM-1 + the new PM-4 (delete-while-open ordering): single teardown path, close-at-initiation (processor still alive), message-thread only, deterministic 200× cycle gate. Toggle-state drift (webview thinks embed open when it isn't) — `nativePluginEditorClose()` is idempotent (`reset()` on null is a no-op) and embed state re-syncs from the bridge open-return.
**Acceptance:** (1) Open embed via canvas double-click; `Esc` → closes, host survives. (2) Open embed; double-click same Block → closes. (3) Open embed; delete that Block → editor closes at initiation (before the processor is freed), no orphan, no UAF, `app status` `--alive --no-crash`. (4) Open embed on Block A; delete Block B → A's editor stays. (5) Open embed on a Block; delete its **parent container** → editor closes first, no UAF. (6) 200× scripted open/close + delete-while-open cycles on VST3+AU+CLAP → no crash (deterministic, §R3).

### P2-A 🟡 — Nested-board dive — BOTH P2-A0 (preview) + P2-A1 (full dive) ship this batch (Scope B)

> **Verified premise (Architect R1).** The snapshot node/edge loop runs over `sess->getCurrentGraph()` = `getActiveGraph()` = the session's **top-level active graph TAB** (`element_webview_host.cpp:5188`, `:5214`, `:5239`); `breadcrumbs` is **hardcoded** to exactly `[sessionName, activeGraphName]` (`:5218-5221`); `isUnderActiveGraph()` walks parents up to `getActiveGraph()` only (`:4924-4941`) so it will **not** schedule pushes for a dived nested board; `session.hpp:45-48,100 setActiveGraph(int)` is top-level-tabs-only. There is **no host concept of "current board = nested container."** P2-A1 builds that concept. The JS consumer is already ready: `hydrateFromEngine` accepts a `breadcrumbs` array (`useGraphStore.ts:419-422`).

#### P2-A0 — Honest container preview (the not-yet-dived state)
**Role under Scope B:** P2-A0 is the Container Block's **resting / not-yet-dived render** — the honest "▦ N Blocks — open to edit" preview that the dive (P2-A1) launches from. It is no longer the terminal behaviour; double-click now triggers the real dive.
- **WV render only:** replace the fake `NODE_A`–`D` grid at `Block.tsx:925-936` with the honest "▦ N Blocks — open to edit" affordance, cardinality from the real `containerNodeCount` (from `getNumNodes()`, `element_webview_host.cpp:5276`). Pure WV; ships **Wave 1 as P3-B** (same render site).
- **Collapse P3-B INTO P2-A0:** one render, one gate (GATE-NODE). The container double-click **routing** moves to P2-A1 (Wave 2b), not a client-only breadcrumb push.
**C++/WV split:** WV only (the render). **Risk:** low. **Acceptance:** Container resting state shows "N Blocks — open to edit" (count = `getNumNodes()`), zero `NODE_x` (GATE-NODE). The *navigation* on double-click is P2-A1's acceptance.

#### P2-A1 — Full host-driven Container dive (THIS batch, Scope B) 🟡

**Goal.** Double-click a Container → the canvas swaps to that container's **real** nested board (its actual Audio In/Out, child plugins, cables — never placeholders); the breadcrumb shows the real multi-level path; `Esc` / double-click-empty / breadcrumb-up exits to the parent **in lockstep**. ≥2-level nesting works.

**Six sub-tasks (the feature, verified against the hardwiring above):**
1. **`currentBoardNode` host pointer (C++)** — add a host-side pointer/UUID, **distinct from `activeGraphIndex`**, naming the board currently displayed. Defaults to the active top-level graph (so default behaviour == today). Lives on `ElementWebViewHost`.
2. **Parametrise the snapshot builder (C++)** — the node/edge loop + canvas/outline emit currently walk `sess->getCurrentGraph()` (`:5188/:5214/:5239`). Parametrise to walk **`currentBoardNode`** instead. When `currentBoardNode` is the top-level graph, output is byte-identical to today (the regression guard).
3. **Real breadcrumb-PATH emitter (C++)** — replace the hardcoded `[sessionName, activeGraphName]` 2-tuple (`:5218-5221`) with the **full path** from session root → `currentBoardNode` (≥2 entries when dived). Consumed unchanged by `hydrateFromEngine` (`useGraphStore.ts:419-422`).
4. **`isUnderActiveGraph` → `isUnderCurrentBoard` (C++)** — generalise the listener gate (`:4924-4941`) so ValueTree mutations **inside the dived board** schedule a push. Without this, edits inside a dived container silently don't round-trip.
5. **`enterContainer(nodeId)` / `exitContainer()` bridge fns (C++↔WV)** — `enter` sets `currentBoardNode` to the double-clicked container + triggers a normal push; `exit` pops one level. Wire `GraphCanvas.tsx onNodeDoubleClick` (Container branch) → `enterContainer`; `onPaneDoubleClick` / the single Esc authority / breadcrumb-up → `exitContainer`. React renders whatever board the host serves — **no client-side board state**.
6. **Real nested-node payload (C++→WV)** — the dived snapshot already carries the real nested nodes via sub-task 2 (the canvas shows them). The bounded **`containerChildren: string[]`** field (added to `types.ts`) supplies the not-yet-dived P2-A0 preview with real child names where cheap — **this folds in P3-B "real names / Option A."** If a child has no name, show its category icon, never a fabricated label.

**Critical interactions (designed up front — a half-built dive is worse than the honest affordance):**
- **(a) Exit / desync:** the breadcrumb is **driven solely by the snapshot's `breadcrumbs` path**, never by an independent client push — so canvas and breadcrumb cannot diverge. `exitContainer` must clear any per-dive transient and let the parent snapshot fully repopulate (no stale nested nodes/edges; `hydrateFromEngine` already replaces atomically). Acceptance asserts in==out lockstep.
- **(b) Dive while an embedded plugin editor is OPEN (P1-A interaction) — DECISION: close the editor on dive.** On `enterContainer` (and on `exitContainer`), if `pluginEmbedNodeUuid` is set, call `pluginEditorClose()` **first** (the editor's anchor Block may not exist on the new board; carrying it across a board swap risks an orphaned/mis-anchored native child). Closing is the safe, predictable choice and reuses the single teardown path. Spec'd, not discovered.
- **(c) Delete a node while dived inside its board:** the P1-A close-at-initiation guard (`elementGraphRemoveNode`) already fires regardless of which board is current; sub-task 4 ensures the delete schedules a push for the dived board so the canvas updates. If the deleted node **is** `currentBoardNode` (deleting the container you're inside) or its ancestor → `exitContainer` to the nearest surviving ancestor before/while removing, so the canvas never points at a destroyed board. Covered by 5a-C3 extended to the dived case.
- **(d) Multi-level (container within container):** sub-tasks 1–4 are level-agnostic (`currentBoardNode` is any node; breadcrumb is a full path). **≥2 levels must work** (enter→enter, exit pops one level). This is the bound — deeper is fine if it falls out, but 2 is the gate.

**C++/WV split:** C++ (sub-tasks 1–6 host side: pointer, snapshot parametrisation, breadcrumb path, listener gate, 2 bridge fns, `containerChildren`) · WV (double-click/exit routing in `GraphCanvas.tsx`; `containerChildren` consumption in `types.ts`/`Block.tsx`; breadcrumb-up + Esc-exit wiring).
**Risk:** 🟠 high — touches the **core snapshot contract** (sub-task 2). Mitigated by: default-top-level == byte-identical output; the hard regression guard (existing top-level canvas/breadcrumb/zoom/tiers still pass); the four designed interactions; quarantine to its own serialized wave (Wave 2b).
**Acceptance:** (1) Double-click a Container → canvas swaps to the REAL nested board (actual Audio In/Out etc., not placeholders). (2) Breadcrumb shows the real multi-level path. (3) Add/move a node inside the dived board → host push reflects it (round-trip, proves sub-task 4). (4) `Esc` / double-click-empty / breadcrumb-up → exits to the parent **in lockstep** (breadcrumb + canvas agree, no stale nested content). (5) Dive while an editor is open → editor closes first (decision b), no orphan, no UAF. (6) Delete the container you're dived inside (or its ancestor) → exits to a surviving ancestor, no crash/dangling-board (5a-C3 dived variant). (7) 2-level nesting works (enter→enter→exit→exit). (8) **Regression: the existing top-level canvas/breadcrumb/zoom/semantic-tiers are unaffected** after the snapshot-builder parametrisation.

### P2-B — CommandPalette Esc-close fails (WV)
**Approach:** `webview/src/components/canvas/CommandPalette.tsx` — the element-level `onKeyDown` (`:430`) is swallowed by `NeuInput` in WKWebView (doesn't bubble). The palette needs a **window-level `Escape`**, but it must NOT register its own racing `window.addEventListener("keydown")` alongside P1-A's (R6).
- **Single Esc authority (R6):** route Escape through **one** window-level keydown handler with a designed priority order: **(1) command-palette open → close palette · (2) else embed-editor open → close editor · (3) else clear selection / deselect**. Cleanest home: the existing global `useKeyboard.ts` handler (already a single window listener at `:355-356`) gains the Escape branch reading palette-open + embed-open state (from the app/editor stores), and CommandPalette/P1-A stop trying to own Escape themselves. ArrowUp/Down/Enter stay element-level inside the palette (they don't have the bubbling problem — they work today). No second `window.addEventListener` is added by either P2-B or P1-A.
**C++/WV split:** WV only.
**Risk:** low. Watch: exactly one Esc listener; verify priority order deterministically (palette-open beats embed-open beats deselect). Acceptance: `Cmd+K` open, focus in search field, `Esc` → palette closes (and an open embed behind it stays open); with no palette, `Esc` closes the embed; with neither, `Esc` deselects. Backdrop click still closes the palette. Arrow/Enter nav intact.

### P2-C — LiveHealth raw float precision (WV) 🟡(legibility, not fake)
**Approach:** `webview/src/components/layout/LiveHealth.tsx` — CPU at `:82` `{health.cpu}%` → `{health.cpu.toFixed(1)}%`; the bar width at `:87` keep numeric (clamp 0–100); latency at `:138` `{health.latency} ms` → `{health.latency.toFixed(1)} ms` (guard non-number/0 like `StatusBar.tsx:35-37` does). Mirror the exact pattern already in `StatusBar.tsx:36`/`:104`.
**C++/WV split:** WV only.
**Risk:** trivial. Acceptance: CPU shows one decimal; latency shows one decimal on a single line; values match `StatusBar` for the same engine state.

### P3-A 🟡 — Block VU stale-hold on silence (→ falling-envelope ballistics + idle-vs-dead: I3)
**Approach (Option B1, chosen):** add a **falling-only display envelope** between `useNodeMeterStore` and the Block render. Implement a small hook (e.g. `useBlockNodeLevelBallistic(blockId)`) used by `Block.tsx:802` in place of the raw `useBlockNodeLevel`:
- On each host push (store update) → snap displayed value **up** to the real value (fast attack), and stamp a `lastPushAt` timestamp.
- On a rAF/interval tick with no fresh push → decay displayed value toward 0 by a fixed time-constant (e.g. ~-12 dB / few-hundred-ms), clamped at 0.
- **Never raise** the displayed value except from a host push (NOTHING-fake / PM-2).
- **Idle-vs-dead distinction (R4):** a host push of **0** → decay to 0 = honest idle (engine alive, no signal). But if **no push arrives for >250 ms** (host wedged / engine dead), the Block surfaces a distinct **"stale / no-data"** treatment — NOT a green/coloured meter (e.g. a dimmed/greyed meter or a small "no data" tick). This preserves the dead-engine **liveness cue** on the reliability-flagship product while staying honest. The 250 ms threshold keys off `lastPushAt` (the host pushes ~60 Hz, so >250 ms = ~15 missed frames = genuinely stalled, not jitter).
- Keep the store's epsilon-diff + reference-stability intact (`useNodeMeterStore.ts:36-47`); the envelope lives in the selector/hook layer so the perf optimisation isn't disturbed.
**C++/WV split:** WV only (host already pushes real RMS).
**Risk:** medium (perf + correctness). Mitigate: **single shared rAF** for all meters (not one per Block); falling-only + idle-vs-dead invariants unit-tested.
**Acceptance:** Play signal → meter rises immediately to real level. Stop signal *while engine live* (host pushes 0) → meter decays smoothly to 0 and stays 0 (idle, coloured-meter-at-rest). Host stops pushing entirely for >250 ms → meter shows the distinct "stale/no-data" state (visibly different from idle), never a green meter. Displayed value never exceeds the last host value between pushes (unit test).

### P3-B 🟡 — Container BlockEmbed placeholder `NODE_A`–`D` (NOTHING-fake VIOLATION) — the P2-A0 render
**This is the P2-A0 render** (one design): replace the fake 2×2 `NODE_A`–`D` grid at `Block.tsx:925-936` with the honest affordance "▦ N Blocks — open to edit", using the real `containerNodeCount` (from `getNumNodes()`, `element_webview_host.cpp:5276`). No invented identities. Under Scope B, P2-A1's `containerChildren` field later enriches this preview with **real** child names (the former "Option A", now in-batch) — but the Wave-1 P3-B fix lands the honest count first.
- **GATE-NODE — concrete gate (Critic B1), with glob scoping (Critic note 1):** verified there is currently NO such gate (`webview/package.json` lint is bare `eslint .`; no `no-restricted-syntax` rule; no `NODE_` grep anywhere). **Wave-1 task:** append to `webview/.storybook/verify-stories.mjs` a check equivalent to `grep -q 'NODE_' webview/src/components/canvas/Block.tsx && exit 1` (or Node `fs.readFileSync(...).includes("NODE_")` → non-zero exit). **Scope it to EXACTLY `Block.tsx` (the production render path) — do NOT broaden to `src/components/**`:** verified the `NODE_` literal lives ONLY at `Block.tsx:932`, while `NODE_A`/`NODE_B` are legit test-fixture variable names in `__tests__/BusInspector.test.tsx` (and `NODE_ID` in `NodeContextMenu.stories.tsx`) — a broad grep would **false-fail**. Also exclude `__tests__`/`*.stories.tsx` if the check ever widens. Chose a build-script grep over an ESLint rule (smaller blast radius; rides the gate Glen already runs). Must be RED before the fix / GREEN after.
- **Companion test edit (Critic note 2 — NEW, Wave 1):** `Block.test.tsx:205-207` asserts `screen.getByText("NODE_A")` / `"NODE_D")` — these **will go RED** when the grid is removed. Add a Wave-1 task to UPDATE those assertions to expect the honest "▦ N Blocks — open to edit" affordance (and, once P2-A1's `containerChildren` lands, the real nested child names). **Executor must not misread this RED as a regression** — it is the expected consequence of the fix; update the test in the same change.
**C++/WV split:** WV only.
**Risk:** low. Acceptance: Container Block shows the honest "N Blocks — open to edit" affordance; **zero** `NODE_x` placeholders in `Block.tsx`; count matches `getNumNodes()`; **`npm run verify-stories` fails if `NODE_` reappears in `Block.tsx`** (GATE-NODE, scoped to that one file); `Block.test.tsx` updated to assert the honest affordance (green).

### P3-C — Zoom-tier band narrow (WV)
**Approach:** `useGraphStore.ts:59-63 zoomToTier`. The `standard` band (0.5–0.8) is skipped by wheel steps. Two combinable fixes: (1) **widen** the standard band (e.g. 0.45–0.95) so normal wheel steps land in it; and/or (2) add **hysteresis** — only change tier when crossing a boundary by a margin, so a single wheel notch near a boundary doesn't flip compact↔expanded. Keep the tier semantics (compact = dot+name, standard = full block, expanded = +BlockEmbed). Update the doc comment.
**C++/WV split:** WV only.
**Risk:** low. Acceptance: a wheel-zoom sweep from <0.5 to >0.8 passes through `standard` (BlockEmbed not shown until truly expanded); unit test over a step sequence asserts `standard` is hit and no compact→expanded skip occurs.

### Backlog `1780358016383-kb3rh` — QuickAdd name over-truncation + favourite star (→ I4)
> **Scope correction (Critic B2).** The persistent star needs **one new C++ bridge fn** — it is NOT a pure-WV "reuse the existing path." Verified: `PluginUsageTracker::toggleFavorite(PluginDescription)` exists (`pluginusagetracker.cpp:69`) but is reachable ONLY from native panels (`pluginspanelview.cpp:401,466`); the webview host only **reads** favourites out (`element_webview_host.cpp:5649` `favoriteIdentifiers` snapshot prop) and `usePluginBrowserStore.ts` has favourite **state** (`:72,79`) but **no toggle action**. The webview cannot reach the write path today. **Chose option (a)** (recommended): add the bridge fn — the C++ write path already exists, so a single `registerFn` wrapper gives Glen the real persistent star with minimal blast radius (preferred over descoping to a non-persisting session-local star).

This item therefore splits across two waves:

*Part A — name-priority (pure WV, Wave 1):* `webview/src/components/canvas/QuickAddPopup.tsx` `PluginRow` (`:273-306`). Name already has `flex-1 min-w-0 truncate` (`:297`), but two fixed 60px columns (manufacturer `:299`, `CategoryLabel` `width:60` `:258`) + gaps starve it at the 224px popup width. Reduce/clamp the manufacturer column and/or hide it earlier under width pressure (it's already `hidden sm:inline`), and let `CategoryLabel` shrink so the name gets first call on horizontal space. No C++.

*Part B — persistent favourite star (cross-boundary, Wave 2):*
- **C++:** add `registerFn(Identifier("elementToggleFavorite"), …)` in `element_webview_host.cpp` (alongside the other `registerFn` bridge fns) → resolve the plugin `PluginDescription` for the passed identifier → call the existing `context.plugins().getUsageTracker().toggleFavorite(desc)` (`pluginusagetracker.cpp:69`, the same call the native panels use at `pluginspanelview.cpp:401,466`) → **then explicitly `scheduleGraphPush(40)`** so the `favoriteIdentifiers` snapshot prop (`:5645-5649`) refreshes. No new snapshot **field** (the read prop already exists) — only a new bridge **fn**.
  - **Re-push note (Critic note 3 — verified, do NOT skip the push):** `toggleFavorite` already calls `sendChangeMessage()` (`pluginusagetracker.cpp:81`), but the **host does NOT subscribe to the tracker** — there is no `addChangeListener` on it anywhere, and the `favoriteIdentifiers` snapshot is built ad-hoc (`element_webview_host.cpp:5597/5645-5649`). The native panels re-render off the broadcast through *their own* listener, but the webview snapshot will **not** auto-refresh. So the explicit `scheduleGraphPush` is **required, not redundant** (one push per toggle is correct). Do not add a *second* push expecting a broadcast-driven one.
- **WV:** add a `toggleFavorite(identifier)` action to `usePluginBrowserStore.ts` (which currently has only favourite *state*, `:72,79`) that calls the new bridge fn and optimistically updates `favoriteIdentifiers`, reconciling on the next snapshot. Add a far-right star toggle button on every `PluginRow`: filled when in `favoriteIdentifiers`, outline when not; `stopPropagation` so toggling doesn't insert the Block. Apply the same star to the command-palette rows where plugins appear (per the backlog "ALL QuickAdd/command menus").
**C++/WV split:** Part A WV-only (Wave 1) · Part B C++ bridge fn + WV store/row (Wave 2).
**Risk:** low-med (Part B crosses the bridge). Acceptance: long plugin names show more characters before truncating at the default popup width (Part A); every QuickAdd/command plugin row has a star far-right; clicking it toggles favourite and **persists via `PluginUsageTracker`** (survives reopen, reflected in the Favorites section) without adding the Block; keyboard nav unaffected (Part B).

---

## 4. Sequencing (dependency-aware waves)

**Wave 0 — Branch + baseline (serial, no live app).**
Confirm on `chromatic-ui-review` (already). Snapshot a clean `npx tsc -b` + `npm run build` to establish a green starting point. No code yet.

**Wave 1 — Low-risk webview-only fixes (no live app; Storybook + unit only).** Authoring is parallelisable, **commits are NOT** (R5):
- P2-C (LiveHealth rounding)
- P3-C (zoom-tier band)
- P2-B (CommandPalette Esc → folded into the single `useKeyboard` Esc authority, R6)
- Backlog QuickAdd **name-priority (I4 Part A only)** — WV-only *(the persistent star is I4 Part B → Wave 2, B2)*
- P3-A VU ballistics + idle-vs-dead (I3) — WV-only, unit-tested
- P3-B honest "N Blocks" render (the P2-A0 render) — WV-only **+ companion edit to `Block.test.tsx:205-207`** (update the `NODE_A`/`NODE_D` assertions to the honest affordance — Critic note 2; the RED there is expected, not a regression)
- **GATE-NODE** — add the `NODE_`-in-`Block.tsx` grep guard to `verify-stories.mjs`, **scoped to exactly `Block.tsx`** (NOT `src/components/**` — `NODE_A`/`NODE_B` are legit fixtures in `BusInspector.test.tsx`; Critic note 1). Author RED-first, before the P3-B fix (B1).
- I4 Part A — QuickAdd name-priority (pure WV) *(the persistent star is I4 Part B → Wave 2a)*
Each gated by `tsc -b` + targeted Storybook `run-story-tests` + Vitest. **Commit lane is single + serialized even for WV (R5):** the repo hook runs a no-op `git reset` that unstages between calls, and parallel git leaves a stale `.git/index.lock` → **stage+commit each change in ONE call, one commit at a time, and never batch a git command with any other tool call** (project gotcha). Parallel *editing* is fine; the git step is the serialized chokepoint.
> **Same-file overlap (N3):** within Wave 1, **P3-A** (the meter hook at `Block.tsx:~802`) and **P3-B** (the container render at `Block.tsx:925-936`) both edit `Block.tsx` (and P3-B also edits `Block.test.tsx`). Author + commit these two **in sequence**, not concurrently — `tsc -b` + the serialized-commit rule catch a clash, but sequencing avoids the merge churn outright. (All other Wave-1 items touch distinct files and can be authored in parallel.)
>
> **Team note:** Wave 1 is the parallel fan-out band — independent WV items go to separate workers, but the **single commit chokepoint** and the Block.tsx sequencing still bind. P2-A1 (Wave 2b) is NOT a Wave-1 parallel item.

**Wave 2a — C++ + cross-boundary, the smaller cross-boundary items (serialize all C++ edits AND commits).** Depends on Wave 1 being type-clean (shared files like `Block.tsx`, `useGraphStore.ts`, `useKeyboard.ts`):
- P1-A Part 2 (C++ close-at-delete-INITIATION in the `elementGraphRemoveNode` handler `:1696-1715`, before `postMessage` `:1709`; defensive no-op check in `valueTreeChildRemoved`).
- P1-A Part 1 (WV fast-close gestures + the embed-open rung of the single Esc authority) — pairs with Part 2; build together.
- **I4 Part B — persistent favourite star (B2):** new `elementToggleFavorite` bridge fn (C++ wrapper over `PluginUsageTracker::toggleFavorite` + explicit `scheduleGraphPush`) + `usePluginBrowserStore.toggleFavorite` action + the star button on `PluginRow`/command rows.
Serialized-commit rule (R5): one commit per call, never batched with other tool calls.

**Wave 2b — P2-A1, the full host-driven Container dive (Scope B) — its OWN serialized wave; touches the core snapshot contract.** Runs AFTER Wave 1 (type-clean) and ideally after/with Wave 2a (so P1-A's close path exists when the dive needs to close-on-dive, interaction b). **Quarantined** because it parametrises the snapshot builder:
- C++ sub-tasks 1–6 (§3 P2-A1): `currentBoardNode` pointer; parametrise the snapshot/canvas/outline builder to walk it instead of `getCurrentGraph()` (`:5188/:5214/:5239`); real breadcrumb-PATH emitter (replace the 2-tuple `:5218-5221`); `isUnderActiveGraph`→`isUnderCurrentBoard` (`:4924-4941`); `enterContainer`/`exitContainer` bridge fns; `containerChildren` snapshot field.
- WV: `GraphCanvas.tsx` double-click→`enterContainer` / pane-double-click+Esc+breadcrumb-up→`exitContainer`; close-on-dive (interaction b) via the single teardown path; `containerChildren` in `types.ts`/`Block.tsx` (enriches the P2-A0 preview with real names).
- **Must land with its regression guard GREEN before Wave 3:** existing top-level canvas/breadcrumb/zoom/semantic-tier Storybook + Vitest still pass (default `currentBoardNode` == top level == byte-identical snapshot). Author the four critical-interaction behaviours (a–d) as specced; do not discover them at QA.
- This is **one developer/worker's serialized lane** (core-contract change) — **not** a Team parallel fan-out item. Other workers must not edit the snapshot builder concurrently.
Serialized-commit rule (R5) applies; given the contract surface, prefer a focused commit per sub-task.
- *(Beyond P2-A1 — Portal `.elboard` link-traversal, Module tier, persisted-per-board viewport — remain DEFERRED.)*

**Wave 3 — Build, sign, install (serial, single actor).** Runs after Wave 2b's regression guard is GREEN.
- `cmake --build build-merged -j8` (reconfigure only if a **new file** is globbed; **none expected** — P1-A, I4-B, and P2-A1 all add methods/fns to *existing* `element_webview_host.cpp` + headers, not new translation units).
- Ad-hoc sign (`scripts/sign-all-macos.sh build-merged`) per project rule.
- **Force webview bundle freshness (BUILD-BUNDLE, N4 — make it falsifiable):** webview-only changes can leave `Element.app`'s embedded bundle stale. The embedded bundle is at **`build-merged/element_app_artefacts/Element.app/Contents/Resources/webview/`**, with content-hashed entry JS in **`…/webview/assets/index-<hash>.js`** referenced by `…/webview/index.html`. Concrete pass condition: **capture `shasum …/webview/assets/index-*.js` (and the `index-<hash>.js` filename) BEFORE the rebuild, and after; they MUST differ** when any `webview/src/**` changed. If unchanged → the POST_BUILD `dist`→bundle copy didn't run: force-copy `webview/dist/*` → `…/Contents/Resources/webview/` **or** `touch` a `.cpp` so `element_app` relinks and the copy fires (project gotcha `project_webview_bundle_postbuild`), then re-check the hash.
- Install/refresh `build-merged/element_app_artefacts/Element.app` (build+install-before-claiming-done rule). **The W4 sweep must not start until BUILD-BUNDLE's pre/post hashes differ** — never draw conclusions from a stale bundle.

**Wave 4 — Deterministic reliability gate, THEN visual QA sweep (serial, ONE actor drives the live app).**
- **4a · Deterministic crash gate (R3):** drive the open/close + delete-while-open cycles via **`cli-anything-element` OSC + `verify assert --alive --no-crash` in a scripted loop** — NOT computer-use (the prior manual sweep gave a *false* crash reading). Named scripted cases, ×200 total: `open-A → delete-A`, `open-A → delete-B`, `open-A → delete-A's-parent-container`. Pass = `--alive --no-crash` after every iteration, no `.ips`.
- **4b · Visual/interaction sweep (§5):** reserved for VISUAL/interaction judgment only — motion, legibility, the *feel* of I2/I3 — via `video-qa-capture`. Nothing else may drive the app concurrently (false-crash hazard).
- If any case fails, loop back to the owning wave, rebuild, re-gate.

**What parallelises (Team fan-out):** the independent WV items in **Wave 1** (separate workers, distinct files), and Wave 2a's P1-A vs I4-B can progress on separate workers. **What must serialize:** **every commit (WV and C++ alike, R5)**; every C++ edit on `element_webview_host.cpp`; **Wave 2b (P2-A1) entirely — one worker, core-contract change, no concurrent snapshot-builder edits**; the build/sign/install (Wave 3); and *all* live-app driving (Wave 4, single actor) — 4a's scripted loop and 4b's video sweep never overlap. **Wave order:** 0 → 1 (parallel) → 2a (∥ within) → 2b (serial, solo) → 3 → 4.

---

## 5. e2e Gate — Deterministic crash/round-trip gate (5a) + Visual/dive sweep (5b)

> **Two distinct mechanisms (Architect R3).** Crash/UAF judgment is **scripted OSC**, not eyeballed video; the video sweep is for visual/interaction *feel* only. The prior manual computer-use sweep produced a *false* crash reading — never let computer-use be the crash oracle again.

### 5a — Deterministic crash gate (scripted, the crash oracle)
Driven entirely via `cli-anything-element` OSC + `verify assert`, single actor, fresh launch (`app launch --fresh`), teardown `app kill`. **No computer-use.** Named cases, **×200 total**, `verify assert --alive --no-crash` after **every** iteration (fail = any non-alive / any new `.ips`):
- **C1** `open editor on A → delete A` (close-at-initiation, no UAF).
- **C2** `open editor on A → delete B` (A's editor must survive).
- **C3** `open editor on A → delete A's parent container` (close-first, no UAF).
- **C3-dived** (Scope B) `dive into container C → delete C (or its ancestor) while dived` → exits to a surviving ancestor, no crash/dangling-board (P2-A1 interaction c).
- **C4** rapid `open A → close A` churn (teardown-order stress).
- **C5** (Scope B, if scriptable via `cli-anything-element`) `enterContainer → assert breadcrumb path + nested node present → exitContainer → assert parent restored`; and `enter while editor open → assert editor closed` (interaction b). If not scriptable over OSC, this moves to 5b visual.
Across VST3 + AU + CLAP plugins. This is the PM-1/PM-4 + PM-3 (dive) gate.

### 5b — Visual / interaction sweep (the *feel* oracle)
`video-qa-capture` → pick the flow, **drive** the UI (computer-use/AX for the native JUCE app; the webview is hosted, so drive the app window, not a browser), screen-record, narrate via sidecar notes / `say`, trim with ffmpeg, hand to `video-localfile` + `analyze_video`. **Judge interaction, not stills** (motion/enter-exit/state, per `feedback_judge_interaction_not_stills`). Serialized app use; **never overlaps 5a**.

**Re-test on a clean launch (each = a checklist line) — VISUAL judgment:**
1. **Multi-block add** — QuickAdd (right-click canvas) + add 3 blocks; names legible (backlog), star toggles persist.
2. **Cable connect** — drag a port→port cable; cable renders; port-type QuickAdd shows the star + name-priority.
3. **Plugin GUI open AND close (P1-A)** — double-click a plugin Block → editor embeds; **`Esc` closes it** (single Esc authority); double-click again toggles; ✕ affordance closes. (Crash-safety of these is proven in 5a; here judge the *feel*.)
4. **Node-delete closes editor (P1-A Part 2)** — open embed, delete that Block → editor visibly closes, no orphan; delete a *different* Block → embed stays. (UAF-safety proven in 5a-C1/C2/C3.)
5. **Full Container dive (P2-A1, Scope B)** — double-click a Container → canvas **swaps to the REAL nested board** (actual Audio In/Out, child plugins, cables — not placeholders); breadcrumb shows the real multi-level path; add/move a node inside → it appears (round-trip); `Esc` / double-click-empty / breadcrumb-up → exits to the parent **in lockstep** (breadcrumb + canvas agree, no stale nested content); **2-level** nesting works (enter→enter→exit→exit); diving with an editor open closes the editor first. Portal → honest "external portal" affordance (no link-traversal). Not-yet-dived Container shows the honest "N Blocks — open to edit" preview.
6. **Cmd+K Esc-close (P2-B)** — open palette, type, `Esc` → palette closes; an open embed behind it stays open (priority order).
7. **LiveHealth rounding (P2-C)** — CPU one decimal, latency one decimal single-line.
8. **VU decay + idle-vs-dead (P3-A)** — drive signal (meter rises), stop *while engine live* → decays to 0 and holds 0; then confirm a host-push *halt* shows the distinct "stale/no-data" state (NOT green), visibly different from idle.
9. **Container honesty (P3-B)** — not-yet-dived Container Block shows the honest "N Blocks" preview; zero `NODE_x`.
10. **Top-level regression sanity (P2-A1 guard)** — at the top level (not dived) the canvas, breadcrumb, zoom, and semantic tiers behave exactly as before the snapshot-builder parametrisation; diving then fully exiting returns to an identical top-level view.

**Exit:** 5a passes 200/200 clean (no `.ips`, incl. C3-dived; C5 if scriptable) **and** all 10 5b lines pass on a clean launch — including the P2-A1 dive round-trip and the top-level regression sanity. Log results to `.omo/audit/ui-comments.jsonl`.

---

## 6. ADR — QA Fix + Bounded Improvements

**Decision.** Fix all 7 P-defects + the backlog item, AND ship **5** improvements (editor fast-close via a **single** Esc authority; **honest container preview P2-A0**; **the full host-driven Container dive P2-A1 — Scope B, Glen override 2026-06-05**; falling-envelope VU ballistics **with an idle-vs-dead state**; QuickAdd name-priority + a **persistent** favourite star). VU decay is **client-side** (falling-only display envelope). Editor close-on-delete fires at **delete initiation** (processor still alive), never reactively. The favourite star persists via a new `elementToggleFavorite` bridge fn (explicit `scheduleGraphPush`, since the host does not subscribe to the tracker). **Scope-B surface: 3 new bridge fns (`elementToggleFavorite`, `enterContainer`, `exitContainer`) + 1 new snapshot field (`containerChildren`) + the snapshot builder parametrised to walk `currentBoardNode`.** Diving while an embedded editor is open **closes the editor first** (decision b).

**Drivers.** Reliability credibility of the flagship embedded editor (D-1); honesty/trust — no visible fake data (D-2); delivering the spec's core speed-nav gesture (Glen's Scope-B priority) — bounded *delivery* yields to bounded *containment* (D-3 reinterpreted: ship the dive, but quarantine + regression-guard it).

**Alternatives considered.**
- *Scope (re-decided 2026-06-05):* A1 fix-only (rejected — cosmetic-breadcrumb lie + sub-instrument editor loop); **A2 fix + P2-A0 honest affordance, dive deferred (rejected by Glen override — leaves the spec's nested-navigation gesture unbuilt; the honest affordance is a holding pattern, not the feature)**; **A3 / Scope B — fix + improvements + the full host-driven Container dive (CHOSEN, Glen override).** Cost (new `currentBoardNode` + parametrised snapshot + breadcrumb-PATH emitter + `isUnderCurrentBoard` + 2 bridge fns + 1 field, core-contract regression surface) is **accepted and contained**: quarantined to serialized Wave 2b behind a hard regression guard, with the four critical interactions designed up front.
- *Container dive mechanism:* verified the snapshot is hardwired to the top-level active graph tab (`:5188/:5214/:5218-5221/:4924-4941`) with no nested-board concept — so P2-A1 is a genuine feature build (§3 P2-A1 sub-tasks 1–6), not a reuse. P2-A0 retained as the not-yet-dived preview.
- *Dive-with-editor-open (interaction b):* carry the editor across the board swap (rejected — the editor's anchor Block may not exist on the new board → orphaned/mis-anchored native child) vs **close the editor on dive (CHOSEN** — safe, predictable, reuses the single teardown path).
- *Editor close-on-delete locus:* reactive close in `valueTreeChildRemoved` (**rejected, R2/N1** — the engine pulls + releases the `Processor` (`graphmanager.cpp:552/564`), the listener fires *in between* at `:575`, final ref-drop `:579`; closing at `:575` runs `~PluginWindowContent`→`editorBeingDeleted` on a pulled-and-released processor = UAF). **Chose close-at-initiation** in the `elementGraphRemoveNode` bridge handler before `postMessage`.
- *VU decay:* B2 host-side ballistics (rejected for this symptom — host *stopping* its push, which a host-side loop cannot tick through). **Chose B1 client falling envelope** + **idle-vs-dead** state (R4).
- *P3-B:* fabricate nicer placeholders (rejected — NOTHING-fake). **Honest "N Blocks" count chosen** for the preview; **real child-names are now IN (`containerChildren`, via P2-A1)**, not deferred.

**Why chosen.** Scope B delivers the actual nested-navigation gesture the keyboard spec promises (Glen's stated priority) while the smaller defects ship in parallel; the dive's core-contract risk is contained by the default-top-level == byte-identical invariant + the hard regression guard + the four designed interactions + Wave-2b quarantine. Close-at-initiation is the only ordering that avoids the verified delete-UAF; closing-on-dive avoids the editor-carry orphan; B1 is the only option that clears the reported stale-hold; a single Esc authority makes precedence designed.

**Consequences.**
- (+) The keyboard table's "double-click → dive into nested Board" becomes **real** — the canvas shows the actual nested board, ≥2 levels, in lockstep with the breadcrumb.
- (+) Embedded editor gains a real open→tweak→close loop and can no longer orphan or UAF on delete or on dive (close-at-initiation + close-on-dive + PM-1/PM-4 guards, proven by the 5a gate).
- (+) Two NOTHING-fake offenders eliminated; the Container shows real child names (`containerChildren`); the meter is legible + honest and distinguishes idle from dead.
- (−) **Core snapshot contract changes** (builder parametrised to `currentBoardNode`) → real regression surface on the existing PASS top-level canvas. Mitigated by the default-identical invariant + the hard regression guard (acceptance), but it is the batch's biggest risk.
- (−) **Scope-B bridge/snapshot surface: 3 new bridge fns + 1 new snapshot field** (vs the prior "1 fn, 0 fields"). A new shared rAF meter tick for VU.
- (−) Larger, less-trivially-reviewable batch; mitigated by Wave 2b quarantine + per-sub-task commits + Team fan-out only on the independent items.

**Follow-ups.**
- Portal `.elboard` external link-traversal, the Module tier, and persisted-per-board viewport — still deferred (P2-A1 delivers Container dive only).
- Optionally unify cable/node/bus meter ballistics host-side later (B2 as a *consistency* refactor) once B1's constants are proven.
- Reliability workstream R2→R6→R8 (separate gate) and installer-wiring the sandbox helper — untouched here.

---

## 7. Acceptance Criteria (flat checklist)

- [ ] **P1-A.1** Canvas double-click opens embed; `Esc` closes it (single Esc authority); host stays `--alive --no-crash`.
- [ ] **P1-A.2** Double-clicking the already-embedded Block toggles the editor closed.
- [ ] **P1-A.3** A ✕ / overlay affordance closes the embed.
- [ ] **P1-A.4** Deleting the embedded Block closes the editor **at delete initiation** (before the engine frees the processor) — no orphan, no UAF; deleting a different Block leaves it open; deleting the embedded Block's parent container closes it first.
- [ ] **P1-A.5** All close paths route through the single `pluginEditorClose()`; the close-on-delete fires in the `elementGraphRemoveNode` handler before `postMessage`, NOT reactively in `valueTreeChildRemoved`.
- [ ] **P2-A0.1** A not-yet-dived Container Block shows the honest "▦ N Blocks — open to edit" preview, count matching `getNumNodes()`; **never** placeholders.
- [ ] **P2-A1.1** (Scope B) Double-click a Container → canvas swaps to the **REAL** nested board (actual Audio In/Out, child plugins, cables — not placeholders).
- [ ] **P2-A1.2** Breadcrumb shows the real **multi-level path** (snapshot-driven), and `Esc` / double-click-empty / breadcrumb-up exits to the parent **in lockstep** (breadcrumb + canvas agree, no stale nested content).
- [ ] **P2-A1.3** Add/move a node **inside** the dived board → host push reflects it (round-trip; proves `isUnderCurrentBoard`).
- [ ] **P2-A1.4** Dive while an embedded editor is open → the editor **closes first** (decision b), no orphan, no UAF.
- [ ] **P2-A1.5** Delete the container you're dived inside (or its ancestor) → exits to a surviving ancestor, no crash/dangling-board (5a-C3-dived).
- [ ] **P2-A1.6** **2-level** nesting works (enter→enter→exit→exit); Portal double-click → honest "external portal" affordance (no link-traversal).
- [ ] **P2-A1.7 (REGRESSION GUARD)** After the snapshot-builder parametrisation, the existing top-level canvas/breadcrumb/zoom/semantic-tiers are unchanged (default `currentBoardNode` == top level → byte-identical snapshot); Storybook + the existing Vitest still pass.
- [ ] **P2-A1.8** Container preview shows **real** child names via `containerChildren` (folds in P3-B "real names"); a nameless child shows its category icon, never a fabricated label.
- [ ] **P2-B** `Cmd+K` palette closes on `Esc` with focus in the search field; with an embed open behind it the embed stays open (priority: palette → embed → deselect); exactly one window Esc listener; backdrop click + arrow/Enter nav still work.
- [ ] **P2-C** LiveHealth CPU shows one decimal; latency shows one decimal on a single line; matches `StatusBar` for the same state.
- [ ] **P3-A.1** Meter rises immediately to the real level on signal.
- [ ] **P3-A.2** On signal stop *while engine live* (host pushes 0), meter decays smoothly to 0 and holds 0.
- [ ] **P3-A.3** Host stops pushing entirely for >250 ms → distinct "stale/no-data" state (NOT a green meter), visibly different from idle (R4).
- [ ] **P3-A.4** (unit) Displayed value is monotonically non-increasing between host pushes and never exceeds the last host value.
- [ ] **P3-B.1** Container Block shows the honest "N Blocks — open to edit" preview matching `getNumNodes()` (the P2-A0 render; enriched with real names by P2-A1.8).
- [ ] **P3-B.2** Zero `NODE_x` placeholder literals remain in `Block.tsx`, enforced by **GATE-NODE** — the grep guard in `verify-stories.mjs`, **scoped to exactly `Block.tsx`** (NOT `src/components/**`; `NODE_A`/`NODE_B` are legit fixtures in `BusInspector.test.tsx` — Critic note 1), makes `npm run verify-stories` fail if `NODE_` reappears in `Block.tsx` (RED→GREEN).
- [ ] **P3-B.3** (Critic note 2) `Block.test.tsx:205-207`'s `NODE_A`/`NODE_D` assertions are updated to expect the honest affordance (and real names once `containerChildren` lands) — green, not a regression.
- [ ] **P3-C** A wheel-zoom sweep <0.5→>0.8 passes through the `standard` tier (no compact↔expanded skip); unit test asserts band coverage.
- [ ] **BACKLOG.1** (Part A, WV) Long plugin names show more characters before truncating at the default QuickAdd popup width.
- [ ] **BACKLOG.2** (Part B, cross-boundary) Every QuickAdd/command plugin row has a far-right star toggle wired through the new `elementToggleFavorite` bridge fn to `PluginUsageTracker::toggleFavorite`; toggling **persists** (survives reopen, reflected in Favorites) and doesn't add the Block; keyboard nav unaffected.
- [ ] **BUILD** `npx tsc -b` clean, `npm run build` clean, `npm run verify-stories` green (incl. **GATE-NODE**), C++ builds (**3 new bridge FNs** `elementToggleFavorite` / `enterContainer` / `exitContainer`; **1 new snapshot field** `containerChildren`; snapshot builder parametrised to `currentBoardNode`), ad-hoc signed, `Element.app` reinstalled.
- [ ] **BUILD-BUNDLE** (N4) `shasum` of `…/Element.app/Contents/Resources/webview/assets/index-*.js` (and the hashed filename) **differs pre/post rebuild**; W4 does not start until it does.
- [ ] **E2E-5a** Scripted-OSC crash/round-trip gate passes 200/200 (`--alive --no-crash`, no `.ips`) across C1–C4 + C3-dived (and C5 if scriptable) on VST3+AU+CLAP — NOT computer-use.
- [ ] **E2E-5b** All 10 §5b visual/interaction lines pass on a clean, serialized launch (never overlapping 5a), incl. the P2-A1 dive round-trip and the top-level regression sanity; results logged to `.omo/audit/ui-comments.jsonl`.
- [ ] **OUT-OF-SCOPE HONORED** No Dashboard/Macro/Scene/Perform-mode UI wired; out-of-process editor architecture intact; no RT/audio-thread/sandbox-IPC changes; **no Portal `.elboard` link-traversal / Module tier / persisted-per-board viewport** (P2-A1 = Container dive only); the new bridge/snapshot surface is exactly **3 fns + 1 field** (`elementToggleFavorite`, `enterContainer`, `exitContainer`, `containerChildren`) — nothing more.

---

## Deferred / Out of Scope (with rationale)
> **P2-A1 (the host-driven Container dive) is NO LONGER deferred** — Glen's Scope-B override moved it IN-SCOPE this batch (§3 P2-A1, Wave 2b). What remains deferred is everything *beyond* Container dive:
- **Portal `.elboard` external link-traversal** — diving into an external linked board (vs a local Container). P2-A1 handles local Containers only; Portals get the honest "external portal — open to edit" affordance. Separate slice (file I/O + link resolution).
- **Module tier navigation** — the named-grouping logical tier above Blocks; distinct from Container nesting. Not built by P2-A1.
- **Persisted-per-board viewport / spatial-bookmark-per-board** — P2-A1 does not persist per-board pan/zoom across dives; the parent viewport behaviour is unchanged. Add later if Glen wants it.
- **Host-side meter ballistics refactor (B2)** — does not fix the reported stale-hold (host stops pushing) and touches the shared 60 Hz contract; revisit later as a *consistency* unification once B1's constants are proven.
- **Command-palette visual redesign / new command sources** — only the Esc-close bug (P2-B) and the favourite-star consistency (I4) are in scope.
- **Reliability ship-gate (R2 AU-hang → R6 sandbox default-ON → R8 crash harness) + installer-wiring the sandbox helper** — separate workstream/gate; not blocked by and does not block this UI batch.
- **VU meter on cables/buses, surround per-lane decay** — out of scope; P3-A is Block-VU only.
