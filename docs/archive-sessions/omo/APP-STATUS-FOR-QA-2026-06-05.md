# Element — App Status for Glen's QA (2026-06-05)

## TL;DR
A full session of fixes shipped (**12 commits**, branch `chromatic-ui-review`), all formats built fresh + ad-hoc signed + **installed**. The container **dive** was found dead in the live app and **fixed + re-verified live**. Two editor papercuts addressed (one fixed, one documented-infeasible). Deep-interview gap map written. **In flight now:** lean blocks + remove generic knobs + auto-route suggestions.

## INSTALLED — where to find it
| Form | Location | Notes |
|---|---|---|
| Standalone | `~/Applications/Element.app` | ad-hoc signed, fresh bundle. (Old `/Applications/Element.app` is root-owned — left untouched; to replace it run `sudo ditto build-merged/element_app_artefacts/Element.app /Applications/Element.app`.) |
| VST3 | `~/Library/Audio/Plug-Ins/VST3/KV-Element.vst3` + `KV-Element-FX.vst3` | instrument + effect |
| AU | `~/Library/Audio/Plug-Ins/Components/KV-Element.component` + `-FX` + `-MFX` | instrument + effect + MIDI-fx |
| CLAP | (built, not installed) `build-merged/element_*_artefacts/CLAP/` | available if wanted |
All carry the same webview build (`index-DNK1IxFy.js`) with every fix below. AU/VST3 will appear after your DAW rescans plug-ins.

## WHAT TO TEST (and what "pass" looks like)
1. **Container dive** ⭐ (the big one): double-click a Container block → canvas walks INTO its nested board (real nested blocks, BLOCKS count changes, breadcrumb deepens). EXIT / double-click-empty / Esc walks back out. *Verified live by me; please confirm it feels right.*
2. **Plugin editor open/close**: double-click a plugin block → its real VST3/AU editor embeds; close via the **✕ pill** or double-click again, or **delete the block** while open → editor vanishes (no orphan/ghost). *Known: Esc won't close it while the plugin has keyboard focus — use ✕ (see Known Issues).*
3. **Live Health**: CPU + latency read rounded (e.g. `2.4%`, `23.2 ms`) — no 13-digit floats.
4. **Block meters**: a meter rises on signal, **falls away** after sound stops (no stuck-green), and shows a distinct dim/grey "no-data" look if the engine stalls.
5. **Container preview**: a Container block shows "▦ N Blocks — open to edit" (real count) — **no fake NODE_A–D**.
6. **★ Favourites**: star any plugin row in QuickAdd / Cmd+K → persists (survives reopen).
7. **Cmd+K palette**: opens, closes on Esc (when focus is on the canvas).
8. **Zoom**: scroll-zoom passes through the middle ("standard") tier instead of jumping.
9. **As-plugin**: load KV-Element as AU and VST3 in your DAW — does the edit experience match standalone? (state recall, window resize, nested editors, transport). *Unverified by me — needs your DAW.*

## KNOWN ISSUES (be aware while testing)
- **Esc doesn't close a focused embedded plugin editor** — the plugin's window owns the keystroke (upstream of our handler). Use the **✕ pill** / double-click / delete. Root-caused as infeasible-to-intercept-cleanly without breaking the plugin's own Esc.
- **Re-open after ✕-close** (a plugin editor, same session) — a state-sync fix shipped, but the *specific* live case might also be a VST3 editor-recreate quirk I couldn't reproduce headlessly. **Please confirm** in your testing.
- **Full crash-isolation not default-on** — the focused editor is out-of-process + a sandbox host is proven, but plugins still run in-process by default (sandbox-everything = a gap, see gap map).
- **No autosave/crash-recovery** yet (a reliability gap you flagged as non-negotiable).
- **Live computer-use QA lost screen-recording permission** mid-session, so my last few verifications are via Storybook + your eyes rather than my driving.

## IN FLIGHT (building now, per your latest direction)
- **Lean blocks**: removing the generic GAI/PAN/MIX/FRE/Q knobs; param/modulation ports collapsed behind a toggle by default (only essential I/O shown).
- **Auto-route suggestions**: porting the JUCE proximity ghost-connector logic (suggest compatible cables for nearby blocks, accept to wire) → faster building.
*These will land with Storybook renders for your sign-off + a rebuild of all formats.*

## GAP MAP (deep-interview output)
Full analysis: `.omc/specs/deep-interview-app-status-gap-analysis.md`. Through-line: **depth-first on the core Edit/build + navigation, before breadth.**
- **Build & wire** (highest): deepen patching — conditional/logic routing + flow-debug, block-library breadth, wiring gestures (auto-route, in flight).
- **Navigate**: model right; gap = deep multi-level / cross-board (Modules, Portals) beyond the single-level dive.
- **Run/Perform**: deferred until Edit is fully built (your call).
- **As-plugin**: both standalone + AU/VST3 first-class — in-DAW parity unverified.
- **Trust**: all three floors non-negotiable — gaps: sandbox-default-on + autosave.
- **Feel**: speed + density primary — needs your live walkthrough.
- **Deferred (your call):** mixer/channel-strip view, macro/Scene/Preset unshelve, Perform mode.

## Commits this session (chromatic-ui-review)
38918eeb · e7a083a5 · 73eff777 · a5ae9178 · 8e73a401 · 102bf1e2 · 3f5b02ad · 19dad2ba · c558c943 · 57ff62b6 · a29d23a8 · fe8477d5
