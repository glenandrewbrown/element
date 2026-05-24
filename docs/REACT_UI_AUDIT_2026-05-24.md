# React WebView UI — Functional Audit Report

**Date**: 2026-05-24
**Auditor**: Claude Opus 4.7 (automated runtime interaction testing via Chrome DevTools MCP)
**Build**: `ed39c89b` (local-enhancements)
**Method**: AX tree + DOM snapshot + bridge call interception + source analysis

## Executive Summary

The React WebView UI renders correctly but is **functionally inert**. It is a
visual shell with bridge wiring (86 C++ functions registered, 82 React callers)
but critical features that exist in the native JUCE UI were **never implemented**
in the React layer. The bridge infrastructure works — calls fire, data flows for
engine metrics — but the React components lack the feature implementations that
would consume that data and provide real user workflows.

The single most damaging gap: **the React Preferences has no plugin scan
functionality**, so the plugin browser is permanently empty, which blocks the
entire graph-editing workflow (add block → connect → route → mix).

## Severity Legend

- **P0 BLOCKER**: Prevents any useful work. Must fix before the React UI can replace the native UI.
- **P1 HIGH**: Major feature gap. User hits it within first 2 minutes.
- **P2 MEDIUM**: Feature missing or stub. User hits it when exploring deeper.
- **P3 LOW**: Data/cosmetic gap. Acceptable in dev mode, must work in JUCE host.

---

## P0 — BLOCKERS

### BUG-001: No Plugin Scan in React Preferences

**Native has**: `PluginSettingsComponent` (`preferences.cpp:203-365`) with:
- Plugin format toggles (AU/VST/VST3/LV2/CLAP)
- Plugin search path management (add/remove directories)
- Manual "Scan Now" trigger
- "Scan plugins on startup" toggle (`GeneralSettingsPage`, line 411)
- Dead-plugin blacklist management

**React has**: Zero. No mention of "scan", "pluginPath", or "format" in
`PreferencesModal.tsx`. The Preferences dialog has sections for Audio Device,
OSC Host, Board Canvas, and MIDI Mapping — but no Plugin section at all.

**Impact**: Without scan → `elementGetPluginList` always returns `[]` →
plugin browser shows "NO PLUGINS SCANNED" → QuickAdd/CommandPalette have
nothing to search → user cannot add blocks → graph editing is impossible.

**Bridge gap**: C++ registers `elementGetPluginList` (read-only, line 865) but
there is NO `elementScanPlugins`, `elementPluginPathAdd`, `elementPluginPathRemove`,
or `elementPluginFormatToggle` bridge function. Even if React had a scan UI,
there's no bridge call to trigger it.

**Fix requires**:
1. C++ — register `elementScanPlugins`, `elementGetPluginPaths`,
   `elementAddPluginPath`, `elementRemovePluginPath`, `elementGetPluginFormats`,
   `elementSetPluginFormat` bridge functions in `element_webview_host.cpp`
2. React — add `nativePluginScan.ts` bridge module
3. React — add Plugin Settings section to `PreferencesModal.tsx`
4. React — wire `usePluginBrowserStore.refresh()` to fire after scan completes

### BUG-002: Audio Device Enumeration Not Wired

**Native has**: `AudioSettingsComponent` (`preferences.cpp:744+`) using JUCE's
`AudioDeviceSelectorComponent` with full device enumeration: driver types,
output devices, input devices, sample rates, buffer sizes, I/O channel selection.

**React has**: PreferencesModal renders 5 `<select>` dropdowns (DRIVER TYPE,
OUTPUT, INPUT, SAMPLE RATE, BUFFER) but they're **permanently empty** (0 options
each except DRIVER TYPE which hardcodes "Default").

**Why**: The C++ engine snapshot includes `bufferSizes` and `sampleRates` arrays
(lines 473-474) in the `elementGetEngineSnapshot` response, but:
- There is no `elementGetAudioDeviceList` bridge function
- There is no `elementGetDriverTypes` bridge function
- The PreferencesModal doesn't read from the engine snapshot store
- The `nativeAudioApplySetup` function exists but can only APPLY a setup, not enumerate choices

