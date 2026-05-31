# Build-block Causality + 147-Failing-Test Triage

**Wave-1 investigation (plan item 1).** Branch `local-enhancements`. Investigation only — no source/test was modified.
Evidence base: `.omo/evidence/task-1-build.txt`, `task-1-tsc.txt`, `task-1-tests.txt`, `task-1-stale-proof.txt` (all read), plus live reference searches under `webview/src/` cited inline.

Baselines (re-confirmed from evidence): vitest `Test Files 19 failed | 74 passed (93)`, `Tests 147 failed | 831 passed (978)` (`task-1-tests.txt:3264-3265`). Production prod build = `tsc -b && vite build` (`task-1-build.txt:3`).

---

## 1. Build-block mechanism (one sentence, with evidence)

**`npm run build` runs `tsc -b` first, and `tsc -b` type-checks the test files too; the first emitted error — `src/components/canvas/__tests__/Block.test.tsx(14,36): error TS6133: 'beforeEach' is declared but its value is never read.` (`task-1-build.txt:5`) — together with 30+ further type errors in 11 stale test files makes `tsc -b` exit non-zero (`EXIT=2`, `task-1-build.txt:47`), so `vite build` never runs.** The blocker is the TypeScript compile of stale test files, NOT the vitest run (vitest uses its own transform pipeline and ignores type errors). Fixing/excluding the test type errors unblocks the production build independently of the 147 runtime failures.

### 1a. Build-only blockers vs runtime failers (key distinction)

`tsc -b` errors come from 11 test files (`task-1-tsc.txt`); the vitest run fails 19 files (`task-1-tests.txt`). The intersection is 7 files; **4 files error at compile but PASS at runtime** (extra object props like `color`/`label` are legal JS at runtime — TS only rejects them at build):

| File | tsc error? | vitest fail? | Note |
|------|-----------|--------------|------|
| `stores/__tests__/usePerformStore.test.ts` | yes (`color`,`label`) | **no** | Build-only blocker. Extra `SceneData.color` / `MacroControl.label` keys are ignored at runtime. |
| `stores/__tests__/useAppStore.gaps.test.ts` | yes (TS2322 incomplete AppStore) | **no** | Build-only blocker. |
| `hooks/__tests__/useJuceBridge.mappers.test.ts` | yes (`favorites`,`params`) | **no** | Build-only blocker. |
| `components/layout/__tests__/PreferencesModal.test.tsx` | yes (CanvasSnapshot missing viewport/graphBounds) | **no** | Build-only blocker. |

---

## 2. Root-cause groups

| ID | Root cause | Verdict | Cascade (failing tests) |
|----|-----------|---------|--------------------------|
| **R1** | **Stale mock infra** — `installJuceBridgeMock` installs `{backend:{invokeNativeFunction:mock}}` (`mockJuceBridge.ts:110`), but production `invokeElementNative` was rewritten to the JUCE-8 event handshake and bails unless `backend.emitEvent` is a function (`juceBackend.ts:67-69`). Mock has no `emitEvent` → every wrapped call resolves `undefined` → bool wrappers return `false`, parse wrappers return `[]`, void wrappers record 0 host calls. `juceBackend.ts` is uncommitted-modified; the mock was not updated alongside it. | stale (rewrite-mock-to-emitEvent-shape) | ~118 |
| **R2** | **Stale DOM selector** — component output moved from inline `style="…#hex…"` to Tailwind `className` arbitrary values (`Block.tsx:20 bg-[#4A90D9]`), or test matches text the design never renders. | stale (rewrite-selector) | ~9 |
| **R3** | **Removed/renamed prop or type shape** — test references a field that no longer exists on the current type (proven zero non-test refs). | stale (rewrite-to-current-shape / delete) | ~10 |
| **R4** | **Test-file collection error** — `vi.mock` hoist-order bug or top-level `await` makes the file fail to collect (0 tests register). | stale (fix-test-file) | 2 suites |
| **R-reg** | **Real regression (collateral of uncommitted fixes)** | none found | **0** |

> No `real-regression` verdicts. Every failing production feature the tests exercise (bridge invoke, mute overlay, error visual, Ctrl+digit bookmarks, plugin refresh, breadcrumbs) was confirmed present and correct in current source; the failures are test-side drift. The three highest-risk regression candidates were checked against production and cleared (§4).

---

## 3. Per-file verdict table (19 runtime-failing files)

Failing-file set is the 19 `❯ |unit|` markers in `task-1-tests.txt` (count verified = 19). `Cable.test.tsx` appears only as a `vi.mock` hoist WARNING (`task-1-tests.txt:335,337`) and passes — not in the failing set.

