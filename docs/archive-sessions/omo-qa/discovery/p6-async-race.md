# P6 Async Race Condition Discovery — Element Webview

**Date**: 2025-05-08  
**Scope**: Webview React stores, hooks, bridge, and layout components  
**Severity**: P6 (async race conditions causing stale/empty data)  
**Pattern**: Fetch→use sequences without completion guards or retry-poll coordination

---

## Executive Summary

The Element webview exhibits **9 distinct async race-condition patterns** across session load, plugin discovery, mode toggle, and app boot flows. The canonical D-1 plugin scan case (refresh fired before scan completed) is partially mitigated with retry-poll (lines 473–481 in `useJuceBridge.ts`), but **6 additional unguarded fetch→use sequences** exist where data is read before async operations complete. Most critical: **session load → graph populate** (lines 448–451) fires `elementGetGraphState` but immediately reads `useGraphStore` without waiting; **plugin add → editor open** has no completion event; **mode toggle** does not re-fetch panel data; and **dashboard load** races against widget hydration. All require either retry-poll, completion events, or explicit ordering guards.

---

## Detailed Findings

### 1. **Session Load → Graph Populate (CRITICAL)**

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/hooks/useJuceBridge.ts:446–462`

**Scenario**: App boots → `useJuceBridge()` fires → `elementGetGraphState` async call → immediately applies snapshot to stores without waiting.

**Code**:
```typescript
void (async () => {
  try {
    const json = await invokeElementNative("elementGetGraphState", []);
    if (json !== undefined) {
      if (typeof json === "string") applySnapshot(JSON.parse(json));
      else applySnapshot(json);
    }
    await usePluginBrowserStore.getState().refresh();
  } catch (err) {
    logBridgeError("useJuceBridge.bootEffect", err);
  }
})();
```

**Race Risk**: 
- `applySnapshot()` (line 450–451) calls `useGraphStore.getState().hydrateFromEngine()` synchronously.
- If the bridge is slow or the host hasn't finished parsing the session, `json` may be `undefined` or incomplete.
- Components reading `useGraphStore.nodes` immediately after mount see empty graph until the next snapshot arrives.

**User Impact**: Graph canvas renders empty on session open; nodes appear after 1–2 seconds.

**Severity**: **CRITICAL** — blocks core workflow (session load).

**Fix**: 
- Add a `sessionLoaded` flag to `useSessionStore` that only sets to `true` after `applySnapshot()` completes.
- Components should guard with `if (!sessionLoaded) return <Loading />`.
- OR: Implement retry-poll similar to plugin scan (lines 473–481).

**Dependency**: None (blocks all downstream).

---

### 2. **Plugin Scan → List Display (PARTIALLY MITIGATED)**

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/hooks/useJuceBridge.ts:469–481`

**Scenario**: App boots → plugin scan is async in C++ → `elementGetPluginList` called at line 453 → list may be empty → retry-poll fires at 1.5s, 3s, 5s, 8s, 12s.

**Code**:
```typescript
const pluginPollDelays = [1500, 3000, 5000, 8000, 12000]; // ms, total ~30s
const pluginPollTimers: number[] = [];
pluginPollDelays.forEach((delay) => {
  const id = window.setTimeout(() => {
    if (usePluginBrowserStore.getState().plugins.length === 0)
      void usePluginBrowserStore.getState().refresh();
  }, delay);
  pluginPollTimers.push(id);
});
```

**Status**: ✅ **MITIGATED** — retry-poll is in place.

**Remaining Risk**: 
- If scan completes between polls (e.g., at 2s), the next poll at 3s will re-fetch unnecessarily.
- No exponential backoff or completion event from host — just bounded retries.
- If scan takes >12s, list stays empty forever.

**Improvement**: Add a completion event from C++ bridge (e.g., `onPluginScanComplete`) to stop polling early.

---

