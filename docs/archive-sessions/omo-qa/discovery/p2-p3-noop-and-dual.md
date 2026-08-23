# P2/P3 Bug Hunt: No-Op Buttons & Dual State Systems

**Date**: 2026-05-08  
**Scope**: webview/src (components + stores)  
**Status**: DISCOVERY COMPLETE — No critical P2/P3 issues found

---

## Executive Summary

Comprehensive audit of Element React webview for P2 (no-op onClick handlers) and P3 (dual/divergent state systems) found **zero critical issues**. All buttons have functional onClick handlers with proper state propagation. Scene state is correctly unified via `useAppStore.setScene()` → `usePerformStore.activateScene()`. Audio/OSC/Canvas settings use local component state with explicit "Apply" buttons that call native bridge functions. No orphaned dual-state patterns detected.

---

## P2 Hunt Results: No-Op Buttons

### Methodology
- Searched all `<button>` tags in layout, canvas, and component files
- Verified each button has a functional `onClick` handler
- Checked context menus (NodeContextMenu, EdgeContextMenu) for menu items without actions
- Audited modal action buttons (NeuPromptModal, PreferencesModal, DashboardBuilder)
- Checked sidebar nav and toolbar buttons

### Findings: CLEAN ✓

#### Toolbar Buttons (webview/src/components/layout/Toolbar.tsx)
All buttons have functional handlers:
- **Session buttons** (New/Open/Save/As): Lines 167–194 → `nativeSessionNew()`, `nativeSessionOpen()`, `nativeSessionSave()`, `nativeSessionSaveAs()`
- **Undo/Redo**: Lines 276–293 → `nativeUndo()`, `nativeRedo()`
- **Transport** (Rewind/Play/Stop): Lines 298–324 → `nativeTransportRewind()`, `nativeTransportTogglePlay()`, `nativeTransportStop()`
- **Panic**: Line 325+ → `nativeTransportPanic()`
- **TAP Tempo**: Lines 385+ → `handleTapTempo()` with rolling buffer logic
- **Scene navigation**: Lines 436–479 → `setScene()` with modulo arithmetic
- **Mode toggle**: Line 514+ → `toggleMode()`

**Status**: All functional. No empty onClick handlers found.

#### Context Menus
**NodeContextMenu.tsx** (Lines 190–240):
- All menu items have `onClick={item.action}` with real handlers
- Align/Distribute items (Lines 216–240) call `alignSelectedNodes()` / `distributeSelectedNodes()`
- Delete calls `handleDelete()` → `nativeGraphRemoveNode()`

**EdgeContextMenu.tsx** (Lines 150–180):
- Bus name buttons (Lines 150–157) call `setName(b.name)`
- Cancel/Confirm buttons (Lines 162–180) call `submitName()` or close
- Make Wireless/Wired/Delete all have functional handlers

**Status**: All functional. No no-op menu items.

#### Modal Buttons
**PreferencesModal.tsx**:
- **Apply audio** (Line 154–168): Calls `nativeAudioApplySetup()`
- **Apply OSC** (Line 192–200): Calls `nativeOscApplyHost()`
- **Apply canvas** (Line 226–234): Calls `nativeGraphSetCanvasOptions()`
- **MIDI learn** (Line 241–253): Calls `nativeMappingSetLearning()`
- **Lua console** (Line 308–314): Calls `nativeOpenLuaConsole()`
- **Graph mixer** (Line 315–321): Calls `nativeOpenGraphMixer()`
- **Dismiss overlay** (Line 322–328): Calls `nativeWebDismissOverlay()`
- **Close** (Line 65–71): Calls `onClose()`

**Status**: All functional. No no-op buttons.

**DashboardBuilder.tsx**:
- **Edit Layout toggle** (Line 589–605): Calls `setEditing(!editing)`
- **Add widget** (Line 617–625): Calls `setPaletteOpen((v) => !v)`
- **Delete widget** (Line 461–471): Calls `onDelete()`
- **Bind widget** (Line 475–485): Calls `onBind()`
- **Bind dialog confirm** (Line 353–360): Calls `handleBind()`
- **Clear dashboard** (Line 520+): Calls `handleClear()`

