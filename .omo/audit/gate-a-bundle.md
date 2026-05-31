# GATE A — Bundle for Glen's runtime confirmation

**Plan:** `.omo/plans/deep-app-audit.md` (XL). **Session:** /team via Workflow orchestration.
**Boundary:** Waves 1–2 done by agents. Everything past this gate (commit item 10, re-audit W3,
trimmed W4, React fixes W5, perf W6, Final review, Gate B) waits on YOUR runtime "okay".

---

## 1. What agents completed (Waves 1–2)

| Item | Result | Verified |
|------|--------|----------|
| W1 (1–5) investigation | 5 deliverable docs in `.omo/audit/` | — |
| 6 build + interim runtime evidence | VITE/CMAKE/APP exit 0; fresh dist embedded | dist `index-Bd8MitFW.js` present in Element.app (me) |
| 7 unblock prod build | `npm run build` exit 0; tests 147-fail → 0-fail | `tsc -b` exit 0 + `test:all` 1034/0 (me, independent) |
| 8 selector fixes | **NO-OP** — 0 reproduced loops (T3) | — |
| 9 selector regression guard | static TS-AST guard; suite 1038/0 | tsc 0; catch-power proven via temp fixture |

**Build/test state now:** `npm run build` exit 0 · `npm run test:all` = 95 files / 1038 tests / 0 fail.

---

## 2. Plan-reshape — Wave 1 evidence overturns 3 premises (all SHRINK the plan)

1. **Bridge "gap" is FALSE.** Call-site diff (`bridge-contract.md`, verified by me: `rg` → 0 callers
   for each): **0 missing native registrations.** The 7 audit-named fns (`elementScanPlugins` …
   `elementGetAudioDevices`) have **zero** webview call sites — unbuilt on both sides, not gaps.
   Audio-device data already flows via `elementGetEngineSnapshot.audioSetup`.
   → **Wave 4 collapses.** Only real C++ work = **item 15** (add `format`+`category` to graph-state
   block JSON + normalize format enum in C++). Items 13/14 are not registration gaps.
2. **Selector loops FALSE.** `selector-verdicts.md`: all 12 derived selectors safe → **item 8 void.**
   Guard (item 9) added anyway as future prevention.
3. **147 tests = 1 root cause, 0 regressions.** Stale `installJuceBridgeMock` vs the uncommitted
   JUCE-8 `emitEvent` backend → mock rewrite recovered the bulk. **No production source was wrong.**

Other W1: 1996-plugin/726KB boot fixture built (`webview/src/test/fixtures/plugins-large.xml`);
AX depth-10 reaches React DOM (depth-5 was the false-negative cause); 55-surface coverage manifest.

---

## 3. fix #1 + fix #2 — interim evidence (PASS, pending YOUR confirm)

Full detail + evidence paths: `.omo/audit/confirmation-log.md`.

- **fix #1 (boot hang):** cold boot, real 1996-entry plugins.xml → main thread idle in
  `mach_msg`, 3.8–8% CPU, NO `String::replace` spin, boots <10s, plugin browser populated. Stable 5m+.
  Evidence: `task-6-sample-coldboot.txt`, `task-6-render-coldboot.png`, `task-6-ax-map.txt`.
- **fix #2 (blank-UI selector loop):** real Element.app (shipped bundle) renders live
  `ParamStripEmbed` faders + full React root; headless corroboration: **79 faders mounted**,
  `loopSignatureFound=false`, `rootChildren=1`, 0 console errors.
  Evidence: `task-6-render.png` (primary), `task-6-fix2-console.txt`.

`agent-complete` ≠ `confirmed`. No agent marked anything confirmed.

---

## 4. NEW FINDING (P0-class) — `getGraphState` large-session hang

- **Same mechanism as fix #1** (O(n²) `juce::String::replace` quote-escape in
  `emitCompletionEvent`), on the path fix #1 deliberately left as a raw string.
- **Repro:** open `BRASS_4Horns.els` (2.1 MB) → 100%+ CPU, 1471/1471 samples in the escape loop,
  canvas never paints. (This is why fix #2 was verified via a demo-seeded render, not BRASS.)
- **Concrete fix (mirrors fix #1, low-risk):**
  - C++ `src/ui/element_webview_host.cpp:862` → `postCompletion(completion, JSON::parse(buildActiveGraphJson()))` (currently passes raw `String j`).
  - React object-or-string tolerance at 4 consumers: `useJuceBridge.ts:450, :503, :533` (invoke) + `:410` (`onGraphState` handler).
  - Leave the push path (`evalInBrowser`, host:4057) — it's O(n), not the hang.
- **Status:** UNFIXED (gate boundary). Ready to execute on your go.

---

## 5. GATE A — your hands-on checklist

Run `build-merged/element_app_artefacts/Element.app`:
1. Cold boot (no session) — confirm no hang, plugin browser responsive with the full 1996 list.
2. Load a session **with blocks** — confirm React canvas + embedded faders render and stay
   interactive (no blank, no beachball). **Avoid the largest sessions** (e.g. BRASS_4Horns.els)
   until the §4 finding is fixed — it currently hangs on load.

## 4b. NEW FINDING — FIXED (fix #3), interim-verified

Applied `src/ui/element_webview_host.cpp:862` → `postCompletion(completion, JSON::parse(buildActiveGraphJson()))`
(React already object-or-string tolerant → no JS change). Rebuilt `build-merged` Element.app (relinked 20:38).
- **BRASS_4Horns.els (2.1MB) now LOADS** (was HANGS): main-thread sample has **0** `String::replace`/`emitCompletionEvent`
  frames (prior hang was 1471/1471 = 100%). Canvas paints the full board. CPU settles ~18% idle.
- Cold-boot regression clean (96% idle in `mach_msg`).
- Evidence: `task-B-brass-render.png`, `task-B-brass-sample.txt`. Logged Fix #3 in `confirmation-log.md` (PENDING GLEN).

## 5b. Install state
- Fresh `build-merged/element_app_artefacts/Element.app` = ALL THREE fixes + current embedded dist (`index-JpZllOPM.js`).
  Launch directly: `open build-merged/element_app_artefacts/Element.app`.
- `/Applications/Element.app` is **root-owned** (prior local install, 24 May) — overwriting needs sudo (I can't/shouldn't).
  To install the fresh build there, run yourself:
  `! sudo ditto build-merged/element_app_artefacts/Element.app /Applications/Element.app`

## 6. Decisions needed from you
- **A.** fix #1/#2 confirmed? → unlocks item 10 commit (`fix(webview,host): boot-hang + blank-UI`).
- **B.** §4 `getGraphState` hang: fold into the item-10 commit, or make it the first task after the
  gate? (Recommend: fix it — it's fix #1's sibling and matches your "hangs on normal sessions".)
- **C.** Proceed past Gate A into W3 (re-audit) + trimmed W4/W5/W6 once A is confirmed?
