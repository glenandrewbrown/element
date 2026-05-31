# P5 Discovery: Read-Only Display Values Without Store Subscriptions

**Date**: 2025-05-08  
**Scope**: webview/src/components/{layout,canvas}/*.tsx  
**Status**: COMPLETE AUDIT

---

## Executive Summary

Audit of Element's React webview found **2 critical hardcoded display values** (time signature "4/4" and mode badge "LIVE") and **1 TODO for missing input metering**. All other major display values (BPM, CPU, buffer, latency, device name, block/cable counts, cable meters, health metrics) are correctly subscribed to their source stores. The two hardcoded values are in Toolbar.tsx and represent the highest-priority fixes for full reactivity.

---

## Findings by Component

### 1. **Toolbar.tsx** — CRITICAL ISSUES

#### Issue 1.1: Time Signature Hardcoded to "4/4"
- **Location**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/components/layout/Toolbar.tsx:263`
- **Current Code**: `<span>4/4</span>`
- **Display Context**: Perform mode, right side of toolbar next to BPM
- **What Should Drive It**: `selectTimeSig` selector from `usePerformStore` (currently does not exist)
- **Store Status**: `usePerformStore.liveHealth` has no `timeSig` field; needs addition to `LiveHealth` interface
- **Severity**: **CRITICAL** — User cannot see actual time signature; always shows 4/4 regardless of engine state
- **Fix Path**: 
  1. Add `timeSig: string` to `LiveHealth` interface in usePerformStore.ts
  2. Create `selectTimeSig` selector
  3. Hydrate from engine snapshot (C++ bridge must emit time signature)
  4. Replace hardcoded span with `{timeSig}`

#### Issue 1.2: Mode Badge "LIVE" Hardcoded
- **Location**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/components/layout/Toolbar.tsx:264`
- **Current Code**: `<span>LIVE</span>`
- **Display Context**: Perform mode, right side of toolbar
- **What Should Drive It**: Engine state (running/stopped) or a "liveMode" flag from `useEngineSnapshotStore`
- **Current Subscription**: None; hardcoded string
- **Severity**: **CRITICAL** — Badge does not reflect actual engine state; always shows "LIVE" even when engine is stopped
- **Related**: StatusBar.tsx correctly shows "RUNNING"/"STOPPED" via `selectEngineRunning` from `useEngineSnapshotStore`
- **Fix Path**:
  1. Reuse `selectEngineRunning` from `useEngineSnapshotStore` in Toolbar
  2. Replace hardcoded "LIVE" with conditional: `{engineRunning ? "LIVE" : "IDLE"}` or similar
  3. Align styling/color with StatusBar's engine state indicator

#### Issue 1.3: BPM Display — CORRECTLY SUBSCRIBED ✓
- **Location**: Toolbar.tsx:261
- **Current Code**: `{bpm.toFixed(2)} BPM`
- **Subscription**: `const bpm = usePerformStore(selectBpm)` (line 138)
- **Source**: `selectBpm` → `s.liveHealth.bpm` (usePerformStore.ts:207)
- **Status**: ✓ LIVE-DRIVEN — No fix needed

#### Issue 1.4: Mode Toggle (Edit/Perform) — CORRECTLY SUBSCRIBED ✓
- **Location**: Toolbar.tsx:150, 163, 250
- **Subscription**: `const mode = useAppStore((s) => s.mode)` (line 133)
- **Status**: ✓ LIVE-DRIVEN — No fix needed

---

### 2. **StatusBar.tsx** — ALL CORRECT ✓

#### Status Display — CORRECTLY SUBSCRIBED ✓
- **Location**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/components/layout/StatusBar.tsx:56`
- **Current Code**: `{engineRunning ? "RUNNING" : "STOPPED"}`
- **Subscription**: `const engineRunning = useEngineSnapshotStore(selectEngineRunning)` (line 13)
- **Status**: ✓ LIVE-DRIVEN — No fix needed

#### Device Name, Sample Rate, Buffer, Latency — ALL CORRECTLY SUBSCRIBED ✓
- **Subscriptions**:
  - `health.clock` → `selectLiveHealth` from `usePerformStore`
  - `health.sampleRateLabel` → hydrated from engine snapshot
  - `health.buffer` → hydrated from engine snapshot
  - `health.latency` → hydrated from engine snapshot
- **Status**: ✓ ALL LIVE-DRIVEN — No fix needed

---

### 3. **LiveHealth.tsx** — MOSTLY CORRECT, 1 TODO

#### CPU Load — CORRECTLY SUBSCRIBED ✓
- **Location**: LiveHealth.tsx:71
- **Subscription**: `const health = usePerformStore(selectLiveHealth)` → `health.cpu`
- **Status**: ✓ LIVE-DRIVEN

#### Output Peak (I/O Activity) — CORRECTLY SUBSCRIBED ✓
- **Location**: LiveHealth.tsx:100
- **Subscription**: `health.outputPeak` from `selectLiveHealth`
- **Status**: ✓ LIVE-DRIVEN

#### Input Peak — TODO (NOT YET IMPLEMENTED)
- **Location**: LiveHealth.tsx:91-93
- **Current Code**: `<MeterBars heights={levelToLadderHeights(0)} color="#4A90D9" />`
- **Comment**: `/* TODO Q-VU-INPUT: bridge does not yet emit an input peak. Render an empty ladder rather than fake animation. */`
- **Status**: ⚠️ PLACEHOLDER — Hardcoded to 0; awaiting C++ bridge extension
- **Severity**: **MEDIUM** — Intentional placeholder; not a bug, but blocks full metering UI
- **Fix Path**: Requires C++ bridge to emit input peak; then add `inputPeak` to `LiveHealth` interface

#### Metrics (Sample Rate, Buffer, Latency, Device) — CORRECTLY SUBSCRIBED ✓
- **Subscriptions**: All from `selectLiveHealth` or `useEngineSnapshotStore`
- **Status**: ✓ LIVE-DRIVEN

---

### 4. **InspectorHub.tsx** — ALL CORRECT ✓

#### Project Overview Metrics — CORRECTLY SUBSCRIBED ✓
- **Location**: InspectorHub.tsx:416-467
- **Metrics**:
  - `BLOCKS`: `String(nodes.length)` from `selectNodes` (line 417)
  - `CABLES`: `String(edges.length)` from `selectEdges` (line 418)
  - `TOTAL CPU`: `cpuLabel` from `selectCpuPercent` (line 427)
  - `HOST CPU`: `cpuLabel` from `selectCpuPercent` (line 427)
  - `SAMPLE RATE`: `engineSampleRate` from `selectSampleRate` (line 428)
  - `BUFFER`: `engineBufferSize` from `selectBufferSize` (line 429)
  - `DEVICE`: `engineDeviceName` from `selectDeviceName` (line 430)
  - `LATENCY`: `engineDeviceLatencyMs` from `selectDeviceLatencyMs` (line 431)
- **Status**: ✓ ALL LIVE-DRIVEN — No fix needed

#### Block Metrics (Per-Block CPU, Latency, Ports) — CORRECTLY SUBSCRIBED ✓
- **Location**: InspectorHub.tsx:228-250
- **Subscriptions**: `block.cpuLoad`, `block.latencyMs`, `block.ports` from selected block data
- **Status**: ✓ LIVE-DRIVEN — No fix needed

---

### 5. **MacroDashboard.tsx** — ALL CORRECT ✓

#### Macro Controls, Scenes, FX Tabs — CORRECTLY SUBSCRIBED ✓
- **Subscriptions**:
  - `macros` from `selectMacros` (line 51)
  - `health` from `selectLiveHealth` (line 52)
  - `mapMode` from `selectMapMode` (line 53)
- **Status**: ✓ LIVE-DRIVEN — No fix needed

---

### 6. **Block.tsx** (Canvas) — ALL CORRECT ✓

#### Port Colors, Shapes, Connected State — CORRECTLY SUBSCRIBED ✓
- **Location**: Block.tsx:48-92
- **Subscriptions**: Driven by `BlockData` props (node.ports, node.category)
- **Status**: ✓ LIVE-DRIVEN — No fix needed

#### Bus Badges (Wireless Ports) — CORRECTLY SUBSCRIBED ✓
- **Location**: Block.tsx:108-149
- **Subscription**: `busName` from `useBusStore` (via parent Block component)
- **Status**: ✓ LIVE-DRIVEN — No fix needed

---

### 7. **Cable.tsx** (Canvas) — ALL CORRECT ✓

#### Cable Color (Signal Type) — CORRECTLY SUBSCRIBED ✓
- **Location**: Cable.tsx:56
- **Subscription**: `d?.signalType` from cable data
- **Status**: ✓ LIVE-DRIVEN

#### Cable Stroke Width (Channel Count) — CORRECTLY SUBSCRIBED ✓
- **Location**: Cable.tsx:57
- **Subscription**: `d?.channelCount` from cable data
- **Status**: ✓ LIVE-DRIVEN

#### Cable Meter Level (Activity Glow) — CORRECTLY SUBSCRIBED ✓
- **Location**: Cable.tsx:59
- **Subscription**: `const level = useCableMeterStore((s) => s.levels[id] ?? 0)` (line 59)
- **Status**: ✓ LIVE-DRIVEN — No fix needed

#### Cable Routing (Manhattan/Bezier) — CORRECTLY SUBSCRIBED ✓
- **Location**: Cable.tsx:60, 72-82
- **Subscription**: `const routing = useAppStore((s) => s.cableRouting)` (line 60)
- **Status**: ✓ LIVE-DRIVEN — No fix needed

#### Wireless Bus Badge — CORRECTLY SUBSCRIBED ✓
- **Location**: Cable.tsx:63
- **Subscription**: `const busName = useBusStore((s) => s.cableBus[id])` (line 63)
- **Status**: ✓ LIVE-DRIVEN — No fix needed

---

### 8. **QuickAccess.tsx** — ALL CORRECT ✓

#### Project Name — CORRECTLY SUBSCRIBED ✓
- **Location**: QuickAccess.tsx:40
- **Subscription**: `const projectName = usePerformStore(selectSessionName)` (line 17)
- **Status**: ✓ LIVE-DRIVEN

#### Blocks on Board — CORRECTLY SUBSCRIBED ✓
- **Location**: QuickAccess.tsx:63-80
- **Subscription**: `const nodes = useGraphStore(selectNodes)` (line 16)
- **Status**: ✓ LIVE-DRIVEN

---

### 9. **PreferencesModal.tsx** — ALL CORRECT ✓

#### Audio Setup, OSC, Canvas Settings — CORRECTLY SUBSCRIBED ✓
- **Subscriptions**: All from `useHostExtrasStore` with proper `useEffect` hydration
- **Status**: ✓ LIVE-DRIVEN — No fix needed

---

### 10. **SnippetShelf.tsx** — ALL CORRECT ✓

#### Molecule Count and List — CORRECTLY SUBSCRIBED ✓
- **Location**: SnippetShelf.tsx:8, 23, 34
- **Subscription**: `const molecules = useHostExtrasStore((s) => s.molecules)` (line 8)
- **Status**: ✓ LIVE-DRIVEN — No fix needed

---

## Summary Table

| Component | Issue | Location | Severity | Status |
|-----------|-------|----------|----------|--------|
| Toolbar | Time Signature "4/4" | :263 | CRITICAL | Hardcoded |
| Toolbar | Mode Badge "LIVE" | :264 | CRITICAL | Hardcoded |
| LiveHealth | Input Peak Metering | :91-93 | MEDIUM | TODO (awaiting C++ bridge) |
| StatusBar | Engine Status | :56 | — | ✓ Subscribed |
| InspectorHub | All Metrics | :416-467 | — | ✓ Subscribed |
| MacroDashboard | All Controls | :49-63 | — | ✓ Subscribed |
| Block.tsx | All Port/Bus Data | :48-149 | — | ✓ Subscribed |
| Cable.tsx | All Cable Data | :56-82 | — | ✓ Subscribed |
| QuickAccess | Project/Blocks | :16-80 | — | ✓ Subscribed |
| PreferencesModal | All Settings | :14-51 | — | ✓ Subscribed |
| SnippetShelf | Molecules | :8-34 | — | ✓ Subscribed |

---

## Recommended Fix Order

### Phase 1 (Immediate)
1. **Toolbar.tsx:263** — Add `timeSig` to `LiveHealth` interface and create `selectTimeSig` selector
2. **Toolbar.tsx:264** — Replace hardcoded "LIVE" with `selectEngineRunning` subscription

### Phase 2 (Blocked on C++)
3. **LiveHealth.tsx:91-93** — Await C++ bridge extension for input peak metering (Q-VU-INPUT)

---

## Store Subscription Verification

### usePerformStore Selectors (All Present)
- ✓ `selectSessionName`
- ✓ `selectMacros`
- ✓ `selectScenes`
- ✓ `selectLiveHealth` (includes: cpu, buffer, latency, clock, bpm, timecode, sampleRateLabel, alerts, ioActivity, outputPeak)
- ✓ `selectMapMode`
- ✓ `selectActiveScene`
- ✓ `selectBpm`
- ✓ `selectTimecode`
- ✓ `selectAlerts`
- ⚠️ `selectTimeSig` — **MISSING** (needs implementation)

### useEngineSnapshotStore Selectors (All Present)
- ✓ `selectCpuPercent`
- ✓ `selectSampleRate`
- ✓ `selectBufferSize`
- ✓ `selectDeviceName`
- ✓ `selectDeviceLatencyMs`
- ✓ `selectEngineRunning`
- ✓ `selectTransportRecording`
- ✓ `selectTransportPlaying`
- ✓ `selectHasHostData`

### useAppStore Selectors (All Present)
- ✓ `selectCableRouting`
- ✓ Mode toggle (via `s.mode`)

### useCableMeterStore (All Present)
- ✓ `s.levels[id]` — per-cable activity level

### useBusStore (All Present)
- ✓ `s.cableBus[id]` — wireless bus assignment

---

## Conclusion

**2 critical hardcoded values** block full reactivity in Toolbar. All other major display values are correctly subscribed to their source stores. The audit confirms that the P5 bug class (read-only display without subscription) is largely resolved except for the two Toolbar issues and the intentional input metering TODO.

**Next Action**: Implement Phase 1 fixes to eliminate hardcoded time signature and mode badge.