**Status**: All functional. No no-op buttons.

**NeuPromptModal.tsx**:
- **Confirm button** (Line 55): Calls `onConfirm(value)`
- **Cancel button** (Line 57): Calls `onCancel()`
- Both have proper focus trap and keyboard handling

**Status**: All functional.

#### QuickAddPopup.tsx
- **Plugin row buttons** (Line 92–102): Call `onSelect(plugin.id)`
- All have functional onClick handlers

**Status**: All functional.

#### SceneLauncher.tsx
- **Add scene** (Line 94): Calls `handleAddScene()`
- **Activate scene** (Line 119): Calls `handleActivate(index)`
- **Capture scene** (Line 178): Calls `handleCaptureScene(index)`
- **Rename scene** (Line 192): Calls `beginRename()`
- **Delete scene** (Line 203): Calls `handleDelete()`

**Status**: All functional.

### P2 Conclusion
**ZERO no-op buttons found.** All buttons have meaningful onClick handlers that trigger real state changes or native bridge calls.

---

## P3 Hunt Results: Dual/Divergent State Systems

### Methodology
- Compared state field names across all stores (useAppStore, usePerformStore, useSessionStore, useGraphStore, useHostExtrasStore, useEngineSnapshotStore, usePluginBrowserStore, useDashboardStore)
- Traced setters to verify propagation across stores
- Checked for local component state that shadows store state
- Audited PreferencesModal for audio/OSC/canvas state sync

### Findings: CLEAN ✓

#### Scene State (Already Verified — Not a Bug)
**Pattern**: `useAppStore.activeScene` + `usePerformStore.scenes`

**Implementation** (useAppStore.ts, Lines 74–77):
```typescript
setScene: (index) => {
  set({ activeScene: index });
  usePerformStore.getState().activateScene(index);
},
```

**Verification**: 
- `setScene()` updates `useAppStore.activeScene` AND calls `usePerformStore.activateScene()`
- `usePerformStore.activateScene()` updates internal perform state
- No divergence: setter in one store explicitly calls the other

**Status**: CORRECT. Not a bug.

#### Audio Settings State
**Pattern**: Local component state in PreferencesModal + useHostExtrasStore

**Implementation** (PreferencesModal.tsx, Lines 20–51):
```typescript
const [outDev, setOutDev] = useState("");
const [inDev, setInDev] = useState("");
const [driver, setDriver] = useState("");
const [sr, setSr] = useState(0);
const [buf, setBuf] = useState(0);

useEffect(() => {
  if (audio) {
    setOutDev(audio.outputDeviceName);
    setInDev(audio.inputDeviceName);
    setDriver(audio.audioDeviceType);
    setSr(audio.sampleRate);
    setBuf(audio.bufferSize);
  }
}, [audio]);
```

**Verification**:
- Local state is **intentionally** separate from store (modal is a form)
- `useEffect` syncs FROM store TO local state on mount/change
- "Apply audio" button (Line 154–168) calls `nativeAudioApplySetup()` with local values
- No setter in store that would diverge — store is read-only in this component

**Status**: CORRECT. Intentional form pattern.

#### OSC Settings State
**Pattern**: Local component state in PreferencesModal + useHostExtrasStore

**Implementation** (PreferencesModal.tsx, Lines 25–46):
```typescript
const [oscEn, setOscEn] = useState(false);
const [oscPort, setOscPort] = useState(9001);

useEffect(() => {
  if (osc) {
    setOscEn(osc.enabled);
    setOscPort(osc.port);
  }
}, [osc]);
```

**Verification**:
- Same pattern as audio: local form state, read-only store
- "Apply OSC" button (Line 192–200) calls `nativeOscApplyHost()` with local values
- No divergence

**Status**: CORRECT.

#### Canvas Settings State
**Pattern**: Local component state in PreferencesModal + useHostExtrasStore

**Implementation** (PreferencesModal.tsx, Lines 28–51):
```typescript
const [snapGrid, setSnapGrid] = useState(false);
const [gridSize, setGridSize] = useState(8);

useEffect(() => {
  setSnapGrid(canvas.snapToGrid);
  setGridSize(canvas.gridSize);
}, [canvas.snapToGrid, canvas.gridSize]);
```