| File | Failing | Representative test → reason (evidence) | Root | Verdict | Action |
|------|--------:|------------------------------------------|------|---------|--------|
| `bridge/__tests__/nativeGraph.test.ts` | 58/145 | `nativeGraphSetBypass happy: expected false to be true` (`:83`); `nativeGetNodeParameters: expected [] length 2` (`:120`); parse wrappers `logBridgeError` 0 calls (`:134`) | R1 | stale | rewrite mock to emitEvent handshake |
| `bridge/__tests__/nativeSession.test.ts` | 10/15 | `nativeSessionOpen happy: returns true` got false | R1 | stale | (R1 fix) |
| `bridge/__tests__/nativePrefs.test.ts` | 9/15 | `happy path: returns true` got false; void fns resolve but record 0 calls | R1 | stale | (R1 fix) |
| `bridge/__tests__/nativePerform.test.ts` | 5/12 | `returns true and passes index to host` got false | R1 | stale | (R1 fix) |
| `bridge/__tests__/nativePluginEditor.test.ts` | 5/6 | bool/void wrappers resolve undefined | R1 | stale | (R1 fix) |
| `bridge/__tests__/nativeEngineSnapshot.test.ts` | 4/5 | host response never delivered (undefined) | R1 | stale | (R1 fix) |
| `bridge/__tests__/juceBackend.test.ts` | 4/6 | direct invoke wrapper resolves undefined w/ old mock shape | R1 | stale | (R1 fix) — and update this file's own fixture |
| `bridge/__tests__/nativeApp.test.ts` | 3/6 | `nativeAppGetAbout` returns null (undefined host) | R1 | stale | (R1 fix) |
| `bridge/__tests__/nativeKeyboard.test.ts` | 2/6 | bool wrapper got false | R1 | stale | (R1 fix) |
| `stores/__tests__/usePluginBrowserStore.test.ts` | 20/23 | `populates plugins: expected [] length 1` (`:49`) — `refresh()` calls `invokeElementNative("elementGetPluginList",[])` (`usePluginBrowserStore.ts:49`), gets undefined via broken mock | R1 | stale | (R1 fix) |
| `components/layout/__tests__/PresetStrip.stale.test.tsx` | 3/3 | `elementPresetList` calls = 0, `expected 0 >= 1` (`:157,:218`) — renders real `InspectorHub>PresetStrip`, but bridge call hits dev no-op | R1 | stale | (R1 fix) |
| `hooks/__tests__/useJuceBridge.test.tsx` | 5/5 | boot IIFE: `sessionLoaded` false (`:118`) — boot calls bridge which returns undefined under broken mock | R1 | stale | (R1 fix) |
| `hooks/__tests__/useJuceBridge.gaps.test.tsx` | 4/15 | `getState().breadcrumbs` undefined (`:170,:253,:268`); `__elementNative` toBe vs toStrictEqual (`:282`) | R1 + R3 | stale | R1 fix + read `breadcrumbStack` not `breadcrumbs`; use `toStrictEqual` |
| `components/canvas/__tests__/Block.test.tsx` | 7/21 | mute overlay null (`:145`); error indicator null (`:154`); accent `[style*="#4A90D9"]` null (`:162`); ARGB/7-char hex null (`:183,:189`) | R2 | stale | rewrite selectors to className / rendered-text matcher (§4) |
| `components/canvas/__tests__/CommandPalette.test.tsx` | 5/17 | `Unable to find text "Surge XT"` (`task-1-tests.txt:2295`) — plugin list not rendered (mocked store shape / list markup drift) | R2 | stale | rewrite to current CommandPalette markup/store mock |
| `components/layout/__tests__/ConnectionEditor.test.tsx` | 1/20 | `falls back to port ID when label absent: unable to find "out-0"` (`:363`) — port-label fallback markup changed | R2 | stale | rewrite selector to current port-row markup |
| `hooks/__tests__/useKeyboard.test.tsx` | 2/29 | `saves bookmark Ctrl+5: expected undefined deeply equal {x:100,y:200,zoom:1.5}`; `restores Shift+5` — handler present (§4), test event-synth/store-instance wiring stale | R1-like | stale | fix test mock wiring (event `code=Digit5` + shared store instance) |
| `components/canvas/__tests__/GraphCanvas.test.tsx` | suite (0 collected) | `ReferenceError: Cannot access 'useGraphStoreMock' before initialization` — `vi.mock` factory references a top-level const, hoisted above its definition (`task-1-tests.txt:378-389`) | R4 | stale | move const inside factory or use `vi.hoisted()` |
| `components/canvas/__tests__/QuickAddPopup.test.tsx` | suite (0 collected) | `PARSE_ERROR: 'await' only allowed within async functions` at `:248` (`task-1-tests.txt:393-405`) + tsc TS1308/TS2345 (`task-1-build.txt:10-15`) | R4 | stale | wrap dynamic `import()` in async / top-level await context; fix `usePluginBrowserStore` mock selector type |

