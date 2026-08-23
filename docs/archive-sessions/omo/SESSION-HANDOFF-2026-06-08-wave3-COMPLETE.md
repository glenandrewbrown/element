# Wave 3 "Lean & Fast UX" — COMPLETE (autonomous ultrawork)

**Date:** 2026-06-08 · **Branch:** `wave-3-leanfast-ux` @ **`8b607e4a`** (merge) · base for PR = `local-enhancements`
**Installed:** `~/Applications/Element.app` + 7 plugins · webview marker **`index-BZj2jCL9.js`** (all 8 products)
**Mode:** `/oh-my-claudecode:ultrawork` — resumed from `SESSION-HANDOFF-2026-06-08-wave3-ultrawork.md`. Phases 0–3 + 5.4 were already done; this session did **Phase 5-rest + Phase 4 + build/install + autonomous QA**.

## What shipped this session

### Phase 5 (commit `3768aed4` on `wave-3-leanfast-ux`)
- **5.1 Reroute knot** — double-click a cable → drops a signal-typed reroute (audio→AudioReroute / MIDI→MidiReroute / value→Reroute) that splices the cable through it via a NEW atomic single-undo host action `elementGraphInsertReroute` (`InsertRerouteMessage`); drag-off-port offers "Add Reroute" via QuickAdd.
- **5.2 Cmd/Ctrl+G** group-into-Container alias (same block-filtered guard as Cmd+Shift+D). **Repro verdict:** the Cmd+Shift+D → `groupSelection` → `elementGroupNodes` path is correct; owner's "grouping not happening" = an **ineligible-selection UX gap** (needs ≥2 blocks selected), not a code bug.
- **5.3 Always-on breadcrumb** (clickable at every level incl. root) + collapsed-Container **honest** I/O signature (real essential-port counts + real `containerNodeCount`). Fixed a fabricated-"Audio In ▸ Audio Out" regression a worker introduced (NOTHING-fake).

### Phase 4 (commit `6afae119`, merged via `8b607e4a`) — async load, OWN branch, merged last
- **4.1 Async plugin load + UUID-preserving in-place swap.** Plugin instantiation now uses `createPluginInstanceAsync` (off the blocking message-thread path). A placeholder node is created instantly with its FINAL `tags::uuid` + a transient `tags::loading` marker + zero connectable ports (Block.tsx already renders the honest loading face). On the message-thread callback the real processor swaps into the SAME ValueTree (keeps uuid; swaps `tags::object/type/id` + resetPorts), driving `processor.removeNode`→`addNode` which rides the proven lock-free op-republish (`exchange(acq_rel)`). **NOT** `EngineService::replace` (would mint a new uuid → detach). `tags::loading` stripped in `Node::sanitizeProperties` (never persists to `.els`). Undo single-step; delete/undo-while-loading crash-safe (WeakReference + uuid re-lookup + ProcessorPtr adoption).
- **4.2 Editor ready-push** (`onEmbeddedEditorReady`, mirrors `onEmbeddedEditorClosed`); the `[0,80,160,320,640]` interim backoff is removed (single-shot open).
- **4.3 Docked DRAGGABLE editor** — new `EditorDragHandle` header repositions the overlay live via the existing `nativePluginEditorSetBounds` (0 React re-renders per pointermove; commit on pointerup). Glen's pick over a floating window.

## Gates (all green — evidence on disk)
- `npx tsc -b` clean · **vitest 3093 passed / 0 failed** (merged tree) · painter + terminology guards green.
- C++ build **exit 0, 0 errors/0 warnings**.
- ctest: **AsyncPluginLoadTests 5/5** (uuid-preserved, same-tree identity, loading=0 ports, anti-`replace`-mints-new-uuid proof, delete-while-loading safe) + **GraphNodeRenderSafetyTests** (swap-under-render stress) + GroupNodes/PortDefaults/CVFlow/InternalNodeNaming + 12 add/node/graph regression suites.
- **Independent opus RT-safety verifier: APPROVE-FOR-MERGE, 9/9 claims PASS** (`.omc/state/qa-wave-reports/w3-phase4-rt-verdict.md`). Phase-5 reviewer: 0 CRIT/MAJOR.
- **Live smoke + stability:** installed app launches (marker `index-BZj2jCL9.js`), runs, **0 crash reports**; `verify assert --alive --no-crash` **PASS 2/2** after driving 10 OSC commands (zoom/fit/mixer/editor/plugin-manager/transport/panic).

## Deferred MINOR — RESOLVED
- **Muted/bypassed-block ~4px well sliver (overflow-visible side-effect): DISMISSED by code.** Both `MutedOverlay` (Block.tsx:328) and `BypassedDim` (:369) use `borderRadius:"inherit"` → clipped to the block's rounded corners. `overflow-visible` (the 2.2 multi-cable fix) only exposes the intended port Handles. No defect. (Glen can still eyeball during feel-test.)

## ⛔ STILL NEEDS GLEN — visual/interaction feel-test (a HUMAN gate; tooling-blocked this session)
Autonomous **visual** QA was unavailable: computer-use display was down all session (the documented JUCE/CU flakiness — display is USEABLE per pmset, CU server can't capture), and the AX suites need `pyobjc`/`ApplicationServices` (missing in env). So the smoke + stability + all automated gates are proven, but the **feel** of each change wants Glen's hands. The installed app is up and ready (pid was 56641).

**Feel-test checklist (drive the installed `~/Applications/Element.app`):**
1. **Plugin-open speed / async load (headline):** add a heavy VST3/AU → the Block must appear INSTANTLY with an honest "loading…" face (no fake ports/meters) and fill in when ready; the Block must NOT vanish/detach when it loads; UI never freezes.
2. **Draggable editor:** open a plugin editor → drag its header → it repositions; "pop out to floating" still available.
3. **Reroute knot:** double-click a cable → a reroute knot drops at the cursor and the cable routes through it (one undo removes it).
4. **Cmd+G:** marquee ≥2 blocks → Cmd+G groups into a Container (same as Cmd+Shift+D).
5. **Always-on breadcrumb:** visible + clickable at the root and every nested level; collapsed Container shows "N▸M · K blocks".
6. Re-confirm the Phases 0–3 changes still feel right: cursor select-primary (left-drag marquees, pan on Space/middle/right), no-overlap on drop, multi-cable fan-out (2+ cables from one output), 3-tier collapse cycle (double-click title), collapsible panels (Cmd+\ / Cmd+Opt+\ / Cmd+.), inspector name-match + pin-to-face + auto-collapse-on-deselect, browser search-first IA.

## State
- Source tree clean; everything committed. `wave-3-phase4-async-load` branch retained (merged; can delete).
- No PR created (not requested). Branch ready for a PR onto `local-enhancements` when Glen wants.
- Per-task impl + review reports: `.omc/state/qa-wave-reports/w3-*` (5.1/5.2/5.3 impl, phase5-review, 4.1-4.2-impl, 4.3-draggable-impl, phase4-engine-brief, phase4-rt-verdict).
