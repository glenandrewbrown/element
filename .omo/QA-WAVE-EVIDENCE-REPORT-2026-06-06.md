# QA Wave Evidence Report — 2026-06-06

Per-task verification ledger for Glen's 10 feedback items. Evidence tiers:
**LIVE** = I drove the installed app via computer-use and saw it work (screenshots in session transcript) ·
**AUTO** = automated test evidence (vitest / ctest / verify-stories, exit codes captured) ·
**CODE** = implementation reviewed + built, no behavioural proof.

Honest headline: the FIRST completion claim was premature on visual verification.
This re-verification round live-drove every item and found **2 real defects**
(both fixed + committed + re-verified live this round) and **1 item my tooling
cannot drive** (needs your 5-second check).

Branch `chromatic-ui-review` (kept, per your option 3). Commits `1c05e37b..eae56758` (10).
Installed: `~/Applications/Element.app` + VST3 ×2 + AU ×3 — webview `index-BGukgiyf.js`,
binary carries all 3 new natives (strings-verified), helper nested.

## Per-task ledger

| # | Task | LIVE | AUTO | Notes |
|---|------|------|------|-------|
| 1 | Reload menu never appears | ✅ right-clicked canvas/blocks/menus across two sessions — native menu never appeared | ✅ 9 vitest (defaultPrevented matrix) | |
| 2 | RC = full board menu; ⇧RC = quick-add | ✅ both gestures screenshotted (BOARD menu w/ Add Block/Paste/Select All/View/Canvas; ⇧RC popup + first-keystroke search "simple reverb"→added) | ✅ GraphCanvas suites | |
| 3 | ⌥+drop cable → port-typed QuickAdd + auto-connect | ⚠️ **NOT live-verified — tooling limit**: synthetic pointer events cannot carry a held modifier through a drag-release (alt/shift/cmd flags don't merge from System Events into CGEvent drags; reproduced 3 ways) | ✅ unit (alt-drop→portType popup, pick→bridge args, plain-drop hint), bridge marshalling, native handler present in binary | 🔴 needs your 5-sec manual check |
| 4 | No VU on MIDI-only blocks | ✅ MIDI Out IO block inside container shows status deck, no meters | ✅ 4 regression tests + 2 device stories | residual: decorative "LR" port-wells still render on non-audio blocks (logged below) |
| 5 | Inline controls on simple blocks | ✅ **after fix**: Comparator face shows ‹ › op-chooser at DEFAULT zoom; stepper clicks round-tripped the engine operator (`>`→`<` rendered from engine intMode) | ✅ 39 T5 tests + BridgeContract set-op round-trip (16/16 asserts) | **DEFECT FOUND+FIXED**: face was tier-gated invisible at zoom>0.9 (the default) — `eae56758` |
| 6 | Sidebar de-clutter | ✅ new IA visible all session (search-first, chips, gear-scan, sectioned) | ✅ 61 tests; 1000-plugin fixture story | |
| 7 | Board/Project/Block naming | ✅ File menu "Open Project…"; board menu "Select All Blocks"; sidebar "1 board" | ✅ 2 permanent guards as tests (ctest `terminology-guard` + vitest scanner) — fail on reintroduction | window title shows persisted board name "Graph" from old session file (data, not UI string — correct) |
| 8 | Auto cable suggestions | ✅ root cause live-diagnosed (threshold unreachable + ghosts under blocks); after fix: dashed ghost + footer hint live; **Enter-accept created a real engine cable (CABLES 0→1)** | ✅ 6 edge-gap tests incl. live-repro shape | ⌘-drop accept = same modifier-tooling limit; Enter/Tab accepts proven live |
| 9 | Cable redesign | ✅ bezier curve + endpoint plug seen on the accepted cable | ✅ 57 cable tests (paths/markers/plugs/pulse-gating); matrix + 40-cable stories | pulse needs live signal — story-verified only |
| 10 | ⌘⇧D group into Container | ✅ **after fix**: ⌘⇧D wrapped Valhalla+Comparator into a Container — 4 IO nodes auto-created, blocks moved inside (sidebar tree + BLOCKS 2→1), dive-in shows Level-1 chrome + breadcrumb | ✅ GroupNodesTests 5 engine cases (boundary reroute, CV refusal, state survival, dive, IO refusal) | **DEFECT FOUND+FIXED**: chord was natively bound to Duplicate-board and never reached the webview — rebound native to ⌘⌥D, `eae56758` |

## Defects found by THIS verification round (the value of doing it)

1. **T5 face invisible at default zoom** — control deck gated off at "expanded" tier; default zoom (>0.9) IS expanded. Fixed: inline face renders at expanded. (`eae56758`)
2. **⌘⇧D native collision** — `guiservice.cpp` default keypress for Duplicate-board ate the chord; pressing it duplicated the board. Fixed: duplicate → ⌘⌥D. (`eae56758`)

## Residual defects logged (cosmetic/UX, not blocking — next wave)

- Decorative "LR" port-wells render on blocks with no audio ports (Comparator, MIDI Out) — honest-empty but misleading; gate wells like the meters.
- After grouping, the auto-opened block tabs show raw UUIDs.
- Container block labelled "GRAPH (NESTED)" / default name "Graph" — should be Board/Container terms.
- Generic QuickAdd adds spawn top-right, not at cursor (pre-existing positioning bug class; T3's path positions correctly — reuse it).
- Plugin/internal editors auto-open on every add (pre-existing; confirm wanted).
- Cmd+A on canvas can trigger browser text select-all when focus is outside the flow pane.

## Tooling limits (why some live checks are impossible for me)

Modifier-held drag-release (⌥-drop, ⌘-drop, ⇧-lasso) cannot be synthesized: computer-use
drags don't accept modifier args, and System Events key-down doesn't merge into the
CGEvent flags of a concurrent synthetic drag. Pure-key paths (Enter/Tab accept, ⌘⇧D)
and click paths verify fine. Your manual checks cover the remainder in seconds.

## 🔴 YOUR 3 MANUAL CHECKS (the only unverified behaviours)

1. **⌥+drop**: drag a cable off any port, hold ⌥, release on empty canvas → filtered
   search popup at the drop point → pick → block lands there already cabled.
2. **⌘-drop ghost accept**: drag a block near a compatible one until the dashed ghost
   shows → keep ⌘ held as you drop → cable materialises (Enter mid-drag already proven).
3. **⇧-drag lasso** still rubber-band selects (regression check after the chord rebind).

## Gate summary (fresh, post-fixes)

vitest full 2700+/0 · stories 345/346 (sole fail = pre-existing baseline) · ctest: only
documented env-flaky fail · tsc clean · architect reviewer APPROVED · installed-app
smoke alive/no-crash · all 6 installed products on `index-BGukgiyf.js`.