**Verification**:
- Same pattern: local form state, read-only store
- "Apply canvas" button (Line 226–234) calls `nativeGraphSetCanvasOptions()` with local values
- No divergence

**Status**: CORRECT.

#### Dashboard Widget State
**Pattern**: useDashboardStore (widgets, editing, selectedId) + local component state in DashboardBuilder

**Implementation** (useDashboardStore.ts, Lines 75–130):
```typescript
export const useDashboardStore = create<DashboardState>()((set) => ({
  widgets: [],
  editing: false,
  selectedId: null,
  addWidget: (kind) => set((s) => { ... }),
  updateWidget: (id, patch) => set((s) => { ... }),
  removeWidget: (id) => set((s) => { ... }),
  ...
}));
```

**DashboardBuilder.tsx** (Lines 545–580):
```typescript
const widgets = useDashboardStore((s) => s.widgets);
const editing = useDashboardStore((s) => s.editing);
const selectedId = useDashboardStore((s) => s.selectedId);
const setEditing = useDashboardStore((s) => s.setEditing);
const selectWidget = useDashboardStore((s) => s.selectWidget);
const [paletteOpen, setPaletteOpen] = useState(false);
const [confirmClear, setConfirmClear] = useState(false);
const [bindWidgetId, setBindWidgetId] = useState<string | null>(null);
```

**Verification**:
- Store state (widgets, editing, selectedId) is the source of truth
- Local state (paletteOpen, confirmClear, bindWidgetId) is UI-only (transient)
- All mutations go through store setters
- No divergence

**Status**: CORRECT.

#### Plugin Browser State
**Pattern**: usePluginBrowserStore (plugins, favoriteIdentifiers, recentIdentifiers)

**Implementation** (usePluginBrowserStore.ts, Lines 42–100):
```typescript
export const usePluginBrowserStore = create<PluginBrowserState>()((set) => ({
  plugins: [],
  favoriteIdentifiers: new Set(),
  recentIdentifiers: [],
  refresh: async () => { ... },
}));
```

**Verification**:
- Single source of truth in store
- No local component state shadowing
- `refresh()` is the only mutation path

**Status**: CORRECT.

#### Parameter Store State
**Pattern**: useParameterStore (values: Record<string, number>)

**Implementation** (useParameterStore.ts):
- Single store, no shadowing
- Mutations via `setLocal()` and `hydrateFromEngine()`

**Status**: CORRECT.

#### Engine Snapshot State
**Pattern**: useEngineSnapshotStore (engine snapshot fields) + write-through to usePerformStore

**Implementation** (useEngineSnapshotStore.ts, Lines 58–75):
```typescript
refresh: async () => {
  const snap = await nativeGetEngineSnapshot();
  if (snap == null) return;
  set({
    ...snap,
    lastUpdated: Date.now(),
    hasHostData: true,
  });
  // Write-through into usePerformStore.liveHealth
  usePerformStore.setState({
    liveHealth: {
      ...usePerformStore.getState().liveHealth,
      cpu: snap.cpu,
      buffer: snap.buffer,
      latency: snap.latencyMs,
      clock: snap.clock,
      timecode: snap.timecode,
      sampleRateLabel: snap.sampleRateLabel,
    },
  });
},
```

**Verification**:
- Intentional write-through pattern (documented in comment)
- Engine snapshot is the source of truth
- Write-through to perform store is explicit and one-directional
- No divergence

**Status**: CORRECT.

### P3 Conclusion
**ZERO dual-state bugs found.** All state patterns are either:
1. **Single source of truth** (store is authoritative)
2. **Intentional form pattern** (local state is transient, store is read-only)
3. **Explicit write-through** (documented, one-directional)

No cases where a setter in one store fails to propagate to another.

---

## Detailed Findings Table