### 3a. Build-only files (tsc errors; pass vitest — listed for the repair plan)

| File | tsc error(s) | Root | Verdict | Action |
|------|-------------|------|---------|--------|
| `stores/__tests__/usePerformStore.test.ts` | `'color' does not exist in SceneData` ×4; `'label' does not exist in MacroControl` ×3 (`task-1-tsc.txt:33-40`) | R3 | stale | drop `color` from scene seeds; rename `label`→`name` on macros |
| `stores/__tests__/useAppStore.gaps.test.ts` | `setState` object missing AppActions (TS2322) (`:30`) | R3 | stale | use `setState(partial)` not full-object replace, or add missing actions |
| `hooks/__tests__/useJuceBridge.mappers.test.ts` | `'favorites'`/`'params'` not in store shapes (`:24-26`); unused `flushAsync` | R3 | stale | use `favoriteIdentifiers` / `values` |
| `components/layout/__tests__/PreferencesModal.test.tsx` | `CanvasSnapshot` missing `viewport`,`graphBounds` (`:14`) | R3 | stale | supply `viewport` + `graphBounds` in snapshot fixture |

---

## 4. Real-regression candidates — checked and CLEARED (the three the task warns about)

| Candidate | Test failure | Production check | Verdict |
|-----------|--------------|------------------|---------|
| Block **mute overlay** | `Block.test:145` `[style*="rgba(0,0,0,0.38)"]` null | `Block.tsx:442 {d.muted && <div style={muteOverlay} />}`, `muteOverlay.background = "rgba(0,0,0,0.38)"` (`Block.tsx:260`). Overlay renders; React serializes inline rgba with spaces (`rgba(0, 0, 0, 0.38)`) so the no-space substring selector cannot match. | stale selector (feature present) |
| Block **error indicator** | `Block.test:154` `queryByText(/error|failed|!/i)` null | `Block.tsx:435-436 {d.error && <div className="… ring-1 ring-error/60 …" />}` — error state renders a visual ring with NO text/aria-label. | stale selector (feature present; test asserts text the design never emitted) |
| useKeyboard **Ctrl+0-9 bookmark** | `useKeyboard.test` Ctrl+5 → `undefined` | `useKeyboard.ts:56-71` handler wired: `e.ctrlKey && !metaKey && codeDigit!=="" → useAppStore.getState().saveSpatialBookmark(codeDigit,{x,y,zoom})` from `reactFlow.getViewport()`; `useAppStore` exposes both `saveSpatialBookmark` (`:52,:118`) and `getSpatialBookmark` (`:53,:123`). Handler + store correct and current (and CLAUDE.md documents the feature). | stale test wiring (no regression) |

`juceBackend.ts`, `useKeyboard.ts`, `useGraphStore.ts`, `usePerformStore.ts` are all in the uncommitted-modified set (`git diff --name-only`), confirming the production refactor landed but the matching test infra/fixtures were not updated — classic stale, not collateral breakage.

## 4a. Stale-prop reference proofs (R3 — zero non-test references = genuinely removed)