**Fix requires**:
1. C++ — register `elementGetAudioDevices` returning `{ driverTypes, outputDevices,
   inputDevices, sampleRates, bufferSizes }` for the current driver
2. React — PreferencesModal must call this on mount + when driver type changes
3. React — populate all 5 dropdowns from the response

---

## P1 — HIGH

### BUG-003: Session Tree Always Empty

**Symptom**: Left panel shows "Untitled — 0 graphs — No graphs in session."

**Bridge exists**: `elementSessionGetGraphTree` is registered (C++ line ~904+)
and React has `nativeSessionGetGraphTree()` in `nativeGraph.ts`.

**Not called on boot**: `useJuceBridge` boot effect calls `elementGetGraphState`
but NOT `elementSessionGetGraphTree`. The `SessionTree` component likely needs
to fetch the tree on mount.

**Also**: `elementGetGraphState` returns graph nodes/edges for the ACTIVE graph
but doesn't populate the session tree's graph-list structure.

**Fix**: `SessionTree.tsx` → call `nativeSessionGetGraphTree()` on mount +
subscribe to session change signals. Wire result into `useSessionStore`.

### BUG-004: No Bridge Function to Trigger Plugin Scan

Even if BUG-001 adds a React UI, the C++ side only has `elementGetPluginList`
(returns current list, does not scan). A scan must:
1. Invoke `PluginManager::scanAudioPlugins()` (async, can take minutes)
2. Report progress back to React (% complete, current plugin name)
3. Push updated plugin list when done

This requires a new bridge function that starts an async scan worker and pushes
progress updates via `evalInBrowser("window.__elementNative.onPluginScanProgress(...)")`.

### BUG-005: Session Open Uses `window.prompt()` — UX Regression

Per `AI_HANDOVER.md` line 148-154: `window.prompt()` is still used for Save/Load
in P1-10. This means:
- "Open" button fires a browser `prompt()` dialog inside a JUCE WKWebView
- On macOS, `window.prompt()` may be blocked by WKWebView security policy
- Even if it works, it's a text input, not a native file picker
- Native UI uses JUCE `FileChooser` which gives a proper OS file dialog

**Fix**: Bridge functions `elementSessionOpen` / `elementSessionSave` should
handle file dialogs on the C++ side (they may already — verify).

### BUG-006: QuickAdd / CommandPalette Have No Plugins

Right-click canvas → QuickAdd popup appears, but the search has no results
because the plugin list is empty (BUG-001). CommandPalette (Cmd+K) opens but
has no plugin entries to search. Both are structurally correct but data-starved.

**Blocked by**: BUG-001 (plugin scan).

---

## P2 — MEDIUM

### BUG-007: Plugin Editor Never Opens on Double-Click

Blueprint spec says double-click block → open plugin's native editor window.
Bridge function `nativePluginEditorOpen(nodeId)` exists in `nativePluginEditor.ts`.
Unclear if the graph canvas `Block` component's `onDoubleClick` handler calls it.
Needs runtime verification in JUCE host with a loaded plugin.

### BUG-008: Import/Export .elg Likely Broken

Buttons fire `elementSessionImportGraph` / `elementSessionExportGraph` bridge
calls, but these may require native file dialogs which WebView can't provide.
The C++ side may handle file selection natively, or may expect a path argument
that the React side can't provide without a file picker.

### BUG-009: MIDI Learn is Stub

"MIDI Learn" button fires `elementMappingSetLearning(true)` but:
- No visual indicator that learn mode is active
- No way to see/edit/remove learned mappings in React
- Section says "No controller maps in the session snapshot yet."

### BUG-010: Snippet/Molecule Save Not Implemented

Bottom panel shows "No snippets saved — select blocks and save as molecule."
There's no "Save as Molecule" action wired in the React graph editor context
menu or toolbar. `nativeMoleculeInsert(name, x, y)` exists for INSERT but
there's no `nativeMoleculeCreate` or `nativeMoleculeSave`.

### BUG-011: Perform Mode Scenes Are Empty

Scene strip shows "SCENE 1/1" but with no parameter data captured. The
"CAP" (Capture) button fires `elementPerformCaptureScene` but without
real plugin parameters loaded, captured scenes would be empty.