| Bug Class | File | Line(s) | Pattern | Status | Severity |
|-----------|------|---------|---------|--------|----------|
| P2 | Toolbar.tsx | 167–194 | Session buttons (New/Open/Save/As) | ✓ Functional | — |
| P2 | Toolbar.tsx | 276–293 | Undo/Redo buttons | ✓ Functional | — |
| P2 | Toolbar.tsx | 298–324 | Transport buttons (Rewind/Play/Stop) | ✓ Functional | — |
| P2 | Toolbar.tsx | 325+ | Panic button | ✓ Functional | — |
| P2 | Toolbar.tsx | 385+ | TAP Tempo button | ✓ Functional | — |
| P2 | Toolbar.tsx | 436–479 | Scene navigation buttons | ✓ Functional | — |
| P2 | Toolbar.tsx | 514+ | Mode toggle button | ✓ Functional | — |
| P2 | NodeContextMenu.tsx | 190–240 | Context menu items (Rename/Bypass/Mute/Delete/Align/Distribute) | ✓ Functional | — |
| P2 | EdgeContextMenu.tsx | 150–180 | Cable context menu (Make Wireless/Wired/Delete/Rename) | ✓ Functional | — |
| P2 | PreferencesModal.tsx | 154–328 | All preference buttons (Apply audio/OSC/canvas, MIDI learn, Lua, Mixer, Dismiss) | ✓ Functional | — |
| P2 | DashboardBuilder.tsx | 461–605 | Dashboard editor buttons (Edit/Add/Delete/Bind/Clear) | ✓ Functional | — |
| P2 | NeuPromptModal.tsx | 55–57 | Modal confirm/cancel buttons | ✓ Functional | — |
| P2 | QuickAddPopup.tsx | 92–102 | Plugin row buttons | ✓ Functional | — |
| P2 | SceneLauncher.tsx | 94–203 | Scene buttons (Add/Activate/Capture/Rename/Delete) | ✓ Functional | — |
| P3 | useAppStore.ts | 74–77 | Scene state propagation (setScene → activateScene) | ✓ Correct | — |
| P3 | PreferencesModal.tsx | 20–51 | Audio/OSC/Canvas local state | ✓ Intentional | — |
| P3 | useDashboardStore.ts | 75–130 | Dashboard widget state | ✓ Single source | — |
| P3 | usePluginBrowserStore.ts | 42–100 | Plugin browser state | ✓ Single source | — |
| P3 | useEngineSnapshotStore.ts | 58–75 | Engine snapshot write-through | ✓ Documented | — |

---

## Recommendations

### No Immediate Fixes Required
All P2 and P3 patterns are correct. The codebase follows best practices:
- All buttons have meaningful handlers
- State is properly unified or intentionally separated
- No orphaned dual-state patterns

### Preventive Measures (Optional)
1. **Linting rule**: Add ESLint rule to flag `onClick={() => {}}` or `onClick={undefined}` (already clean, but good for CI)
2. **Store audit**: Document the write-through pattern in useEngineSnapshotStore with a comment (already done)
3. **Form pattern**: Consider extracting PreferencesModal form pattern into a reusable hook for consistency

---

## Audit Scope

**Files Audited**:
- webview/src/components/layout/*.tsx (Toolbar, PreferencesModal, DashboardBuilder, SceneLauncher, NeuPromptModal, AppShell, etc.)
- webview/src/components/canvas/*.tsx (NodeContextMenu, EdgeContextMenu, QuickAddPopup, CommandPalette)
- webview/src/stores/*.ts (useAppStore, usePerformStore, useSessionStore, useGraphStore, useHostExtrasStore, useEngineSnapshotStore, usePluginBrowserStore, useDashboardStore, useParameterStore, useBusStore, useCableMeterStore)

**Exclusions**:
- node_modules, .git, dist, *.test.*, .claude/worktrees

**Search Methods**:
- Grep for `<button` tags and `onClick` patterns
- Manual code review of context menus and modal buttons
- Store field comparison across all zustand stores
- Setter propagation tracing

---

## Conclusion

**Status**: ✓ CLEAN — No P2 or P3 bugs detected.

The Element webview codebase demonstrates solid state management practices with no no-op buttons or dual-state divergence issues. All buttons are functional, all state is properly unified or intentionally separated, and all setters propagate correctly across stores.

**Ready to proceed**: No blocking issues. Codebase is ready for feature development.