### 3. **Plugin Add → Editor Open (UNGUARDED)**

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/bridge/nativeGraph.ts:4–9`

**Scenario**: User clicks "Add Plugin" → `nativeGraphAddPlugin(identifier)` called → returns `true` → component immediately tries to open editor.

**Code**:
```typescript
export async function nativeGraphAddPlugin(
  identifier: string,
): Promise<boolean> {
  const r = await invokeElementNative("elementGraphAddPlugin", [identifier]);
  return r === true;
}
```

**Race Risk**: 
- Bridge returns `true` when the C++ call is *queued*, not when the plugin is *loaded*.
- If editor opens before plugin is fully instantiated, it may fail or show stale state.
- No completion event or state guard.

**User Impact**: Editor opens but plugin UI is blank or unresponsive; user must wait and retry.

**Severity**: **HIGH** — blocks plugin workflow.

**Fix**: 
- Add `onPluginLoaded(nodeId)` callback from C++ bridge.
- OR: Implement retry-poll in the editor-open handler (check if node exists in graph before opening).
- OR: Add a `pluginLoading` flag to `useGraphStore` that blocks editor open until `false`.

---

### 4. **Mode Toggle (Edit ↔ Perform) → Panel Data Stale (UNGUARDED)**

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/stores/useAppStore.ts:54–57`

**Scenario**: User toggles mode from Edit to Perform → `toggleMode()` fires → mode state updates → `PerformBottomPanel` renders with stale `usePerformStore` data.

**Code**:
```typescript
toggleMode: () =>
  set((s) => ({
    mode: s.mode === "edit" ? "perform" : "edit",
  })),
```

**Race Risk**: 
- Mode toggle is synchronous; no re-fetch of perform data (scenes, macros, health).
- If the host's perform state has changed since last snapshot, the UI shows stale data.
- `usePerformStore` is only updated by `onGraphState` callback or `useEngineSnapshotStore` polling (4 Hz).

**User Impact**: Switching to Perform mode shows old scene list, stale macro values, or outdated health metrics.

**Severity**: **MEDIUM** — data eventually updates (4 Hz poll), but initial view is wrong.

**Fix**: 
- On mode toggle, call `useEngineSnapshotStore.getState().refresh()` immediately.
- OR: Add a `onModeChange` callback from C++ bridge that pushes fresh perform state.

---

### 5. **App Boot → Initial State Hydration (UNGUARDED)**

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/hooks/useJuceBridge.ts:402–487`

**Scenario**: App mounts → `useJuceBridge()` effect runs → multiple async calls fire in parallel:
- `elementGetGraphState` (line 448)
- `usePluginBrowserStore.refresh()` (line 453)
- `useEngineSnapshotStore.startPolling()` (line 467)

**Race Risk**: 
- No coordination between these three async operations.
- Components may render before *any* of them complete.
- `useGraphStore`, `usePluginBrowserStore`, and `useEngineSnapshotStore` all start empty.
- If a component reads all three stores on mount, it sees empty state.

**User Impact**: App boots with blank graph, empty plugin list, and no health metrics; data trickles in over 1–2 seconds.

**Severity**: **MEDIUM** — UX is janky but recovers quickly.

**Fix**: 
- Add a `appBootComplete` flag that only sets to `true` after all three async operations complete.
- OR: Use `Promise.all()` to wait for all three before allowing renders.
- OR: Add loading states to each store and guard component renders.

---

### 6. **Dashboard Load → Widget Hydration (UNGUARDED)**

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/stores/useDashboardStore.ts:63–73`

**Scenario**: App boots → `DashboardBuilder` component mounts → calls `loadDashboardLayoutFromHost()` → async fetch → immediately reads `useDashboardStore.widgets`.

**Code**:
```typescript
export async function loadDashboardLayoutFromHost(): Promise<void> {
  const raw = await invokeElementNative("elementDashboardGetLayout", []);
  if (!Array.isArray(raw)) return;
  const widgets = raw as DashboardWidget[];
  _hydrating = true;
  try {
    useDashboardStore.setState({ widgets });
  } finally {
    _hydrating = false;
  }
}
```