### BUG-012: Virtual Keyboard Has Sparse Array

`VirtualKeyboard.tsx:49` has a sparse array (`no-sparse-arrays` ESLint error).
This creates undefined holes in the key map, potentially causing missing keys
or runtime errors when iterating the array.

---

## P3 — LOW / COSMETIC

### BUG-013: 14 Em-Dash Placeholders in Dev Mode

BUFFER: —, SAMPLE: —, LATENCY: —, HOST CPU: —, DEVICE: —, etc. These fill
correctly in the JUCE host via engine snapshot polling. Dev-mode only.

### BUG-014: "Default Device" in Status Bar

Shows "Default Device" instead of real audio device name in dev mode. Correct
in JUCE host ("FireFace 802").

### BUG-015: "Engine stopped" in Dev Mode

Status bar shows "STOPPED" in dev mode. Shows "Running" in JUCE host.
Dev-mode only.

---

## Bridge Function Coverage Matrix

### Registered in C++ but NOT called from React (dead wiring)

| Function | Purpose | Why not called |
|---|---|---|
| _(none found)_ | — | All 86 C++ functions have React callers |

### Called from React but MISSING from C++ (missing backend)

| Function | Purpose | Needed for |
|---|---|---|
| `elementScanPlugins` | Trigger async plugin scan | BUG-001, BUG-004 |
| `elementGetPluginPaths` | List plugin search directories | BUG-001 |
| `elementAddPluginPath` | Add plugin search directory | BUG-001 |
| `elementRemovePluginPath` | Remove plugin search directory | BUG-001 |
| `elementGetPluginFormats` | List available plugin formats + enabled state | BUG-001 |
| `elementSetPluginFormat` | Enable/disable a plugin format | BUG-001 |
| `elementGetAudioDevices` | Enumerate drivers, devices, rates, buffers | BUG-002 |

### Working end-to-end (verified)

| Flow | Evidence |
|---|---|
| Transport Play/Stop/Rewind/Record | Bridge calls fire with correct function names |
| Undo/Redo | Bridge calls fire |
| Session New/Save | Bridge calls fire |
| MIDI Panic | Bridge call fires |
| Engine snapshot (4Hz poll) | 46 calls in 12 seconds, status bar shows real data in JUCE host |
| Metering (60Hz push) | `onMetering` + `onCableLevels` pushed from C++ timer |
| Graph state push | `pushGraphSnapshot()` fires on graph mutations |
| Mode toggle (Edit/Perform) | UI switches layout correctly |
| Preferences open | Modal renders with sections |
| Cable routing toggle (MAN/BEZ) | UI updates |
| Command Palette (Cmd+K) | Opens (but empty without plugins) |

---

## Recommended Fix Priority

1. **BUG-001 + BUG-004** (Plugin scan) — unblocks everything. ~2-3 days.
   - C++: 6-8 new bridge functions + async scan worker
   - React: Plugin settings section + scan progress UI
   
2. **BUG-002** (Audio device enumeration) — unblocks audio config. ~1 day.
   - C++: 1 new bridge function returning device tree
   - React: Populate existing dropdowns

3. **BUG-003** (Session tree) — unblocks session navigation. ~0.5 day.
   - React only: call `nativeSessionGetGraphTree()` on mount

4. **BUG-005** (File dialogs) — unblocks session management. ~0.5 day.
   - Verify C++ side handles file selection natively

5. **BUG-007–011** (Feature stubs) — individual ~0.5 day each.

---

## Test Methodology

- **AX Tree snapshot**: macOS Accessibility API via AppleScript
- **DOM snapshot**: Chrome DevTools MCP `take_snapshot`
- **Bridge interception**: Monkey-patched `window.__JUCE__.backend.invokeNativeFunction`
  to capture all call names, arguments, and return values
- **Console monitoring**: Chrome DevTools MCP `list_console_messages` filtered for
  error/warn/issue types
- **Source analysis**: Cross-referenced every `registerFn()` in C++ against every
  `invokeElementNative()` in React
- **Visual verification**: Screenshots via `screencapture` (macOS) and Chrome DevTools
- **Runtime verbose log**: `~/Library/Application Support/Kushview/Element/log/element-verbose.log`
