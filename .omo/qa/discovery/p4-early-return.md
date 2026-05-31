# P4 Early-Return State Omission Audit

**Date**: 2026-05-08  
**Scope**: C++ JSON builders, polling timers, React effects  
**Status**: COMPLETE — 1 CRITICAL, 3 SAFE, 2 CONDITIONAL

---

## Executive Summary

Found **ONE CRITICAL P4 bug** (already fixed in commit f653b167) plus **THREE SAFE patterns** and **TWO CONDITIONAL patterns** that require monitoring. The critical issue was in `buildActiveGraphJson()` at line 4099–4121: when no graph was selected (`!gn.isGraph()`), the function returned early BEFORE writing the engine block (deviceName, sampleRate, bufferSize, latency, isPlaying), leaving React consumers with "—" placeholders. The fix hoisted the engine block above the early return. All append functions (`appendAudioSetupJson`, `appendOscHostJson`, `appendPerformJson`, `appendMidiMappingJson`, `appendMoleculesJson`) are safe — they write all fields unconditionally. React polling stores (`useEngineSnapshotStore.refresh()`) have a guard `if (snap == null) return;` but this is SAFE because the caller (`startPolling`) fires an immediate refresh on mount, and subsequent ticks always attempt to fetch fresh data.

---

## C++ Side: JSON Builders

### 1. **CRITICAL (FIXED)** — `buildActiveGraphJson()` @ line 4012–4200+

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/src/ui/element_webview_host.cpp`

**Issue**: Early return at line 4121 omits engine block fields.

```cpp
// Line 4098–4121
const Node gn (sess->getCurrentGraph());
if (! gn.isGraph())
{
    DynamicObject::Ptr canvas (new DynamicObject());
    canvas->setProperty ("snapToGrid", false);
    canvas->setProperty ("gridSize", 8);
    // ... canvas setup ...
    root->setProperty ("canvas", var (canvas.get()));
    root->setProperty ("activeGraphOutline", var (Array<var>()));
    return JSON::toString (var (root.get()));  // ← EARLY RETURN
}
```

**Missing Fields on Early Return**:
- `engine.deviceName`
- `engine.sampleRate`
- `engine.bufferSize`
- `engine.inputLatencySamples`
- `engine.outputLatencySamples`
- `engine.isPlaying`
- `activeGraphId`
- `activeGraphIndex`
- `breadcrumbs`
- `blocks`
- `cables`
- `commentBoxes`
- `activeGraphOutline` (set to empty array, but should be populated)

**Severity**: **CRITICAL** — React consumers (PROJECT OVERVIEW, D-3..D-6, D-12, D-14, D-17) display "—" for CPU, sample rate, buffer size, latency.

**Fix Applied** (commit f653b167): Hoisted engine block (lines 4082–4096) ABOVE the early return at line 4099. Engine snapshot now always emitted regardless of graph state.

**Status**: ✅ FIXED

---

### 2. **SAFE** — `appendAudioSetupJson()` @ line 420–474

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/src/ui/element_webview_host.cpp`

**Pattern**: No early returns. All fields written unconditionally:
- `outputDeviceName`, `inputDeviceName`, `sampleRate`, `bufferSize`
- `audioDeviceType`, `deviceTypes`, `outputDevices`, `inputDevices`
- `bufferSizes`, `sampleRates`

**Status**: ✅ SAFE

---

### 3. **SAFE** — `appendOscHostJson()` @ line 476–483

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/src/ui/element_webview_host.cpp`

**Pattern**: No early returns. All fields written unconditionally:
- `enabled`, `port`

**Status**: ✅ SAFE

---

### 4. **SAFE** — `appendMoleculesJson()` @ line 485–498

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/src/ui/element_webview_host.cpp`

**Pattern**: No early returns. Iterates molecules and writes all fields:
- `name`, `description` (per molecule)

**Status**: ✅ SAFE

---