| Removed/renamed symbol | Current shape (definition) | Non-test references | Verdict |
|------------------------|----------------------------|---------------------|---------|
| `GraphStore.breadcrumbs` | field is `breadcrumbStack` (`useGraphStore.ts:66,135`); selector `selectBreadcrumbs → s.breadcrumbStack` (`:424`). `breadcrumbs` exists only as optional snapshot-DTO key (`:97,:287`) | zero refs to a store field named `breadcrumbs` (`task-1-stale-proof.txt:3-33`) | stale |
| `PluginBrowserState.favorites` | field is `favoriteIdentifiers: Set<string>` (`usePluginBrowserStore.ts:37,44`) | `favorites` only as local var in `QuickAddPopup.tsx` (different scope) (`task-1-stale-proof.txt:41-52`) | stale |
| `ParameterState.params` | state exposes `values: Record<string,number>` (`useParameterStore.ts`); `.params` only on the `ParameterDelta` arg (`:39,:41`) | zero refs to a state field `params` (`task-1-stale-proof.txt:54-121`) | stale |
| `ParameterDelta.parameterIndex` | `ParameterDelta = {nodeId, params:[{i,v}]}` — no `parameterIndex` (`useParameterStore.ts:72-75`) | `parameterIndex` exists only on the unrelated `MidiMapping` shape (`useHostExtrasStore.ts:41`) + `useJuceBridge.ts:142` DTO | stale (wrong type) |
| `Port.index` | `Port = {id,type,direction,label,connected}` (`types.ts:6-12`) | zero non-test refs to `Port.index` (`task-1-stale-proof.txt:155-167`) | stale |
| `CanvasSnapshot.viewport` / `.graphBounds` | now REQUIRED on `CanvasSnapshot` (`useHostExtrasStore.ts:23-33`) | n/a — tests omit required fields | stale (add fields) |
| `SceneData.color` | `SceneData` = id/name/index/active/hasCapture? — no `color` (`types.ts:63-70`) | **zero** non-test `color` refs in scene store/types (`task-1-stale-proof.txt:153`, live rg confirms) | stale |
| `MacroControl.label` | `MacroControl` = id/name/sourceBlock/sourceParam/value/type/signalType — no `label`; uses `name` (`types.ts:72,85`) | zero non-test `MacroControl.label` refs (`task-1-stale-proof.txt:127`) | stale |
| `category "modifier"` (ConnectionEditor.test build err) | `BlockCategory = "generator"|"modifier"|"logic"` — `"modifier"` IS valid (`types.ts`); the TS2345 is a too-narrow helper-arg literal type, not a removed enum | n/a | stale (widen helper param type) |

---

## 5. Action summary

### Counts
- **Total failing tests:** 147 (19 files). **Build-block:** 31+ tsc errors across 11 test files.
- **Verdict split:** stale = **147** (100%); real-regression = **0**; out-of-scope = **0**.
- **Stale by root cause:** R1 mock-shape ≈ 118 tests (across 11 bridge/store/hook/PresetStrip files); R2 stale-selector ≈ 13 (Block 7, CommandPalette 5, ConnectionEditor 1); R3 removed-prop ≈ 4 runtime (useJuceBridge.gaps breadcrumbs) + 4 build-only files; R4 collection-error = 2 suites (GraphCanvas, QuickAddPopup).
- **Build-only (tsc fail / vitest pass):** 4 files — usePerformStore, useAppStore.gaps, useJuceBridge.mappers, PreferencesModal.

### Ordered repair list (for item 7)
1. **R1 — fix the canonical mock first (largest cascade, ~118 tests).** Rewrite `webview/src/test/mockJuceBridge.ts` `installJuceBridgeMock` to install the JUCE-8 event backend shape (`{backend:{emitEvent, addEventListener, removeEventListener}}`) and drive the `__juce__complete` resolution so `invokeElementNative` resolves the queued `bridge.mock` value. Recovers nativeGraph(58) + usePluginBrowserStore(20) + nativeSession(10) + nativePrefs(9) + nativePluginEditor(5) + nativePerform(5) + useJuceBridge(5) + nativeEngineSnapshot(4) + juceBackend(4) + nativeApp(3) + PresetStrip(3) + nativeKeyboard(2).
2. **R4 — unblock the 2 collection-error suites.** GraphCanvas: move the store-mock const into the `vi.mock` factory or `vi.hoisted()`. QuickAddPopup: fix the top-level `await import()` (line 248) and the `usePluginBrowserStore` mock selector type (TS2345).
3. **R3 — fix the 4 build-only blockers** (usePerformStore color/label, useAppStore.gaps setState shape, useJuceBridge.mappers favorites/params, PreferencesModal CanvasSnapshot viewport/graphBounds) — clears the remaining `tsc -b` errors and frees the production build.
4. **R3 runtime — useJuceBridge.gaps.test.tsx:** read `breadcrumbStack` not `breadcrumbs`; switch `toBe`→`toStrictEqual` for the handler-restore assertion.
5. **R2 — stale selectors:** Block.test (match `className` arbitrary-value `bg-[#…]`/`border-[#…]` and the error ring; account for React's spaced rgba), CommandPalette + ConnectionEditor (match current rendered markup/text).
6. **useKeyboard.test:** fix the event-synthesis (`e.code = "Digit5"`) and ensure the test and hook share one `useAppStore` instance so `getSpatialBookmark` reads what the handler wrote.
7. **Re-clean residual tsc lint errors** (TS6133 unused `beforeEach`/`nativeRedo`/`flushAsync`/`useBusStore`/`vi`; TS2578 unused `@ts-expect-error`) once shapes are fixed.

After steps 1-3 the production build should pass; after 1-7 the vitest suite should return to green with no production-source change.
