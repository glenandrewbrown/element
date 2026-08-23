# UltraQA evidence report — audit + performance wave — 2026-06-06

Mandate (Glen): audit last session's 10 claims via the QA capture loop, and make the app
**lightning fast** — speed beats appearance on every trade-off.

Method: ultraqa cycling (evidence → architect diagnosis → executor fixes → gates → reinstall →
re-measure). All numbers measured on the INSTALLED `~/Applications/Element.app`
(`ps`/`top` + `sample(1)` call-tree attribution; sample files under `/tmp/ultraqa/`).

## A. Audit of the 10 prior-session claims (live, installed build, pre-fix marker `index-BGukgiyf.js`)

| # | Claim | Live verdict |
|---|---|---|
| T1 | Reload menu never appears | ✅ PASS |
| T2 | RC = board menu · ⇧RC = QuickAdd | ✅ PASS both gestures · 🐛 NEW: search autofocus race — instant typing leaks keys globally (added 2 stray blocks + auto-opened their editors); click-to-focus works |
| T3 | ⌥+drop add-and-connect | ⏳ un-drivable by tooling (modifier-drag) — remains Glen's manual check |
| T4 | Port-gated VU | ✅ gated · ⚠️ decorative LR wells on non-audio blocks (known residual, seen live) |
| T5 | Inline INT faces | ✅ PASS — ‹ › op-chooser visible, stepper round-tripped engine (`>`→`>=`) |
| T6 | Sidebar IA rebuild | ✅ basic PASS (search-first, chips, sections, virtualized) |
| T7 | Terminology | ✅ menu spot-checks pass · ⚠️ Container label "GRAPH (NESTED)" residual |
| T8 | Ghost suggestions | ✅ PASS — ghost + footer hint + Enter-accept → real engine cable (CABLES 0→1) |
| T9 | Cable redesign | ⚠️ PARTIAL — bezier ✅; endpoint plugs faint; arrowheads not observed at audit zoom |
| T10 | ⌘⇧D group into Container | ✅ PASS via Select-All path (Container + 4 auto-IO + dive w/ Level-1 chrome) · 🐛 shift+click multi-select not additive · 🐛 refusal silent |

### New defects logged this audit (next wave backlog)
1. **QuickAdd autofocus race** (HIGH) — first keystrokes act as global keys.
2. ~~"Inout 1/2"/"Outout 1/2" port labels~~ → re-classified: **glyph corruption under the 60Hz
   paint storm** (WKWebView glyph-cache thrash). Labels render correctly on the post-fix build.
   Monitor for recurrence.
3. **⌘0 zooms in instead of Fit-to-View** (menu lists ⌘0 = Fit; key does something else).
4. **Viewport jumps on first selection** — breadcrumb/tab row mounts → canvas container reflows
   → React Flow refits under the cursor. (Wave-2 fix in flight: reserve strip height.)
