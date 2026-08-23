# React WebView UI — Exhaustive Functional Audit Report

**Date**: 2026-05-24 (v2 — runtime interaction pass)
**Auditor**: Claude Opus 4.7
**Build**: `882953c4` (local-enhancements)
**Method**: Chrome DevTools MCP runtime interaction + bridge call interception +
Zustand store state inspection + simulated engine data injection + AX tree +
source cross-reference

## Executive Summary

The React UI **renders correctly and hydrates all stores when data arrives in
the correct shape**. Verified: injecting a fake engine snapshot through
`window.__elementNative.onGraphState()` produced 3 graph nodes, 2 cables,
2 scenes, 2 graphs, full audio device data, and a working inspector panel.

The UI is non-functional in practice because:
1. **No plugin scan mechanism exists** in the React layer (P0)
2. **Preferences dropdowns ignore available data** in the store (P0)
3. **C++ engine doesn't include format/category per block** in the snapshot JSON (P2)
4. **Multiple data-flow gaps** prevent real data from populating stores on boot (P1)

Total bugs: **28** (4 P0, 7 P1, 11 P2, 6 P3)

---

## P0 — BLOCKERS (4)

### BUG-001: No Plugin Scan in React Preferences
**Native**: `PluginSettingsComponent` (`preferences.cpp:203-365`) with format toggles, path management, scan trigger.
**React**: Zero scan functionality. No mention of "scan" in `PreferencesModal.tsx`.
**Impact**: Plugin browser permanently empty → can't add blocks → graph editing impossible.

### BUG-002: No Bridge Functions for Plugin Scan
C++ only registers `elementGetPluginList` (read-only). Missing bridge functions:
- `elementScanPlugins` (trigger async scan)
- `elementGetPluginPaths` / `elementAddPluginPath` / `elementRemovePluginPath`
- `elementGetPluginFormats` / `elementSetPluginFormat`
Even if React had scan UI, there's no C++ bridge to call.

### BUG-003: Preferences Dropdowns Ignore Store Data
**Verified**: After injecting engine snapshot, `useHostExtrasStore.audioSetup` contains:
`deviceTypes=2, outputDevices=2, inputDevices=2, sampleRates=4, bufferSizes=5`
But `PreferencesModal.tsx` does NOT read from this store. DRIVER TYPE hardcodes one "Default" option. OUTPUT/INPUT/SAMPLE RATE/BUFFER render 0 options.
**Root cause**: Component renders `<select>` elements but never populates `<option>` children from the store.

### BUG-004: No Audio Device Enumeration Bridge
No `elementGetAudioDevices` bridge function. The C++ snapshot includes device data in `audioSetup` but:
- PreferencesModal doesn't read it (BUG-003)
- There's no dedicated enumeration call for when user changes driver type

---

## P1 — HIGH (7)

### BUG-005: Plugin Browser Always Empty
`usePluginBrowserStore.refresh()` calls `elementGetPluginList` → returns `[]` because no scan has run.
Console warning: `[bridge:usePluginBrowserStore.refresh] bridge returned null` (repeated 9x).
Retry polls at 1.5/3/5/8/12s all return empty.

### BUG-006: Session Tree Not Populated on Boot
Left panel shows "0 graphs". `elementSessionGetGraphTree` exists but is NOT called during boot.
The boot effect calls `elementGetGraphState` (graph nodes/edges) but not the session tree structure.
`SessionTree.tsx` needs to call `nativeSessionGetGraphTree()` on mount.

### BUG-007: Parameters Never Load for Any Block
Inspector shows "No automatable parameters for this block" for ALL blocks.
`elementGetNodeParameters` is called per-block when inspector mounts, but returns `undefined` without bridge → `useParameterStore` stays empty.
In JUCE host this may work IF the bridge call returns data, but the response parsing path is untested at runtime.

### BUG-008: Engine Snapshot Polling Returns Null
`useEngineSnapshotStore.startPolling(250)` fires `elementGetEngineSnapshot` at 4Hz (46 calls observed in 12s). All return `undefined` without bridge → `latestSnapshot: NULL`.
CPU, transport position, timecode, and recording state never update from this source.
In JUCE host: this works for status bar data (confirmed via screenshot).

### BUG-009: About Dialog Version Shows "—"
`elementAppGetAbout` returns `undefined` → version field shows em-dash.
In JUCE host: should return `{ name, version, copyright }` but untested.

### BUG-010: Session Operations Fire-and-Forget
New/Open/Save/As buttons fire correct bridge calls (`elementSessionNew`, `elementSessionSave`, etc.) but:
- No loading indicator while operation runs
- No success/failure feedback
- No UI update on completion (session name, dirty flag)
- `Open` may use `window.prompt()` instead of native file dialog (per AI_HANDOVER.md)