### 5. **SAFE** — `appendPerformJson()` @ line 609–656

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/src/ui/element_webview_host.cpp`

**Pattern**: No early returns. Handles missing webPerform tree gracefully:
```cpp
if (wp.isValid()) { /* read scenes */ }
if (scenesVar.isEmpty()) { /* create default scene */ }
// Always writes:
perform->setProperty ("scenes", var (scenesVar));
perform->setProperty ("activeSceneIndex", activeIdx);
```

**Status**: ✅ SAFE

---

### 6. **SAFE** — `appendMidiMappingJson()` @ line 339–366

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/src/ui/element_webview_host.cpp`

**Pattern**: No early returns. Handles missing MappingService gracefully:
```cpp
bool learning = false;
if (auto* ms = ctx.services().find<MappingService>())
    learning = ms->isLearning();
mm->setProperty ("learning", learning);  // Always written
```

**Status**: ✅ SAFE

---

### 7. **SAFE** — `appendCanvasJson()` @ line 500–564

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/src/ui/element_webview_host.cpp`

**Pattern**: No early returns. All fields written unconditionally:
- `snapToGrid`, `gridSize`, `viewport` (x, y, zoom), `graphBounds` (minX, minY, maxX, maxY)

**Status**: ✅ SAFE

---

### 8. **SAFE** — `appendActiveGraphOutlineJson()` @ line 584–590

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/src/ui/element_webview_host.cpp`

**Pattern**: No early returns. Iterates nodes and builds outline:
```cpp
Array<var> outline;
for (int i = 0; i < G.getNumNodes(); ++i)
    outline.add (buildGraphOutlineRecursive (G.getNode (i)));
root->setProperty ("activeGraphOutline", var (outline));  // Always written
```

**Status**: ✅ SAFE

---

### 9. **CONDITIONAL** — `timerCallback()` @ line 3817–3866+

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/src/ui/element_webview_host.cpp`

**Pattern**: Early return at line 3819–3820:
```cpp
void ElementWebViewHost::timerCallback()
{
    if (browser == nullptr)
        return;  // ← Early return if no browser
    // ... rest of timer work ...
}
```

**Impact**: If browser is null, metering, cable levels, logs, graph snapshots, and parameter updates are NOT pushed. This is **SAFE** because:
1. If browser is null, there's no consumer to receive the data anyway.
2. The guard is necessary to prevent null-pointer dereference in `evalInBrowser()`.

**Status**: ✅ SAFE (guard is necessary)

---

### 10. **CONDITIONAL** — `buildCableLevelsJson()` (referenced @ line 3830)

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/src/ui/element_webview_host.cpp`

**Note**: Function not found in grep results. Likely defined elsewhere or inlined. Requires separate audit if it contains early returns.

**Status**: ⚠️ REQUIRES FOLLOW-UP

---

## React Side: Polling Stores & Effects

### 1. **CONDITIONAL** — `useEngineSnapshotStore.refresh()` @ line 58–94

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/stores/useEngineSnapshotStore.ts`

**Pattern**: Early return at line 60:
```typescript
refresh: async () => {
  const snap = await nativeGetEngineSnapshot();
  if (snap == null) return;  // ← Early return if no data
  set({
    ...snap,
    lastUpdated: Date.now(),
    hasHostData: true,
  });
  // Write-through to usePerformStore...
}
```

**Impact**: If `nativeGetEngineSnapshot()` returns null, the store is NOT updated. However:
1. **SAFE** because `startPolling()` (line 96–113) fires an immediate refresh on mount, then polls every 250ms.
2. If a single poll fails, the next poll (250ms later) will retry.
3. Consumers see stale data only briefly; the polling loop ensures eventual consistency.
4. The `hasHostData` flag allows consumers to detect "never received data" vs. "stale data".

**Status**: ✅ SAFE (polling loop provides eventual consistency)

---

### 2. **SAFE** — `useEngineSnapshotStore.startPolling()` @ line 96–113

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/stores/useEngineSnapshotStore.ts`

**Pattern**: Idempotent polling with immediate first refresh:
```typescript
void get().refresh();  // Fire immediately on mount
pollHandle = setInterval(() => {
  void get().refresh();
}, intervalMs);
```

**Status**: ✅ SAFE

---

