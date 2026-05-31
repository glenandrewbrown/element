# Ultrawork Notepad — Execute .omo/plans/deep-app-audit.md (Element UI + perf deep audit)
Started: 2026-05-29 (Europe/London)

## Goal
Execute the XL deep-app-audit plan wave-by-wave, respecting Gate A (Glen runtime-confirms fix #1/#2 BEFORE re-audit + commit) and Gate B (batched UI-fix confirm). oracle + ultrabrain BANNED for review.

## Environment (grounded)
- Branch: local-enhancements. Fix #1/#2 files uncommitted (element_webview_host.cpp, juceBackend.ts, nativeGraph.ts, BlockEmbed.tsx).
- DIRTY TREE: ~21 modified files incl Wave-5-ish (Cable/GraphCanvas/QuickAddPopup/MacroDashboard/SceneLauncher/VirtualKeyboard/usePerformStore/useGraphStore/vitest.config). Prior partial run. Commit f85e246c "resolve 6 UI bugs" already landed.
- build-merged + Element.app + webview/node_modules + /tmp/element-verify-venv ALL PRESENT.
- .omo/audit EMPTY (no plan artifacts yet). .omo/evidence has stale prior-run dirs (B,C,D,E,F,QA2,gate1-bundle.md).

## Plan critical path
2→7→6→GateA→11→13→16→17→24→F1-F4→GateB

## Now
Wave 1 fired: 5 parallel background agents (tasks 1-5). Investigation only, no fixes.
- T1 unspecified-high: build-block triage → .omo/audit/build-block-triage.md
- T2 deep: bridge contract (call-site diff) → .omo/audit/bridge-contract.md
- T3 unspecified-high+playwright: selector repro → .omo/audit/selector-verdicts.md
- T4 quick+verify-element-ui: boot-hang fixture + AX coverage → .omo/audit/ax-webshell-coverage.md
- T5 unspecified-low: coverage manifest → .omo/audit/coverage-manifest.md

## Todo (waves)
W1(1-5) → W2(6-9) → GateA[HUMAN] → 10(commit) → W3(11-12) → W4(13-16) → W5(17-23) → W6(24-26) → Final(F1-F4) → GateB[HUMAN]

## Wave 1 dispatched IDs (bg / ses)
- T1 build-block triage: bg_835cd12f / ses_18b0ce2feffeZ3vyLAdLVjS0qN
- T2 bridge contract:    bg_d3d4f055 / ses_18b0cadcbffe3Qw3iBGQ9owLXa
- T3 selector repro:     bg_71de543c / ses_18b0c7b88ffeXOa2X8q8h1r1nn
- T4 fixture+AX:         bg_1e67581d / ses_18b0c4df5ffeU7Lrrla30UbJ4s
- T5 coverage manifest:  bg_cd8589e6 / ses_18b0c2b63ffekeVTd6SXAaixyz

## Findings
- Working tree carries uncommitted Wave-5 edits => Task 10 must stage ONLY fix #1/#2 + Gate-A-confirmed selector files; ignore the rest.

## Learnings
(append as waves complete)

---

## CONTINUATION — session-1780079159806 (/team invocation, effort=ultracode)
Orchestration: **Workflow tool**, wave-by-wave (deterministic fan-out + keeps human gates intact). Honors /team intent.
State recovered: prior atlas/ralph run fired W1 agents → captured EVIDENCE (.omo/evidence/task-1-*, task-3-*) but NEVER wrote the 5 deliverable docs (.omo/audit/ had no plan artifacts). So W1 = re-run to AUTHOR the docs, agents instructed to REUSE existing evidence (no expensive redo).

Grounded this session:
- Build-block = TYPE ERRORS in stale test files during `tsc -b` (NOT the vitest run). Confirmed via task-1-build.txt.
- Baseline: 147 failed | 831 passed (978); 19 failed files.
- Removed props stale tests reference: breadcrumbs(→popBreadcrumb)/favorites/params/ParameterDelta.parameterIndex/Port.index/CanvasSnapshot.viewport+graphBounds/category "modifier"vs"generator".
- Element.app NOT yet built in build-merged (element_app_artefacts has no Element.app) → item 6 must build.

AUTONOMOUS BOUNDARY (this run): W1 + W2 (items 6,7,8,9) → produce interim runtime evidence → **HARD STOP at Gate A** (Glen runtime-confirms #1/#2). Item 10 commit + W3-6 + Final + Gate B all GATED on Glen. Do not auto-cross gates.

W1 workflow run: wf_1ca1e09a-3be (5 agents: triage/contract/selectors/fixture+AX/manifest). COMPLETE.

## WAVE 1 RESULTS — overturns 3 plan premises (docs in .omo/audit/)
1. **bridge-contract.md (T2):** ZERO missing native registrations. Call-site diff: React invokes 79 real natives, all 86 C++-registered cover them. The 7 audit-named "missing" fns (elementScanPlugins/GetPluginPaths/Add/Remove/GetFormats/SetFormat/GetAudioDevices) have ZERO webview call sites — UNBUILT on both sides, NOT registration gaps. **VERIFIED independently** (rg → 0 files each). Audio devices already flow via elementGetEngineSnapshot.audioSetup (key-exact to useHostExtrasStore). → **WAVE 4 COLLAPSES**: items 13/14 are NOT registration gaps. Only real C++ work = item 15: add format+category to graph-state block JSON (host ~4211-4250) from tags::format(2166)+desc.category(4386), + normalize enum names (AudioUnit→AU, Internal/empty→INT, VST→VST3) IN C++ (mapBlock casts to PluginFormat). Fixes BUG-012/013. New large-payload natives MUST use postCompletion(JSON::parse(buildXJson())) (avoid fix#1 O(n²) hang); elementGetGraphState is legacy plain-string exception.
2. **selector-verdicts.md (T3):** ZERO reproduced loops. All 12 selectors safe (raw field ref/primitive/.find). → **ITEM 8 = NO-OP** (no selector to convert). Item 9 guard still built as prevention. BlockEmbed.tsx:122 useShallow = canonical template for future.
3. **build-block-triage.md (T1):** 147 fails ALL STALE, 0 real-regressions. Root cause: installJuceBridgeMock(mockJuceBridge.ts:110) stale `{backend:{invokeNativeFunction}}` vs uncommitted JUCE-8 emitEvent backend (juceBackend.ts:67-69) → ~118/147 recovered by mock rewrite. +2 collection-error files (GraphCanvas vi.mock hoist; QuickAddPopup top-level await), +4 build-only tsc files (removed props: SceneData.color/MacroControl.label/breadcrumbs→breadcrumbStack/params→values/ParameterDelta.parameterIndex/Port.index/CanvasSnapshot.viewport+graphBounds). 3 "regression candidates" (Block mute/error-ring/Ctrl+0-9) CLEARED — features present, selectors drifted.
4. **ax-webshell-coverage.md (T4):** fixture built webview/src/test/fixtures/plugins-large.xml (1996 entries/726KB, xmllint-valid). 7/8 AX suites target web shell; toolbar ambiguous. CAVEAT: harness depth-5 BFS no AXWebArea descent → likely false-negatives; item 6 must run element_ax_map.py --depth 10+ first.
5. **coverage-manifest.md (T5):** 55 surfaces, 16 new vs prior audit. SessionTree(#16) needs elementSessionGetGraphTree on mount (BUG-006). PreferencesModal(#33) highest risk (BUG-001/003 plugin-scan/audio UI — but per T2 the bridge data partly exists; plugin-scan natives genuinely unbuilt = BUG-002).

## WAVE 2 in flight
- item7-build-unblock (bg executor opus): mock rewrite + stale tests + collection + tsc → npm run build exit0 + test:all 0 fail.
- item6-build-app-evidence (bg executor opus): vite build → cmake app build → launch → fix#1/#2 interim evidence → confirmation-log Gate-A row (PENDING GLEN). Real plugins.xml already ~1996 entries (don't clobber).
- item 8: NO-OP (documented). item 9 guard test: TODO after item7 green.
PLAN-RESHAPE for Glen: Wave 4 nearly void (only item 15); item 8 void. Surface at Gate A.

## WAVE 2 COMPLETE (autonomous set) — at Gate A boundary
- item7 ✅ build unblocked: npm run build EXIT=0, test:all 1034/1034 (INDEPENDENTLY re-verified by me: tsc -b exit0 + test:all 1034/0). Test-side only, 0 prod changes, 0 deletions. 12 test files repaired; root cause = mockJuceBridge shape.
- item6 ✅ build+evidence: VITE/CMAKE/APP all exit0; fresh dist embedded in Element.app (index-Bd8MitFW.js, verified by me). fix#1 PASS interim (cold boot, 1996 plugins, idle, <10s). fix#2 PASS interim (real app renders 79 ParamStripEmbed faders, loop=false, 0 errors). Gate-A row in confirmation-log.md = AGENT-COMPLETE PENDING GLEN.
- item8 NO-OP (T3: 0 loops).
- item9 selector guard: RUNNING (bg agent a41cff903aa0ea821).

## NEW FINDING (item6) — getGraphState large-session hang [P0-class, ready fix]
Mechanism = SAME as fix#1 O(n²) juce::String::replace quote-escape, on the path fix#1 left as string.
- Repro: open BRASS_4Horns.els (2.1MB) → 100%+ CPU, 1471/1471 samples in emitCompletionEvent→String::replace. Canvas never paints.
- CONCRETE FIX (mirror fix#1): host element_webview_host.cpp:862 `postCompletion(completion, JSON::parse(buildActiveGraphJson()))` (was raw String j). Make 4 React consumers object-or-string tolerant: useJuceBridge.ts:450, :503, :533 (invoke), :410 (onGraphState handler).
- Push path host:4057 evalInBrowser(concat) is O(n), NOT the hang — leave it.
- DECISION FOR GLEN at Gate A: fold into fix#1 commit (item10) vs separate first-task post-gate. Currently UNFIXED (gate boundary = don't apply without Glen).

## GATE A presented. Glen: "Proceed with your recommended next steps."
Interpreted = authorize recommended step B (fix getGraphState). Commit (item10) + W3 re-audit STILL need Glen explicit runtime confirm of #1/#2 (his standing rule + plan gates W3 on confirmed render). Did NOT commit/cross gate.

## ITEM B (getGraphState fix) — APPLIED, verifying
- C++ EDIT DONE: element_webview_host.cpp:862 → postCompletion(completion, JSON::parse(buildActiveGraphJson())). React already object-or-string tolerant at all 4 sites (useJuceBridge.ts:410/450/503/533) → NO JS change needed.
- Verify agent: a52ac174c0a9833be (bg) — cmake app build + launch BRASS_4Horns.els (the previously-hanging 2.1MB session) + assert no String::replace spin + canvas paints + coldboot regression. Evidence → task-B-*. confirmation-log row PENDING GLEN.

## ITEM 15 (block JSON format/category) — SCOPED, ready post-gate
- Insertion: per-block loop host:4216-4271 (each block built from Node n). Add b->setProperty("format", <tags::format normalized: AudioUnit→AU/VST→VST3/Internal|empty→INT/passthrough VST3,AU,CLAP,LV2>) + b->setProperty("category", <plugin desc category mapped to generator|modifier|logic>).
- React mapBlock (useJuceBridge.ts:205-206) ALREADY reads (b as any).category/.format, infer* = fallback only → ITEM 19 mostly already done. Only C++ emit is missing.
- Contained ~15-25 line C++ add. Fixes BUG-012/013.

## ITEM B VERIFIED ✅: BRASS_4Horns.els (2.1MB) now LOADS+paints (was 100% hang). 0 String::replace frames. coldboot clean. confirmation-log Fix#3 row PENDING GLEN.
3 fixes all PASS interim: #1 boot-hang, #2 blank-UI, #3 getGraphState.
build-merged Element.app (relinked 20:38) = all 3 + dist index-JpZllOPM.js.

## ✅ GATE A PASSED (Glen hands-on): #1/#2/#3 all CONFIRMED. Caveat: UI poor/not-usable, app-wide (→W3 priority). Visible: all blocks "INT" (item15), blocks overlap (layout).
## COMMITTED ff023feb (4 fix files only; test-repairs/guard/WIP uncommitted per rule; not pushed).
## WAVE 3 STARTED: wf_f036e6f6-e76 — W3-live (re-audit→findings.md+28-bug-reconciliation.md, prioritise usability/layout) + W3-layout (overlap root-cause→layout-finding.md, read-only).
## W3 RESULT: W3-layout ✅ (layout-finding.md: overlap = expanded block ~170px vs ~140-151px saved gaps; React-side compress, don't move positions; +P2 new-node origin-pile in graphmanager.cpp addNode). W3-live ❌ crashed after capturing 17 task-11-*.png (findings.md NOT written) → recovery agent a5465362f6caff4dd synthesizing findings.md+28-bug-reconciliation.md from screenshots (bg).
## Glen design call: "your call — just fix it" → I picked COMPRESS expanded block height. Fixing overlap+INT+origin-pile together, rebuild, Glen re-judges.
## WAVE 5a IN FLIGHT: wf_87e69f57-b02 — parallel implement [C++: format/category emit (host buildActiveGraphJson 4214-4271, tokens VST3/AU/CLAP/LV2/INT + category generator/modifier/logic) + origin-pile (graphmanager.cpp addNode seed abs x/y)] + [React: compress expanded BlockEmbed <=125px] → build+verify (BRASS no-overlap + real badges). confirmation-log Wave-5a row PENDING GLEN.
## NEXT after W5a: present rebuilt app to Glen to re-judge usability. Then remaining W5 (other findings from recovered findings.md), W6 perf (item24 4→20Hz, item25 metering), Final review, Gate B.
## stray Element PID was 38592 (W3-live leftover) — W5a verify pkills it.

## CHROMATIC UI-REVIEW SETUP (Glen wants in-tool per-component comments)
- chromatic 17 installed; @storybook/addon-designs ^11 installed+wired (Stitch/Figma/image refs per story). docs/CHROMATIC_FEEDBACK_WORKFLOW.md + .omo/audit/ui-feedback.md (per-component capture sheet, 39 comps/161 states).
- Baseline build 1 published on local-enhancements: https://6a1a050dd7e83b33c7e53b0d-eptucqspsl.chromatic.com/ (appId 6a1a050dd7e83b33c7e53b0d).
- Glen CONNECTED Chromatic↔GitHub. gh token LACKS `workflow` scope → couldn't push .github/workflows/chromatic.yml (left on disk uncommitted; add later via `gh auth refresh -s workflow`).
- Created branch **chromatic-ui-review** (snapshot of current webview UI, 107 files, no junk), pushed. Opened **PR #3** (chromatic-ui-review → main; main has NO storybook → all 161 stories "new" → all commentable). `gh pr create` needs `--repo glenandrewbrown/element` (fork defaults base to upstream kushview).
- Publishing chromatic build on the PR branch (run baek3nccy) → UI Review surface.
- LOOP: Glen comments per-component in Chromatic UI Review on PR #3 → I fix on chromatic-ui-review → re-run `npx chromatic --project-token=chpt_...` → review updates.
- BRANCH NOTE: currently ON chromatic-ui-review. local-enhancements (ff023feb) = main work branch. Non-webview WIP (C++ W5a host/graphmanager, etc.) still uncommitted in shared working tree. Reconcile review-branch ↔ local-enhancements when UI signed off.
- TOKEN chpt_e3ed23a85c17ba3 (project-scoped publish token; in .gitignore'd usage only).

## STORYBOOK MCP / AGENTIC SYSTEM (Glen: design+setup best agentic feedback system)
- Read SB AI docs (/ai, /docs/ai, /docs/ai/mcp/overview, /docs/ai/best-practices). SB MCP = @storybook/addon-mcp → http://localhost:6006/mcp. Tools: list-all-documentation, get-documentation, get-documentation-for-story, get-storybook-story-instructions, preview-stories, run-story-tests (a11y+interaction self-heal). React-only preview.
- INSTALLED @storybook/addon-mcp (main.ts:18). Registered in .mcp.json as `storybook` http server. Added directive to CLAUDE.md (use SB MCP for webview UI work). Design doc: docs/CHROMATIC_FEEDBACK_WORKFLOW.md §0.
- VERIFIED LIVE: storybook dev up (:6006 HTTP 200, pid 95094 running bg), /mcp answers MCP initialize (returns agent workflow instructions). SB MCP tools usable by Claude Code NEXT session (with storybook running) — .mcp.json loads at session start.
- Chromatic UI-review Build 2 (PR#3): 161 visual changes (all stories new vs main) → all commentable. Storybook on chromatic: https://6a1a050dd7e83b33c7e53b0d-svfryewuhb.chromatic.com/ ; build https://www.chromatic.com/build?appId=6a1a050dd7e83b33c7e53b0d&number=2
- CLOSED LOOP: Glen comments per-component in Chromatic UI Review → agent uses SB MCP (real props/docs) → fix → run-story-tests self-heal → re-publish chromatic → diff → approve.
- FOLLOW-UP (best-practice enrichment, not yet done): JSDoc + prop descriptions + manifest curation (!manifest tag) across 39 comps for richer MCP context. + add GraphCanvas/AppShell stories.
- NOTE: storybook dev server running bg (95094) — leave up for MCP; kill when done.
---
## (historical) GATE A — Glen chose "YOU TEST FIRST" (AskUserQuestion).
HOLD: do NOT commit, do NOT start W3, until Glen reports hands-on confirm.
/Applications/Element.app is ROOT-owned → can't install without sudo; gave Glen the `sudo ditto` cmd + direct-launch option.
ON GLEN CONFIRM → item10 commit (#1/#2/#3: element_webview_host.cpp + juceBackend.ts + nativeGraph.ts + BlockEmbed.tsx) THEN W3 re-audit (run coverage-manifest surfaces vs running app) + item15 (block JSON format/category, scoped) + W5/W6.
COMMIT-SCOPE NOTE: decide whether to also stage item7 test repairs (mockJuceBridge.ts etc.) + item9 guard so committed fixes have green tests (plan said fix-files only — flag to Glen at commit).