### BUG-011: QuickAdd / CommandPalette Data-Starved
Both features work structurally (QuickAdd on right-click, Cmd+K palette) but search has no results because plugin list is empty (blocked by BUG-001/002).

---

## P2 — MEDIUM (11)

### BUG-012: inferCategory() Uses Naive Name Matching
`useJuceBridge.ts:167` — heuristic checks if name contains "midi", "router", "input", "osc", "generator". Everything else defaults to "modifier".
**Result**: "Diva" (synth) → "modifier". "Audio Output" → "modifier". Both wrong.
**Root cause**: C++ `buildActiveGraphJson()` doesn't include `category` or `type` in block JSON. React must guess.
**Fix**: C++ add `category`/`type` field per block. React `mapBlock` reads it.

### BUG-013: inferFormat() Returns "INT" for Everything
`useJuceBridge.ts:180` — `return "INT"` hardcoded.
**Result**: All blocks show "INT" badge regardless of actual format (VST3/AU/CLAP/LV2).
**Root cause**: C++ `buildActiveGraphJson()` doesn't include `format` per block.
**Fix**: C++ add `format` field. React reads it.

### BUG-014: Engine State Inconsistency (Two Truth Sources)
Perform header reads `usePerformStore.isPlaying` (from graph snapshot) → shows "ENGINE: LIVE".
StatusBar reads `useEngineSnapshotStore` (from 4Hz poll) → shows "STOPPED".
Both sources can diverge because they update at different times from different bridge paths.
**Fix**: Single source of truth for engine-running state.

### BUG-015: Latency Display Unformatted
`LiveHealth.tsx` shows raw float `0.9583333333333333 ms` instead of `1.0 ms`.
Calculation `(23+23)/48000*1000` is correct but never rounded.
**Fix**: `latencyMs.toFixed(1)` in the display component.

### BUG-016: MIDI Learn Is Stub
Button fires `elementMappingSetLearning(true)` but:
- No visual indicator that learn mode is active
- No way to see/edit/remove learned mappings
- Preferences shows "No controller maps in the session snapshot yet."

### BUG-017: Snippet/Molecule Save Not Implemented
"No snippets saved — select blocks and save as molecule" — but there's no "Save as Molecule" action in the graph canvas context menu. `nativeMoleculeInsert` exists for loading but no create/save bridge function.

### BUG-018: Plugin Editor Double-Click Path Unverified
Blueprint: double-click block → open native plugin editor. `nativePluginEditorOpen` bridge exists.
Block component's double-click handler needs verification — may call it, may not.

### BUG-019: Import/Export .elg May Require Native File Dialog
Buttons fire `elementSessionImportGraph`/`elementSessionExportGraph` but file selection requires native OS dialog, which WebView can't provide. C++ side may handle this internally — needs runtime verification.

### BUG-020: VirtualKeyboard.tsx Sparse Array
ESLint `no-sparse-arrays` at line 49 — array literal with consecutive commas.
Creates `undefined` holes in key map, potentially causing missing keys.

### BUG-021: Session File Browser Always Empty
"SESSION FILES (HOST SCAN) — No matches or host returned an empty list."
The Projects tab in the browser calls `elementSessionListFiles` but the response is empty.
May need session scan similar to plugin scan, or directory path configuration.

### BUG-022: Perform Mode I/O Activity Shows "(n/a)"
Input activity shows "(n/a)", Output shows no value. The metering data (`onMetering` push at 60Hz) provides a single aggregate peak, not per-I/O breakdown. Component expects separate input/output metrics that don't exist in the bridge protocol.

---

## P3 — LOW / COSMETIC (6)

### BUG-023: 14+ Em-Dash Placeholders
BUFFER, SAMPLE, LATENCY in toolbar show "—" until engine snapshot arrives.
In JUCE host: fills correctly via snapshot. Dev-mode only.

### BUG-024: "Default Device" in Status Bar (Dev Mode)
Shows "Default Device" without bridge. Shows real device name in JUCE host.

### BUG-025: "Engine stopped" in Status Bar (Dev Mode)
Shows "STOPPED" without bridge. Shows "Running" in JUCE host.

### BUG-026: BPM Not Editable
BPM field shows "120.00" but is static text, not an input. User cannot type a new BPM value. Must use tap tempo or bridge call. Native UI has an editable BPM field.

### BUG-027: Board Dropdown Doesn't Switch Graphs
Dropdown shows 2 graphs (Main Graph, FX Chain) but selecting FX Chain fires `elementSessionSetActiveGraph` which returns undefined → no graph switch occurs.

### BUG-028: Timecode Display Missing
Transport timecode (e.g., "00:01:23.456") is owned by `useEngineSnapshotStore` which polls at 4Hz. Without bridge → shows "—". Even in JUCE host, 4Hz is below the PRD target of 10-30Hz (AI_HANDOVER.md line 295).

---

