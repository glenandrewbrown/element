# Element — Unimplemented Features Audit & Implementation Plan

**Generated:** 2026-04-26
**Method:** 4 parallel investigation lanes (WebView UI / Native engine / Bridge integration / Tests + QA)
**Scope:** Everything designed, promised, or partially built but not shipped — across `webview/src/`, `src/`, `include/element/`, `test/`, `tools/automation/`, and `installer/`
**Prior context:** 3 commits landed earlier this session (c6181785 backend+9 nodes, 0f1772a1 V3.0 UI parity, 5f6bf47b webview bundling fix). Element-2.2.0.16.pkg is on disk.

---

## Cross-Lane Reconciliations (read first — agents can be wrong)

| Claim | Reality | Source of truth |
|-------|---------|-----------------|
| "Dashboard Builder NOT implemented" (Lane 1) | **Wrong** — `DashboardBuilder.tsx` 673 LOC committed today as a tab in `PerformBottomPanel`. Drag/bind/edit all work. | `webview/src/components/layout/DashboardBuilder.tsx`, `webview/src/App.tsx:34-66` |
| Real gap on Dashboard Builder | **Persistence to ValueTree missing.** `elementDashboardSetLayout` / `GetLayout` not in C++ registry. JS-only state = lost on reload. | Lane 3 audit |
| "Portal node ✗ NOT implemented" (gap matrix) | Lane 1 internally contradicts itself: lists in ✗ table but notes "SHIPPED 2026-04-26". Reading `Block.tsx:303-342` confirms Portal renders dashed amber border. **Shipped.** | `Block.tsx:303-342` |
| "Snap-to-grid not implemented" (gap matrix) | **Implemented** in Preferences modal but not exposed as in-canvas toggle. Lane 1 caught the gap-matrix staleness. | `PreferencesModal.tsx:72-95` |
| Bridge function count | **68 C++ / 66 JS** (was 57/56). +11 added today. 1:1 match for wrapped functions; 2 intentionally unwrapped. | Lane 3 |
| TODO count | **71** (memory said 62, drifted up) | Lane 2 grep |

**Net:** Lane 1's gap matrix has noticeable staleness. Lane 2 (native), Lane 3 (bridge), Lane 4 (tests) are accurate. Treat Lane 1 numbers as upper bounds.

---

## Cross-Lane Summary

| Domain | Items found | P0 | P1 | P2 | Note |
|--------|-------------|----|----|----|------|
| WebView UI gaps | 18 + 37 visual drift | 3 | 6 | 9+ | Most "P0" items here are actually P1 — Dashboard Builder is shipped |
| Native engine / services / scripting | 71 TODO/FIXME + 19 substantive | **5** | 6 | 8 | Includes 1 critical RCE (Lua sandbox) |
| Bridge integration | 8 substantive gaps | **2** | 3 | 3 | Plugin-side webview bundling is real ship-blocker |
| Tests / QA | 17 substantive gaps | **3** | 8 | 6 | Memory's "B-" grade is generous given missing service tests |

**True P0 ship-blockers (after dedupe): 5**
1. **Lua sandbox RCE** — `scriptnode.cpp:41` opens full Lua stdlib (`os.execute`, `io.popen`, `debug`). Loading a malicious `.elg` = arbitrary code execution.
2. **Plugin-side WebView not bundled** — Today's POST_BUILD only targets `element_app`. The `.vst3`/`.component`/`.clap`/`.lv2` bundles still load WebView from dev path.
3. **Sandboxed plugin parameters broken** — `sandboxedprocessor.hpp:333` TODO; sandboxed plugins effectively non-functional.
4. **Service layer has zero tests** — 7 services × 0 unit tests = unknown blast radius for any refactor.
5. **`using namespace juce;` in public header** — `include/element/juce.hpp:24`. Pollutes consumer namespace; CLAUDE.md explicitly forbids.

---

## P0 — Ship-Blockers (must land before any "1.0" claim)