**Race Risk**: 
- `loadDashboardLayoutFromHost()` is called but not awaited in most places.
- Component renders before `widgets` are populated.
- `_hydrating` flag prevents save debounce, but doesn't block reads.

**User Impact**: Dashboard renders empty; widgets appear after 100–500 ms.

**Severity**: **LOW** — dashboard is secondary UI; recovers quickly.

**Fix**: 
- Ensure all callers `await loadDashboardLayoutFromHost()` before rendering.
- OR: Add a `dashboardLoaded` flag to the store and guard renders.

---

### 7. **Preset Load → Parameter Update (UNGUARDED)**

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/components/layout/InspectorHub.tsx:75–83`

**Scenario**: User clicks "Load Preset" → `nativePresetLoad()` called → returns success → component immediately reads `presets` state.

**Code**:
```typescript
const refreshPresets = () => {
  void nativePresetList("").then((r) => {
    if (r.ok) setPresets(r.presets);
  });
};

useEffect(() => {
  refreshPresets();
}, [nodeId]);
```

**Race Risk**: 
- `refreshPresets()` is async but not awaited.
- If `nodeId` changes before the fetch completes, the old preset list is displayed.
- No guard against stale data from previous node.

**User Impact**: Switching between nodes shows preset list from the *previous* node for 100–300 ms.

**Severity**: **LOW** — recovers quickly; mostly cosmetic.

**Fix**: 
- Add a `presetsLoading` flag and guard the preset list render.
- OR: Ensure `refreshPresets()` is awaited before allowing node switches.

---

### 8. **Scene Activation → Perform State Update (UNGUARDED)**

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/stores/usePerformStore.ts:92–100`

**Scenario**: User clicks scene button → `activateScene(index)` called → `nativePerformSetActiveScene()` async → local state updated synchronously.

**Code**:
```typescript
activateScene: (sceneIndex) => {
  void nativePerformSetActiveScene(sceneIndex);
  set((s) => ({
    scenes: s.scenes.map((sc, i) => ({
      ...sc,
      active: i === sceneIndex,
    })),
  }));
},
```

**Race Risk**: 
- Local state is updated immediately; bridge call is fire-and-forget.
- If bridge call fails or is delayed, local state is out of sync with host.
- No error handling or rollback.

**User Impact**: Scene appears active locally but host hasn't switched; audio routing is wrong.

**Severity**: **MEDIUM** — audio routing is broken until host catches up.

**Fix**: 
- Wait for `nativePerformSetActiveScene()` to complete before updating local state.
- OR: Add error handling and rollback on failure.
- OR: Rely on `onGraphState` callback to confirm the change.

---

