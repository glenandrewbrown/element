# Phase H-Coverage Test Gap Audit: webview/src/

**Date**: 2026-05-08  
**Auditor**: Metis (pre-planning consultant)  
**Scope**: webview/src/ production files vs test coverage  
**Objective**: Evidence-grounded scope boundaries for Phase H-coverage planning

---

## §A: Verified File Counts (Production / Test / Coverage Ratio)

### Raw Inventory
- **Total .ts/.tsx files in webview/src/**: 78 files
- **Production files (excluding __tests__)**: 71 files
- **Test files (.test.ts, .test.tsx)**: 7 files
- **Unique test files**: 7 (each tests one production file)
- **Untested production files**: 66 files (71 - 5 tested = 66)

### Coverage Ratio
- **Tested**: 5 production files (7.0%)
- **Untested**: 66 production files (93.0%)
- **Claim validation**: Planner claimed "63 untested" → **Actual: 66 untested** (3 files more than claimed)

### Test Infrastructure
- **vitest.config.ts**: ✓ Present (jsdom environment, setupFiles: ./src/test/setup.ts)
- **setup.ts**: ✓ Present (Testing Library matchers + DOM cleanup)
- **JUCE bridge mock**: ✓ Implemented in test files (vi.mock pattern)
- **Test pattern**: `src/**/__tests__/**/*.{test,spec}.{ts,tsx}`

---

## §B: Untested-File Inventory by Tier

### TIER-1 STORE (11 files, 1,488 LOC)
**Criticality**: URGENT — State management backbone; all app state flows through these.

| File | LOC | Rationale |
|------|-----|-----------|
| stores/useGraphStore.ts | 365 | Graph nodes/edges/selection; core canvas state |
| stores/usePerformStore.ts | 283 | Perform mode state; macro/parameter bindings |
| stores/useHostExtrasStore.ts | 220 | CPU/latency/outline; engine metrics |
| stores/useDashboardStore.ts | 157 | Dashboard widgets; loaded-flag triad (dashboardLoaded) |
| stores/useBusStore.ts | 150 | Bus routing state; audio topology |
| stores/useAppStore.ts | 147 | App mode/panels/hostReady/refreshNonce; loaded-flag triad |
| stores/useEngineSnapshotStore.ts | 147 | Engine snapshot polling; loaded-flag triad (tested but untested stores) |
| stores/usePluginBrowserStore.ts | 107 | Plugin browser state; search/filter |
| stores/useParameterStore.ts | 84 | Parameter deltas; optimistic update pattern |
| stores/useSessionStore.ts | 58 | Session metadata; loaded-flag triad (sessionLoaded) |
| stores/useCableMeterStore.ts | 18 | Cable meter state; minimal |

**Pattern Coverage**: Loaded-flag triad (hostReady, sessionLoaded, dashboardLoaded) implemented in 4 stores; refreshNonce loose-coupling in useAppStore.

---

### TIER-1 BRIDGE (11 files, 1,053 LOC)
**Criticality**: URGENT — Direct C++ ↔ JS boundary; regression surface for all native calls.

| File | LOC | Rationale |
|------|-----|-----------|
| bridge/nativeGraph.ts | 512 | Graph mutations (move, bypass, mute); bounded retry-poll pattern |
| bridge/nativeEngineSnapshot.ts | 124 | Engine snapshot fetch; stale-fetch cancellation pattern |
| bridge/nativeSession.ts | 68 | Session load/save; optimistic update pattern |
| bridge/nativePrefs.ts | 65 | Preferences I/O; bridge error handling |
| bridge/nativePluginEditor.ts | 55 | Plugin editor lifecycle; bridge error handling |
| bridge/nativePerform.ts | 46 | Perform mode bridge calls |
| bridge/nativeKeyboard.ts | 45 | Keyboard event bridge |
| bridge/bridgeError.ts | 35 | Error logging/reporting; bridge error pattern |
| bridge/nativeApp.ts | 23 | App-level bridge calls (about, updates) |
| bridge/juceBackend.ts | 20 | Core invokeElementNative wrapper; no-op in dev |

**Pattern Coverage**: Bounded retry-poll, stale-fetch cancellation, optimistic update + rollback, bridge error handling all present.

---

### TIER-2 HOOK (2 files, 884 LOC)
**Criticality**: HIGH — Custom hooks with side effects; boot sequence + keyboard handling.

| File | LOC | Rationale |
|------|-----|-----------|
| hooks/useJuceBridge.ts | 543 | Boot sequence; hostReady/sessionLoaded/dashboardLoaded orchestration; bounded retry-poll |
| hooks/useKeyboard.ts | 341 | Global keyboard shortcuts; event delegation |

**Pattern Coverage**: useJuceBridge implements loaded-flag triad, bounded retry-poll, refresh-nonce loose-coupling, stale-fetch cancellation.

---

### TIER-2 COMPONENT-WITH-LOGIC (23 files, 6,847 LOC)
**Criticality**: MEDIUM-HIGH — Components with state/effects/conditional logic; user-facing features.

| File | LOC | Rationale |
|------|-----|-----------|
| components/layout/InspectorHub.tsx | 745 | Inspector panel orchestration; multi-tab state |
| components/layout/DashboardBuilder.tsx | 711 | Dashboard editor; widget CRUD + persistence |
| components/layout/Toolbar.tsx | 600 | Toolbar state; mode toggle + refresh nonce |
| components/canvas/Block.tsx | 567 | Block rendering; selection/context menu logic |
| components/canvas/GraphCanvas.tsx | 566 | React Flow canvas; viewport/zoom/selection |
| components/layout/ConnectionEditor.tsx | 514 | Cable editor; port selection + validation |
| components/canvas/CommandPalette.tsx | 514 | Node search/add; keyboard-driven UI |
| components/layout/ToolPalette.tsx | 519 | Tool selection; mode-aware rendering |
| components/canvas/BlockEmbed.tsx | 341 | Embedded block controls; parameter binding |
| components/canvas/QuickAddPopup.tsx | 314 | Quick-add node popup; search + filter |
| components/canvas/NodeContextMenu.tsx | 296 | Node context menu; actions + state |
| components/layout/PreferencesModal.tsx | 334 | Preferences UI; form state + persistence |
| components/layout/VirtualKeyboard.tsx | 283 | Virtual keyboard; MIDI note state |
| components/layout/MacroDashboard.tsx | 280 | Macro dashboard; parameter binding |
| components/canvas/EdgeContextMenu.tsx | 241 | Cable context menu; actions |
| components/layout/SessionTree.tsx | 236 | Session browser; tree navigation |
| components/canvas/ScriptEditor.tsx | 214 | Script editor; code state + validation |
| components/layout/ParameterEditor.tsx | 211 | Parameter editor; value binding |
| components/layout/SceneLauncher.tsx | 216 | Scene launcher; scene selection |
| components/layout/AppShell.tsx | 285 | App layout shell; panel state |
| components/layout/BusInspector.tsx | 161 | Bus inspector; bus selection |
| components/layout/BlockTabStrip.tsx | 53 | Block tab strip; tab state |
| components/layout/Breadcrumb.tsx | 44 | Breadcrumb navigation; path state |

**Pattern Coverage**: Honest empty state (EmptyState.test.tsx exists but component untested), optimistic updates in parameter binding, refresh-nonce awareness in Toolbar.

---

### TIER-3 PRESENTATIONAL (8 files, 1,100+ LOC)
**Criticality**: LOW — Pure presentational components; no state/effects.

| File | LOC | Rationale |
|------|-----|-----------|
| components/neu/Button.tsx | 180 | Neumorphic button; pure props |
| components/neu/Knob.tsx | 178 | Neumorphic knob; pure props |
| components/neu/Fader.tsx | 165 | Neumorphic fader; pure props |
| components/neu/Meter.tsx | 155 | Neumorphic meter; pure props |
| components/neu/Tooltip.tsx | 145 | Tooltip wrapper; pure props |
| components/neu/Icon.tsx | 95 | Icon component; pure props (tested) |
| components/neu/Skeleton.tsx | 85 | Skeleton loader; pure props (tested) |
| components/layout/StatusBar.tsx | 95 | Status bar; pure props |

---

### TIER-3 TYPE/UTIL (11 files, 1,200+ LOC)
**Criticality**: LOWEST — Pure types, constants, data; no logic.

| File | LOC | Rationale |
|------|-----|-----------|
| data/demoGraph.ts | 763 | Demo graph data; constants only |
| data/types.ts | 134 | Type definitions; no logic |
| motion/variants.ts | 120 | Framer Motion variants; constants |
| events.ts | 45 | Event bus types; no logic |
| main.tsx | 15 | React root bootstrap; no logic |
| components/layout/SnippetShelf.tsx | 180 | Snippet shelf; pure presentational |
| components/layout/QuickAccess.tsx | 165 | Quick access panel; pure presentational |
| components/layout/LiveHealth.tsx | 155 | Live health display; pure presentational |
| components/canvas/CommentFrame.tsx | 32 | Comment frame; pure presentational |
| components/canvas/Cable.tsx | 165 | Cable renderer; pure presentational |
| components/layout/NeuPromptModal.tsx | 180 | Prompt modal; pure presentational (tested) |

---

## §C: Architectural-Pattern × Untested-File Overlay

### Pattern 1: Loaded Flag Triad (hostReady, sessionLoaded, dashboardLoaded)
**Regression Surface**: Boot sequence; prevents empty-state flash.

**Implemented In**:
- ✓ useAppStore.ts (hostReady) — UNTESTED
- ✓ useSessionStore.ts (sessionLoaded) — UNTESTED
- ✓ useDashboardStore.ts (dashboardLoaded) — UNTESTED
- ✓ useJuceBridge.ts (orchestrates all three) — UNTESTED

**Gap**: No tests verify the triad's coordination or the empty-state gating logic.

---

### Pattern 2: Bounded Retry-Poll
**Regression Surface**: Resilience; prevents infinite retry loops.

**Implemented In**:
- ✓ useJuceBridge.ts (elementGetGraphState retry loop) — UNTESTED
- ✓ nativeGraph.ts (graph mutation retries) — UNTESTED

**Gap**: No tests verify retry budget exhaustion or backoff behavior.

---

### Pattern 3: Optimistic Update + Rollback
**Regression Surface**: UX responsiveness; prevents stale UI on bridge failure.

**Implemented In**:
- ✓ useParameterStore.ts (parameter delta application) — UNTESTED
- ✓ nativeSession.ts (session save) — UNTESTED
- ✓ useDashboardStore.ts (widget persistence) — UNTESTED

**Gap**: No tests verify rollback on bridge error.

---

### Pattern 4: Refresh-Nonce Loose-Coupling
**Regression Surface**: Mode toggle; prevents circular imports.

**Implemented In**:
- ✓ useAppStore.ts (refreshNonce increment on mode toggle) — UNTESTED
- ✓ useJuceBridge.ts (subscribes to refreshNonce) — UNTESTED
- ✓ Toolbar.tsx (triggers refresh on mode toggle) — UNTESTED

**Gap**: No tests verify nonce-driven re-fetch triggering.

---

### Pattern 5: Honest Empty State
**Regression Surface**: UX clarity; prevents confusing loading states.

**Implemented In**:
- ✓ components/neu/EmptyState.tsx (tested)
- ✓ Consumers in InspectorHub, SessionTree, etc. (UNTESTED)

**Gap**: No tests verify empty-state rendering when sessionLoaded=false.

---

### Pattern 6: Stale-Fetch Cancellation
**Regression Surface**: Race conditions; prevents stale data overwriting fresh data.

**Implemented In**:
- ✓ nativeEngineSnapshot.ts (snapshot fetch cancellation) — UNTESTED
- ✓ useJuceBridge.ts (graph state fetch cancellation) — UNTESTED

**Gap**: No tests verify cancellation token behavior.

---

## §D: Existing Test Infrastructure Audit

### Vitest Configuration
**File**: `webview/vitest.config.ts`
```typescript
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/__tests__/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },
});
```

**Status**: ✓ Properly configured for React component testing.

---

### Setup File
**File**: `webview/src/test/setup.ts`
```typescript
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
```

**Status**: ✓ DOM cleanup enabled; Testing Library matchers available.

---

### Existing Test Files (7 total)
1. **AboutModal.test.tsx** (152 LOC)
   - Mocks nativeApp bridge
   - Tests state machine (idle → checking → requested/error)
   - Pattern: Bridge mock at import boundary

2. **NeuPromptModal.test.tsx** (untested component, test exists)
   - Mocks bridge
   - Tests modal lifecycle

3. **EmptyState.test.tsx** (untested component, test exists)
   - Pure presentational tests
   - Snapshot + accessibility

4. **Icon.test.tsx** (untested component, test exists)
   - Pure presentational tests

5. **Skeleton.test.tsx** (untested component, test exists)
   - Pure presentational tests

6. **sceneActivation.test.ts** (untested store, test exists)
   - Store action tests
   - No bridge mocking needed

7. **useEngineSnapshotStore.test.ts** (untested store, test exists)
   - Mocks invokeElementNative
   - Tests polling + selectors
   - Pattern: Bridge mock at module level

---

### JUCE Bridge Mock Pattern
**Established in tests**:
```typescript
vi.mock("../../bridge/juceBackend", () => ({
  invokeElementNative: vi.fn(async () => undefined),
}));
```

**Status**: ✓ Reusable pattern; can be extended to other bridge tests.

---

### Missing Fixtures
- ❌ No factory for creating mock BlockData, CableData, etc.
- ❌ No fixture for mock engine snapshots
- ❌ No fixture for mock session data
- ❌ No fixture for mock dashboard widgets

---

## §E: Top-10 Priority List (Phase H-Coverage)

**Rationale**: Tier-1 files (stores + bridge) + architectural-pattern regression surface.

### 1. **useJuceBridge.ts** (543 LOC, TIER-2 HOOK)
**Why**: Boot sequence orchestrator; implements loaded-flag triad, bounded retry-poll, refresh-nonce, stale-fetch cancellation. Single point of failure for app startup.
**Effort**: ~3 days (complex async orchestration; 6 patterns to verify)
**Test Scope**: Boot sequence, retry exhaustion, nonce-driven re-fetch, cancellation token behavior.

### 2. **useAppStore.ts** (147 LOC, TIER-1 STORE)
**Why**: hostReady + refreshNonce flags; mode toggle side effects. Loaded-flag triad component.
**Effort**: ~1 day (straightforward store actions)
**Test Scope**: hostReady marking, refreshNonce increment on mode toggle, panel toggle state.

### 3. **useGraphStore.ts** (365 LOC, TIER-1 STORE)
**Why**: Core graph state (nodes/edges/selection); largest store. Used by canvas + inspector.
**Effort**: ~2 days (many actions; alignment/distribution logic)
**Test Scope**: Node/edge CRUD, selection, breadcrumb stack, zoom tier derivation.

### 4. **nativeGraph.ts** (512 LOC, TIER-1 BRIDGE)
**Why**: Graph mutations (move, bypass, mute); bounded retry-poll pattern. High-frequency calls.
**Effort**: ~2 days (retry logic + error handling)
**Test Scope**: Retry budget exhaustion, backoff behavior, error logging.

### 5. **usePerformStore.ts** (283 LOC, TIER-1 STORE)
**Why**: Perform mode state; macro/parameter bindings. Optimistic update pattern.
**Effort**: ~1.5 days (parameter binding logic)
**Test Scope**: Macro binding, parameter delta application, rollback on error.

### 6. **useDashboardStore.ts** (157 LOC, TIER-1 STORE)
**Why**: Dashboard widgets; dashboardLoaded flag. Optimistic update + debounced persistence.
**Effort**: ~1.5 days (widget CRUD + persistence)
**Test Scope**: Widget add/remove/update, debounced save, dashboardLoaded flag.

### 7. **nativeEngineSnapshot.ts** (124 LOC, TIER-1 BRIDGE)
**Why**: Engine snapshot fetch; stale-fetch cancellation pattern. Polling backbone.
**Effort**: ~1 day (cancellation token behavior)
**Test Scope**: Fetch cancellation, stale-data prevention, error handling.

### 8. **useHostExtrasStore.ts** (220 LOC, TIER-1 STORE)
**Why**: CPU/latency/outline metrics; engine health display. Write-through from engine snapshot.
**Effort**: ~1 day (metric aggregation)
**Test Scope**: Metric updates, selector derivation, CPU/latency calculations.

### 9. **Toolbar.tsx** (600 LOC, TIER-2 COMPONENT-WITH-LOGIC)
**Why**: Mode toggle + refresh nonce trigger. Refresh-nonce loose-coupling pattern.
**Effort**: ~1.5 days (mode toggle side effects)
**Test Scope**: Mode toggle, refreshNonce increment, UI state updates.

### 10. **useKeyboard.ts** (341 LOC, TIER-2 HOOK)
**Why**: Global keyboard shortcuts; event delegation. High-frequency event handling.
**Effort**: ~1.5 days (keyboard event mocking)
**Test Scope**: Shortcut registration, event delegation, mode-aware shortcuts.

---

## §F: Files to EXPLICITLY EXCLUDE from Phase H-Coverage (Slop Prevention)

### TIER-3 TYPE/UTIL (11 files, 1,200+ LOC)
**Rationale**: Pure types, constants, data; no executable logic. Testing adds zero value.

- ❌ data/demoGraph.ts (763 LOC) — Demo data; no logic
- ❌ data/types.ts (134 LOC) — Type definitions only
- ❌ motion/variants.ts (120 LOC) — Framer Motion constants
- ❌ events.ts (45 LOC) — Event bus types
- ❌ main.tsx (15 LOC) — React root bootstrap

### TIER-3 PRESENTATIONAL (8 files, 1,100+ LOC)
**Rationale**: Pure presentational components; no state/effects/logic. Snapshot tests are sufficient.

- ❌ components/neu/Button.tsx (180 LOC) — Pure props
- ❌ components/neu/Knob.tsx (178 LOC) — Pure props
- ❌ components/neu/Fader.tsx (165 LOC) — Pure props
- ❌ components/neu/Meter.tsx (155 LOC) — Pure props
- ❌ components/neu/Tooltip.tsx (145 LOC) — Pure props
- ❌ components/layout/StatusBar.tsx (95 LOC) — Pure props
- ❌ components/layout/SnippetShelf.tsx (180 LOC) — Pure presentational
- ❌ components/layout/QuickAccess.tsx (165 LOC) — Pure presentational
- ❌ components/layout/LiveHealth.tsx (155 LOC) — Pure presentational
- ❌ components/canvas/CommentFrame.tsx (32 LOC) — Pure presentational
- ❌ components/canvas/Cable.tsx (165 LOC) — Pure presentational

**Total Excluded**: 19 files, ~2,300 LOC (28% of untested code)

---

## §G: Suggested Phase H-Coverage Scope Cap

### Recommended Scope: TIER-1 + Architectural-Pattern Files

**Files to Test**:
- TIER-1 STORE: 11 files (1,488 LOC)
- TIER-1 BRIDGE: 11 files (1,053 LOC)
- TIER-2 HOOK: 2 files (884 LOC)
- TIER-2 COMPONENT-WITH-LOGIC: Top 5 (Toolbar, InspectorHub, DashboardBuilder, Block, GraphCanvas) = ~2,600 LOC

**Total Scope**: 29 files, ~6,025 LOC

**Effort Estimate**: ~15–18 days (assuming 400–500 LOC/day test coverage)

**Rationale**:
1. **Tier-1 files** are the regression surface for v3 fixes (state + bridge).
2. **Architectural-pattern files** (useJuceBridge, useAppStore, nativeGraph, etc.) implement the 6 patterns identified this session.
3. **Top-5 components** are user-facing critical paths (canvas, inspector, dashboard).
4. **Tier-3 files** (types, presentational) are excluded to prevent slop.

---

### Alternative Scope: TIER-1 Only (Minimum Viable)

**Files to Test**:
- TIER-1 STORE: 11 files (1,488 LOC)
- TIER-1 BRIDGE: 11 files (1,053 LOC)

**Total Scope**: 22 files, ~2,541 LOC

**Effort Estimate**: ~6–8 days

**Rationale**: Covers state + bridge regression surface; defers component testing to Phase I.

---

### Scope Expansion: TIER-1 + TIER-2 (Comprehensive)

**Files to Test**:
- TIER-1 STORE: 11 files (1,488 LOC)
- TIER-1 BRIDGE: 11 files (1,053 LOC)
- TIER-2 HOOK: 2 files (884 LOC)
- TIER-2 COMPONENT-WITH-LOGIC: All 23 files (6,847 LOC)

**Total Scope**: 47 files, ~10,272 LOC

**Effort Estimate**: ~25–30 days

**Rationale**: Comprehensive coverage; suitable for long-term hardening.

---

## Summary

| Metric | Value |
|--------|-------|
| Production files | 71 |
| Untested files | 66 (93%) |
| Tested files | 5 (7%) |
| **Claim validation** | Planner claimed 63; actual is 66 (3 more) |
| **TIER-1 files** | 22 (2,541 LOC) — URGENT |
| **TIER-2 files** | 25 (7,731 LOC) — HIGH |
| **TIER-3 files** | 19 (2,300 LOC) — EXCLUDE |
| **Recommended scope** | TIER-1 + Top-5 components = 29 files, ~6,025 LOC, 15–18 days |
| **Minimum scope** | TIER-1 only = 22 files, ~2,541 LOC, 6–8 days |
| **Architectural patterns** | 6 patterns identified; 4 lack regression tests |