### P0-1 — Lua sandbox: lock down stdlib (SECURITY / RCE)
**Files:** `src/nodes/scriptnode.cpp:41`, `src/nodes/scriptnode.hpp:60`, `src/lua/` (new sandbox helper)
**Effort:** M (1–2 days)
**Risk if shipped without:** Loading any user-shared `.elg` containing a malicious Script node = arbitrary code execution under the host's privileges. Audio plugin hosts get loaded by DAWs that already have file/MIDI/network entitlements.
**Acceptance:**
- `os.execute`, `io.popen`, `os.remove`, `io.open` (write mode), `debug.*`, `package.loadlib`, `require` of arbitrary modules — all blocked or return `nil` in script-node Lua state.
- Allow-list of safe modules (`math`, `string`, `table`, `coroutine`, restricted `os.time/date`, restricted `io.read`).
- New test `test/scripting/SandboxIsolationTest.cpp` proves each banned call fails, allowed call succeeds.
- Lua console (`luaconsoleview.cpp`) gets the SAME sandbox — no privileged REPL escape.

### P0-2 — Bundle WebView dist into all plugin formats (PORTABILITY)
**Files:** `CMakeLists.txt` (around `element_setup_plugin` macro and JUCE plugin format helpers), `src/ui/element_webview_host.cpp:716` (already correct after today's fix)
**Effort:** S (2–4 hours)
**Risk if shipped without:** Plugins installed on any other machine show "Web UI bundle not found" stub HTML. Plugins moved on this machine break too.
**Acceptance:**
- POST_BUILD copy on `element_instrument`, `element_effect`, `element_midi_effect` puts `webview/dist/` into each format's `Contents/Resources/webview/` (AU `.component`, VST3 `.vst3`, CLAP `.clap`, LV2 `.lv2`).
- Verify by running `pkgutil --payload-files` on `ElementAU.pkg`, `ElementVST3.pkg`, `ElementCLAP.pkg`, `ElementLV2.pkg` — each must show `…/Resources/webview/index.html` and `…/Resources/webview/assets/index-*.js`.
- Re-sign each bundle (existing ad-hoc signature gets invalidated by file additions).

### P0-3 — Sandboxed plugin parameter forwarding
**Files:** `src/nodes/sandboxedprocessor.hpp:314,333`, `src/engine/sandboxhost.hpp`, `src/engine/sandboxworker.hpp`, `src/engine/sandboxipc.hpp`
**Effort:** L (3–5 days)
**Risk if shipped without:** Sandbox feature is advertised in CLAUDE.md but non-functional — any sandboxed plugin with parameters silently does not respond to parameter changes from the host.
**Acceptance:**
- Add `ParamSetMessage { uint32 paramIdx; float value; }` to `SandboxMessageHeader` enum and round-trip via control pipe.
- Sandboxed plugin description correctly serializes port info on host side (line 314).
- New test `test/engine/SandboxParameterRoundTripTest.cpp` loads a known plugin in sandbox, sets a parameter, asserts worker received it.

### P0-4 — Remove `using namespace juce` from public headers
**Files:** `include/element/juce.hpp:24`
**Effort:** S (~1 hour, but may surface compile breaks)
**Risk if shipped without:** CLAUDE.md explicitly forbids; consumers including `<element/juce.hpp>` get the entire `juce::` namespace dumped into theirs. Breaks symbol resolution in projects that already use `juce::`.
**Acceptance:**
- `using namespace juce;` removed.
- All `.hpp`/`.cpp` that broke get `juce::` qualification (clang-tidy can do this).
- `grep -rn "using namespace juce;" include/` returns zero results in headers (`.cpp` files allowed per CLAUDE.md).

### P0-5 — Service-layer baseline tests
**Files:** new `test/services/{Device,Engine,Gui,Mapping,Osc,Preset,Session}ServiceTest.cpp`, `test/CMakeLists.txt`
**Effort:** L (3–4 days)
**Risk if shipped without:** Memory says "B-"; in reality service-layer coverage is **0%**. Any future refactor of these 7 files lands blind.
**Acceptance:**
- One test file per service. Each file: at least 5 cases covering happy path, lifecycle (init/shutdown), state observers fire, error handling.
- All 7 added to `test/CMakeLists.txt` and run by `ctest --output-on-failure`.
- New CI step asserts the suites run (don't just exist).

---

## P1 — Parity completion (within next 1–2 sprints)

### Bridge & state
| ID | Item | Files | Effort | Acceptance |
|----|------|-------|--------|------------|
| P1-1 | `elementDashboardSetLayout` / `GetLayout` C++ binding | `src/ui/element_webview_host.cpp`, `src/services/sessionservice.cpp` (ValueTree slot) | M | Dashboard widget layout persists across app restart and project save/load. Round-trip JSON in/out. |
| P1-2 | `elementGraphSetConnectionSource/Target` (atomic cable rebind) | `element_webview_host.cpp`, `engineservice.cpp` | M | ConnectionEditor.tsx drag-rebind no longer requires delete+create — single atomic call. |
| P1-3 | `elementPerformMarkParameterMapped` / `GetMappedParameters` | `element_webview_host.cpp`, `usePerformStore.ts` | M | MAP MODE actually filters which parameters surface in Perform mode (currently shows all). |
| P1-4 | Parameter streaming bridge (15Hz dirty flag per blueprint §10.4) | `element_webview_host.cpp`, new `useParameterStream.ts` consumer | L | When a plugin changes a param internally, React UI sees update within 100ms without polling whole graph. |
| P1-5 | `elementScriptGetRuntimeState` for live debug | `element_webview_host.cpp`, `ScriptEditor.tsx` | M | ScriptEditor shows live local-variable values when script is running. |
| P1-6 | `elementGraphCreateWirelessBus` / `GetWirelessBuses` (CRUD) | `element_webview_host.cpp`, `useBusStore.ts` | S | Bus CRUD round-trips through engine instead of being JS-only state. |

### Native engine
| ID | Item | Files | Effort | Acceptance |
|----|------|-------|--------|------------|
| P1-7 | Device hot-plug rebuild | `src/services/deviceservice.cpp:129` | M | Plugging/unplugging a USB audio interface mid-session does not require restart; engine rebinds transparently. |
| P1-8 | Session autosave on timer | `src/services/sessionservice.cpp` | S | Configurable interval (default 60s); writes to `<project>.autosave.elg` next to original; restored after crash. |
| P1-9 | OSC bidirectional (send + error recovery) | `src/services/oscservice.cpp` | M | Service can both receive AND send OSC; reconnects after network drop. |
| P1-10 | Preset bank management (current is a stub) | `src/services/presetservice.cpp` (Impl is empty) | M | Per-block preset list with load/save/A-B-compare. |
| P1-11 | EngineService unidirectional notify cleanup | `src/services/engineservice.cpp:444` | M | Remove circular UI ↔ engine notify; replace with single-direction event flow. |

### UI parity
| ID | Item | Files | Effort | Acceptance |
|----|------|-------|--------|------------|
| P1-12 | Manhattan cable routing | `webview/src/components/canvas/Cable.tsx:73-81` | M | When `cableRouting === 'manhattan'`, cables are 90° angles avoiding overlaps; toggle in toolbar already exists. |
| P1-13 | Alignment menu (left/center/right/top/middle/bottom) + Distribute spacing | new `useGraphStore` action + `NodeContextMenu.tsx` items | M | Multi-select two+ blocks → context-menu items align/distribute; keyboard `Cmd+Shift+L/R/T/B`. |
| P1-14 | Per-block comment/note field in Inspector | `InspectorHub.tsx`, `useGraphStore.ts` (note field on Node), bridge round-trip | S | Textarea in inspector; persists in Node ValueTree; survives save/load. |
| P1-15 | Reconnect-on-duplicate (auto-patch nearby compat ports) | `element_webview_host.cpp::elementGraphDuplicateNodes`, `useGraphStore.ts` | M | Duplicating a chain via Cmd+D rewires the duplicate to the same upstream/downstream where types match. |

### Tests & QA
| ID | Item | Files | Effort | Acceptance |
|----|------|-------|--------|------------|
| P1-16 | Plugin lifecycle test suite (currently only format-support check) | `test/PluginManagerTests.cpp` (expand) | M | Cases for: scan, load, instantiate, prepare, render, getState, setState, release, crash recovery. |
| P1-17 | WebView bridge contract tests | new `test/webview/BridgeContractTest.cpp` | M | Each of 68 native functions: spec input → expected output JSON shape. Mock graph; no JUCE message thread needed. |
| P1-18 | AX verification suites for new V3.0 surfaces | `tools/automation/element_verify.py` (extend) | L | New suites: `dashboard-builder`, `command-palette`, `bus-inspector`, `virtual-keyboard`. Run from `--suite all`. |
| P1-19 | Sanitizer CI matrix (ASan / UBSan / TSan) | `.github/workflows/build.yml` | S | New job per sanitizer; runs full ctest suite under each. |
| P1-20 | Code coverage reporting (gcov/llvm-cov) | `CMakeLists.txt`, GH Actions | S | `--coverage` build target; CI uploads to Codecov; PR comment shows delta. |

---

## P2 — Polish & cleanup (radar — cluster as time permits)

### Visual / UX polish
- **Visual token migration** (37 violations) — replace hardcoded `#1A1A1E`, `bg-white/5`, transparency layers with `.neu-*` utilities. Concentrate fix in `webview/src/components/neu/*.tsx`. Effort: M.
- **Cable hover highlight** — brighten/thicken on hover (`Cable.tsx`).
- **Bookmark visual feedback + persistence** — flash on save, persist via localStorage or session ValueTree.
- **Block press-in animation** — Framer Motion spring on click, matches NeuButton feel.
- **Comment frame resize handle** — explicit corner badge, currently relies on React Flow default.
- **Keyboard shortcuts**: `Space` (transport), `Cmd+T` (rename — currently Cmd+R only), `Cmd+A` (select all).

### Native cleanup
- **Split large files** — `clapprovider.cpp` (1867), `grapheditorcomponent.cpp` (3124), `block.cpp` (1793), `node.cpp` (1453), `pluginmanager.cpp` (1430), `preferences.cpp` (1314). Each becomes 2–4 cohesive files.
- **Magic number cleanup** — menu item IDs, OSC default port, GraphOp dispatch.
- **Stale TODO sweep** — ~20 of the 71 TODOs are dead/non-actionable; delete.
- **Lua GC sanity** — verify GC actually runs (currently `LUA_GCSTOP` set; manual trigger may be missing).

### Bridge polish
- **CSP headers** — verify WebBrowserComponent default; add `script-src 'self' 'wasm-unsafe-eval'` etc explicitly.
- **Resource provider MIME table** — confirm completeness for `.wasm`, `.json`, `.ttf`, `.woff2`.

### Test infrastructure
- **Installer smoke test** — CI installs the `.pkg` then launches and asserts no crash within 30s.
- **Cross-macOS pinning** — explicit `macos-14` (Sonoma) + `macos-15` (Sequoia) jobs instead of `macos-latest`.
- **Performance regression** — per-PR benchmark for graph build time and audio RTL.
- **Crash telemetry** — Sentry or equivalent endpoint for production crash reports.

---

## Phased Roadmap

### Phase A — "Make the .pkg you just shipped actually defensible" (1 week)
Goals: close the 5 P0s. Outcomes: no RCE, plugins are portable, sandbox works, namespace clean, services have a test floor.
- P0-1, P0-2, P0-3, P0-4, P0-5 in that order. P0-2 is the cheapest win and unblocks "give your plugins to a friend"; do it first to prove the pipeline still ships.

### Phase B — "V3.0 contract completion" (2 weeks)
Goals: every blueprint feature either fully wired or formally deferred.
- All P1-1 through P1-15.
- Update `gap-matrix.md` to reflect closures.
- Re-run all 4 audit lanes; the synthesis number for "P0/P1 open" should drop to single digits.

### Phase C — "QA grade lift to A" (1–2 weeks, can parallel with B)
Goals: B- → A on the test rubric.
- P1-16 through P1-20.
- Coverage badge live; sanitizer jobs green.

### Phase D — "Polish + tech debt" (ongoing)
Goals: P2 items as fillers between feature work. No fixed timeline.

---

## Execution Recommendation

**Best fit for execution:** `/oh-my-claudecode:autopilot` per phase (A, then B, then C). Reasons:
- Each phase is self-contained with crisp acceptance criteria.
- Phases B and C have many small independent items that benefit from autopilot's parallel-execution model.
- Phase A has security-sensitive work (P0-1) — recommend a `code-reviewer` and `security-reviewer` agent pass on each P0 patch before commit.

**Alternative:** `/oh-my-claudecode:ralph` for Phase A only — its persistence loop is well-suited to security work where every iteration must clear an architect verification gate.

**Do not:** dump all 35 backlog items into a single autopilot run. Phase boundaries exist because P0 work informs P1 (e.g., P0-2 plugin bundling needs to land before P1 bridge tests are meaningful).

---

## Open Questions for the User

These would tighten the plan further but I'm not blocking on them:
1. **Notarization timeline** — earlier you accepted "ad-hoc only", but P0-2 portability assumes plugins are at least ad-hoc signed for redistribution. Worth a Developer ID at some point?
2. **Sandbox feature scope** — is sandboxed plugin support actually a v1 goal, or can P0-3 slip to v1.1? (It's the biggest single-item effort in P0.)
3. **Lua scripting prominence** — if Script blocks are central to v1, the sandbox lockdown (P0-1) needs to preserve a useful API surface. If they're niche, banning more is safer.
4. **Test framework for WebView** — Vitest? Playwright via Chromium? Reuse JUCE WebBrowserComponent in headless? P1-17 needs a decision.

---

## File Manifest (changes likely to touch)

```
src/CMakeLists.txt or root CMakeLists.txt        (P0-2: plugin POST_BUILD)
src/lua/sandbox.{hpp,cpp}                         (P0-1: new file)
src/nodes/scriptnode.{cpp,hpp}                    (P0-1: use sandbox)
src/nodes/sandboxedprocessor.hpp                  (P0-3)
src/engine/sandboxipc.hpp                         (P0-3)
src/engine/sandboxworker.hpp                      (P0-3)
include/element/juce.hpp                          (P0-4)
src/services/*.cpp                                (P0-5 fixtures, P1-7..11)
src/ui/element_webview_host.cpp                   (P1-1..6, all bridge work)
test/scripting/SandboxIsolationTest.cpp           (P0-1: new)
test/engine/SandboxParameterRoundTripTest.cpp     (P0-3: new)
test/services/*ServiceTest.cpp                    (P0-5: 7 new)
test/PluginManagerTests.cpp                       (P1-16: expand)
test/webview/BridgeContractTest.cpp               (P1-17: new)
test/CMakeLists.txt                               (register new suites)
tools/automation/element_verify.py                (P1-18)
.github/workflows/build.yml                       (P1-19, P1-20)
webview/src/components/canvas/Cable.tsx           (P1-12 manhattan)
webview/src/components/canvas/NodeContextMenu.tsx (P1-13 alignment)
webview/src/components/layout/InspectorHub.tsx    (P1-14 comment field)
webview/src/components/neu/*.tsx                  (P2 visual tokens)
.omc/autopilot/gap-matrix.md                      (Phase B: update closures)
```