### 9. **Parameter Update → Bridge Confirmation (UNGUARDED)**

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/stores/usePerformStore.ts:104–120`

**Scenario**: User maps a parameter → `markParameterMapped()` called → local state updated → bridge call fires async.

**Code**:
```typescript
markParameterMapped: (nodeId, paramIdx, mapped) => {
  set((s) => {
    const key = `${nodeId}:${paramIdx}`;
    const next = new Set(s.mappedParameters);
    if (mapped) {
      next.add(key);
    } else {
      next.delete(key);
    }
    return { mappedParameters: next };
  });
  if (!_mappedHydrating) {
    void invokeElementNative("elementPerformMarkParameterMapped", [
      { nodeId, paramIndex: paramIdx, mapped },
    ]);
  }
},
```

**Race Risk**: 
- Local state is updated before bridge confirmation.
- If bridge call fails, local state is stale.
- No error handling or rollback.

**User Impact**: Parameter appears mapped locally but host hasn't registered it; MIDI learn fails silently.

**Severity**: **MEDIUM** — MIDI mapping is broken.

**Fix**: 
- Wait for bridge confirmation before updating local state.
- OR: Add error handling and rollback on failure.

---

## Summary Table

| # | Scenario | File:Line | Risk | Severity | Fix Pattern | Status |
|---|----------|-----------|------|----------|-------------|--------|
| 1 | Session load → graph populate | useJuceBridge.ts:446–462 | Undefined snapshot | CRITICAL | Completion guard / retry-poll | ❌ UNGUARDED |
| 2 | Plugin scan → list display | useJuceBridge.ts:469–481 | Scan incomplete | HIGH | Retry-poll | ✅ MITIGATED |
| 3 | Plugin add → editor open | nativeGraph.ts:4–9 | Plugin not loaded | HIGH | Completion event / retry | ❌ UNGUARDED |
| 4 | Mode toggle → panel data | useAppStore.ts:54–57 | Stale perform state | MEDIUM | Re-fetch on toggle | ❌ UNGUARDED |
| 5 | App boot → initial hydration | useJuceBridge.ts:402–487 | Empty stores | MEDIUM | Promise.all / boot flag | ❌ UNGUARDED |
| 6 | Dashboard load → widgets | useDashboardStore.ts:63–73 | Empty widget list | LOW | Await hydration | ❌ UNGUARDED |
| 7 | Preset load → list display | InspectorHub.tsx:75–83 | Stale preset list | LOW | Loading flag | ❌ UNGUARDED |
| 8 | Scene activation → state sync | usePerformStore.ts:92–100 | Out-of-sync state | MEDIUM | Await bridge call | ❌ UNGUARDED |
| 9 | Parameter map → confirmation | usePerformStore.ts:104–120 | Stale mapping | MEDIUM | Await bridge call | ❌ UNGUARDED |

---

## Recommended Fix Priority

1. **CRITICAL** (#1): Session load → graph populate — blocks core workflow.
2. **HIGH** (#3): Plugin add → editor open — blocks plugin workflow.
3. **MEDIUM** (#4, #5, #8, #9): Mode toggle, app boot, scene activation, parameter mapping — audio routing / MIDI broken.
4. **LOW** (#6, #7): Dashboard, preset list — cosmetic; recovers quickly.

---

## Consistent Pattern: Retry-Poll vs. Completion Events

**D-1 Mitigation (Plugin Scan)** uses **retry-poll** with bounded delays (1.5s, 3s, 5s, 8s, 12s). This is effective but:
- Wastes bridge calls if scan completes early.
- Fails silently if scan takes >12s.
- No feedback to user about scan progress.

**Recommended Approach**:
- For **critical paths** (session load, plugin add): Add C++ completion events (`onSessionLoaded`, `onPluginLoaded`) and wire them to Zustand.
- For **secondary paths** (dashboard, presets): Use retry-poll with exponential backoff and a max-retries cap.
- For **state mutations** (scene activation, parameter mapping): Always `await` bridge calls before updating local state.

---

## Testing Strategy

1. **Session Load**: Open a session with >50 nodes; verify graph is not empty on first render.
2. **Plugin Scan**: Disable plugin cache; boot app; verify plugin list is populated within 5s.
3. **Plugin Add**: Add a plugin; verify editor opens and UI is responsive.
4. **Mode Toggle**: Switch Edit ↔ Perform; verify scene list and macro values are current.
5. **Dashboard**: Boot app; verify dashboard widgets are populated on first render.
6. **Scene Activation**: Activate a scene; verify audio routing matches host state.
7. **Parameter Mapping**: Map a parameter; verify MIDI learn works on first try.

---

## References

- **D-1 Plugin Scan Fix**: `useJuceBridge.ts:469–481` (retry-poll pattern).
- **Deep Review**: `deep-review.md` §4.4 (bridge null vs. empty list distinction).
- **US-002 Wave 2**: Engine snapshot polling at 4 Hz (`useEngineSnapshotStore.ts:96–113`).
- **Blueprint**: `ELEMENT_UNIFIED_BLUEPRINT.md` (V3.0 Instrument paradigm).