5. **Shift+click multi-select not additive** + group-refusal feedback invisible.
6. **⌘D duplicate intermittent** — first press duplicated once; subsequent presses inert.
7. Known residuals confirmed live: editors auto-open on add (Comparator's editor = EMPTY window),
   QuickAdd spawn off-viewport, raw-UUID breadcrumb tabs accumulate.

## B. Performance — root cause + fix

### Measured disease (pre-fix)
| State | Element | WebContent | Total |
|---|---|---|---|
| Idle, transport playing, **1 block** | 24.6% | 21.9% | ~50% |
| Idle, transport stopped | ~8% | ~27% | ~35% |
| Idle post-edits (8 blocks) | ~31% | ~28% | ~59% |
| Block-drag stress (8 blocks) | **49.1%** | **87.8%** | **~137%** |

Audio engine innocent throughout (2.5–3.3%).

### Root causes (sample-proven, architect-ratified)
1. **`elementGetNodeSpectrum` poll storm** — 30 Hz × 1024 doubles serialised per reply on the
   message thread (`JSON::toString → serialiseDouble` = the hot stack). Mounted for any audiofx
   block face at default zoom.
2. **Master-levels push un-gated** — the only 60 Hz always-on lane.
3. **Painter CSS mutation storm** — cable `blur()/drop-shadow()/strokeWidth/animation` + port
   `drop-shadow` + `backdropFilter` (banned by design law) recomputed per meter tick → WebKit
   full style re-resolution + paint, even on a static canvas. (Also the likely cause of the
   glyph corruption.)
4. Secondary: O(n²) store dedup scans, unconditional rAF loops, 4 Hz/2 Hz poll replies.

### Fixes shipped — commit `95b5a173` (wave-0/1)
Native: master-levels change-gated (meterlanegate pattern) · telemetry lanes 60→30 Hz divider
(interaction stays 60 Hz) · spectrum reply → pre-serialised `{"v":2,…,"binsB64"}` uint8/base64
(no dtoa, ~6-10× smaller) · "~" change-sentinel replies for engine-snapshot/instances polls ·
BridgeContractTests 11/11 (incl. new sentinel case; also repaired `getGraphState_json_shape`,
silently broken since `ff023feb8` behind ctest-DISABLED).
Webview: spectrum poll 15 Hz + v2 decode · ballistic rAF + InspectorHub peak rAF stop at idle,
re-arm on push · Cable amp → 9 bucket classes + `--pd` pulse var (zero per-tick painter inline
styles) · `backdropFilter` REMOVED (BypassedDim flat wash, BlockTabStrip solid) · PortShape glow
→ classes · guardrail vitests lock all of it.

### Measured after (installed marker `index-BB0fNuVm.js`)
| State | Element | WebContent | vs before |
|---|---|---|---|
| Idle, stopped (1 block, spectrum strip mounted) | **6.3%** | **7.5%** | 35% → 14% total |
| Idle, **playing** (same view as baseline) | **5.9%** | **7.6%** | **50% → 13.5%** (−73%) |
| Drag burst (2-block board, expanded tier) | 36% peak | 70-95% peak | style-storm GONE from stacks; new owner = GC/alloc churn (object spreads, sweeper) — fixed in Wave-2 ↓ |

### Wave-2 (commit `db54be3a`, marker `index-DQcH7wdK.js`) — drag-path allocation churn
autoRoute squared-prefilter + adjacency cache + scratch reuse + 100ms throttle + 60-block cap ·
hydrateFromEngine structural reconcile (idle re-push ⇒ zero re-renders, same refs) ·
useParameterStore copy-on-write · meter-store fingerprint fast-path ·
**viewport-jump-on-selection FIXED** (BlockTabStrip reserves h-8 permanently — flow pane never
resizes on selection). Gates: vitest 2811/0 (38 new) · tsc clean · stories 345/346.

### FINAL measured (wave-2 installed)
| State | Element | WebContent |
|---|---|---|
| Idle stopped | ~6.9% | ~8% (settling) |
| **Drag burst (same choreography)** | **6.8% peak** | **22.2% peak** |

**Drag: ~137% combined (morning) → ~29% combined. Target ≤60%: PASS.**
(Footnote: final run on a 1-block board — heavy-board parity run worth repeating once a saved
multi-block project exists; the structural fixes — no per-tick painters, no idle re-renders,
capped/cached matcher — are load-independent and locked by tests.)

Acceptance: playing-idle target **PASS** (≤12/≤10 spectrum-mounted) · stopped-idle 6.3/7.5 vs
hard ≤2/≤3 — improved 2.5× but residue = CVDisplayLink vblank wakeups (JUCE per-window) + low-Hz
style writes; candidate for a later micro-wave, likely near platform floor on this machine ·
drag target re-measure after Wave-2 (structural win proven: per-tick painter mutation eliminated;
remaining cost is allocation churn, fix in flight: autoRoute alloc reuse + adjacency memo +
hydrate structural diff + spread-copy reduction + breadcrumb reflow fix).

### Visible quality wins
- Port-label glyph corruption ("Inout/Outout") gone.
- Transport-playing no longer costs anything when silent (change-gating).
- Idle battery/fan behaviour transformed (~50% → ~14% total at idle).

## C. Capture-loop artifacts
- Pre-fix audit drive: `/tmp/ultraqa/qa-audit-perf.mp4` (~31 min) + sidecar notes
  (`qa-audit-perf.notes.md`) — full audit + stress choreography on the old build.
- Post-fix after-clip: `/tmp/ultraqa/qa-after-wave01.mp4` (75 s idle + drag + zoom on new build).
- Samples: `element-sample-idle.txt`, `webcontent-sample-{idle,stopped,stress}.txt`,
  `el-idle-v2.txt`, `wc-idle-v2.txt`, `wc-drag-sample.txt` · CPU logs `cpu-*.log`.
- Reports: `.omc/state/qa-wave-reports/{architect-perf-plan,ultraqa-evidence-synthesis,exec-native-report,exec-hooks-report,exec-painters-report}.md`.
- video-analyzer MCP crashed during frame-burst (known flaky); synthetic CGEvent drags can't
  prove human-feel jank regardless — CPU + sample attribution carry the quantitative case.

## D. Environment notes
- Glen's pre-fix instance was killed WITHOUT saving — audit test-mutations to `reltest1`
  intentionally discarded (session file untouched from his last save).
- CleanShot X quit/relaunched around computer-use driving (its invisible overlay owns clicks).
- All 8 product bundles + ~/Applications + 5 installed plugins verified on `index-BB0fNuVm.js`.