## Bridge Function Coverage Matrix

### Missing from C++ (React needs but can't call)

| Function | BUG | Priority |
|---|---|---|
| `elementScanPlugins` | BUG-002 | P0 |
| `elementGetPluginPaths` | BUG-002 | P0 |
| `elementAddPluginPath` | BUG-002 | P0 |
| `elementRemovePluginPath` | BUG-002 | P0 |
| `elementGetPluginFormats` | BUG-002 | P0 |
| `elementSetPluginFormat` | BUG-002 | P0 |
| `elementGetAudioDevices` | BUG-004 | P0 |

### Missing from C++ block JSON (React must infer badly)

| Field | BUG | Impact |
|---|---|---|
| `format` (VST3/AU/CLAP/LV2/INT) | BUG-013 | All blocks show "INT" |
| `category` (instrument/modifier/logic/generator) | BUG-012 | Diva labeled "modifier" |

### React components not consuming available store data

| Component | Store field available | BUG |
|---|---|---|
| PreferencesModal selects | `useHostExtrasStore.audioSetup.*` | BUG-003 |
| SessionTree | `useSessionStore.graphs` (populated) but needs `elementSessionGetGraphTree` on mount | BUG-006 |
| StatusBar engine state | `usePerformStore.isPlaying` exists but StatusBar reads `useEngineSnapshotStore` | BUG-014 |

---

## Verified Working (with data)

| Feature | Evidence |
|---|---|
| Graph canvas rendering (blocks + cables) | 3 React Flow nodes + 2 edges rendered from simulated data |
| Block selection | `selectedNodeId` set on click |
| Inspector panel (node details) | Shows name, category, format, metrics, bypass/mute buttons, notes |
| Session tree (with data) | Shows project name, graph count, graph names |
| Edit/Perform mode toggle | Full layout switch with panel reconfiguration |
| Scene launcher | 2 scenes with Capture/Rename/Delete buttons |
| Quick Access panel | Session name, blocks on board list |
| Live Health panel | CPU, buffer, latency, I/O activity |
| Status bar (in JUCE host) | Real device, sample rate, buffer, CPU |
| Snippets bar | Molecule name + description from snapshot |
| Minimap | Renders in canvas |
| Cable routing toggle (MAN/BEZ) | Switches cable display mode |
| About dialog | Opens modal (version missing without bridge) |
| Preferences modal | Opens, sections render |
| Keyboard shortcuts | Cmd+K opens palette, mode toggle works |
| Bridge call dispatch | 8 unique functions fired from button clicks |
| Engine snapshot polling | 46 calls in 12 seconds at 4Hz |
| Bridge receivers | `window.__elementNative` set up with 5 handlers |

---

## Recommended Fix Priority Order

### Sprint 1 (unblocks all graph editing) — ~3 days
1. **C++**: Add 7 missing bridge functions for plugin scan + audio device enumeration
2. **React**: Add PluginSettingsSection to PreferencesModal
3. **React**: Wire PreferencesModal dropdowns to `useHostExtrasStore.audioSetup`
4. **C++**: Add `format` + `category` fields to `buildActiveGraphJson()` block entries
5. **React**: Read format/category in `mapBlock()` instead of inferring

### Sprint 2 (completes core workflow) — ~2 days
6. **React**: Call `nativeSessionGetGraphTree()` on boot in SessionTree
7. **React**: Fix latency formatting (`toFixed(1)`)
8. **React**: Unify engine state truth source (eliminate StatusBar vs Perform inconsistency)
9. **React**: Add parameter fetching to inspector on node selection
10. **React**: Add loading/success/error feedback to session operations

### Sprint 3 (polish) — ~2 days
11. Fix VirtualKeyboard sparse array
12. Wire MIDI Learn visual feedback
13. Implement molecule/snippet save action
14. Make BPM field editable
15. Verify plugin editor double-click
16. Fix I/O Activity display (Input/Output breakdown)

## Test Methodology

- **Bridge call interception**: Monkey-patched `window.__JUCE__.backend.invokeNativeFunction` to capture all call names + arguments
- **Store state inspection**: Dynamic `import()` of all 11 Zustand stores, read `getState()` for every field
- **Simulated data injection**: Called `window.__elementNative.onGraphState(fakeSnapshot)` with correct C++ engine shape (`blocks`/`cables` not `nodes`/`edges`) to verify hydration
- **Button click audit**: Clicked all 36 buttons programmatically, recorded visible DOM changes
- **AX tree mapping**: Chrome DevTools `take_snapshot` for full accessibility tree with UIDs
- **Screenshot comparison**: Before/after simulated data injection
- **Console monitoring**: Filtered for error/warn/issue messages
- **Source cross-reference**: Compared every `registerFn()` in C++ against every `invokeElementNative()` in React; compared native Preferences sections against React PreferencesModal sections