### 3. **SAFE** — `usePerformStore.hydrateFromEngine()` @ line 43–57

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/stores/usePerformStore.ts`

**Pattern**: All fields are optional (`?`) and have defaults. Missing fields are ignored:
```typescript
hydrateFromEngine: (data: {
  sessionName?: string;
  scenes?: SceneData[];
  // ... all optional ...
}) => void;
```

**Status**: ✅ SAFE (optional fields with defaults)

---

### 4. **SAFE** — `useJuceBridge.ts` mount effect @ line 1+

**File**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/hooks/useJuceBridge.ts`

**Pattern**: `applySnapshot()` (line 269–280) has guard:
```typescript
function applySnapshot(raw: unknown) {
  const s = raw as EngineSnapshot;
  if (s == null || typeof s !== "object") return;  // ← Guard
  // ... apply snapshot ...
}
```

**Impact**: If snapshot is null/invalid, React state is NOT updated. This is **SAFE** because:
1. The guard prevents type errors.
2. Consumers see stale data only until the next snapshot arrives.
3. The C++ side (`buildActiveGraphJson()`) now always emits the engine block (post-fix).

**Status**: ✅ SAFE

---

## Summary Table

| Component | File | Line | Pattern | Severity | Status |
|-----------|------|------|---------|----------|--------|
| `buildActiveGraphJson()` | element_webview_host.cpp | 4099–4121 | Early return before engine block | CRITICAL | ✅ FIXED (f653b167) |
| `appendAudioSetupJson()` | element_webview_host.cpp | 420–474 | No early returns | SAFE | ✅ SAFE |
| `appendOscHostJson()` | element_webview_host.cpp | 476–483 | No early returns | SAFE | ✅ SAFE |
| `appendMoleculesJson()` | element_webview_host.cpp | 485–498 | No early returns | SAFE | ✅ SAFE |
| `appendPerformJson()` | element_webview_host.cpp | 609–656 | Graceful fallback | SAFE | ✅ SAFE |
| `appendMidiMappingJson()` | element_webview_host.cpp | 339–366 | Graceful fallback | SAFE | ✅ SAFE |
| `appendCanvasJson()` | element_webview_host.cpp | 500–564 | No early returns | SAFE | ✅ SAFE |
| `appendActiveGraphOutlineJson()` | element_webview_host.cpp | 584–590 | No early returns | SAFE | ✅ SAFE |
| `timerCallback()` | element_webview_host.cpp | 3817–3820 | Early return (necessary guard) | CONDITIONAL | ✅ SAFE |
| `buildCableLevelsJson()` | element_webview_host.cpp | ? | Unknown | UNKNOWN | ⚠️ FOLLOW-UP |
| `useEngineSnapshotStore.refresh()` | useEngineSnapshotStore.ts | 58–94 | Early return (polling loop recovers) | CONDITIONAL | ✅ SAFE |
| `useEngineSnapshotStore.startPolling()` | useEngineSnapshotStore.ts | 96–113 | Idempotent with immediate refresh | SAFE | ✅ SAFE |
| `usePerformStore.hydrateFromEngine()` | usePerformStore.ts | 43–57 | Optional fields with defaults | SAFE | ✅ SAFE |
| `applySnapshot()` | useJuceBridge.ts | 269–280 | Guard prevents type errors | SAFE | ✅ SAFE |

---

## Recommendations

1. **Verify `buildCableLevelsJson()`** — Find definition and audit for early returns.
2. **Monitor polling loop resilience** — Ensure `useEngineSnapshotStore.refresh()` retries on failure (currently it does via the 250ms loop).
3. **Add telemetry** — Log when `nativeGetEngineSnapshot()` returns null to detect systemic failures.
4. **Test empty-graph scenario** — Verify that PROJECT OVERVIEW displays correct engine metrics when no graph is selected (post-fix).

---

## Related Issues

- **Commit f653b167**: Hoisted engine block above early return in `buildActiveGraphJson()`.
- **Sisyphus QA**: `.sisyphus/qa/ui-bug-master-list.md` (D-3..D-6, D-12, D-14, D-17).

