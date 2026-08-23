# Element UI — Critical Bugs (P0 + P1, ranked)

**Date:** 2026-05-07
**Source:** `findings.md` (full detail)
**Scope:** Bugs in the React webview UI of Element at HEAD `4105eb23` (post-Wave-1 close, before Phase D / Wave 2).

## P0 (crash / data-loss / unrecoverable)

**None identified in this discovery pass.** All known crash hazards were already enumerated in the master fix plan (`master-fix-plan.md` §3.2) and addressed in Wave 1 (Team B / Team C closeouts). No new P0 surfaced from the UI inspection.

---

## P1 (documented feature broken or visibly wrong)

Ranked by user-visible impact.

### 1. ToolPalette falls back to fake demo plugin data (F-101)

`webview/src/components/layout/ToolPalette.tsx:155`

```tsx
if (nativePlugins.length === 0) return pluginsDemoFallback;
```

Falls through to a hardcoded array of 4 fake plugins (Oscillator Core V3, Wavetable Gen, Ladder Filter 24dB, Peak Limiter). Users on a fresh install see what looks like a populated plugin list — clicking these will fail because the names don't match any real bridge identifier. **This is exactly the "looks pretty but isn't connected" pattern Glen flagged.** The fallback was a development convenience that should never have shipped.

### 2. Scene prev/next buttons never reach the engine (F-201)

`webview/src/components/layout/Toolbar.tsx:65-66, 360-380`

Toolbar's < / > buttons invoke `useAppStore.setScene` which only mutates client state. The bridge call (`nativePerformSetActiveScene`) lives in a separate store (`usePerformStore.setActiveScene`) and is never reached from the toolbar. Result: SCENE label increments visually, parameter snapshot is never restored.

Two parallel scene-state systems = structural bug, not a one-line fix.

### 3. Toolbar Undo button has no onClick handler (F-102)

`webview/src/components/layout/Toolbar.tsx:206`

```tsx
<button className="…" title="Undo">
  <Icon name="Undo2" size={14} aria-label="Undo" />
</button>
```

No `onClick`. Cmd+Z and CommandPalette → "Undo" still work as alternates, but the primary toolbar affordance is dead.

### 4. Toolbar Redo button has no onClick handler (F-103)

`webview/src/components/layout/Toolbar.tsx:209` — same shape as F-102.

### 5. Toolbar TAP tempo button has no onClick handler (F-104)

`webview/src/components/layout/Toolbar.tsx:293` — no handler, no tap-tempo helper anywhere in `webview/src/`. Tap-tempo is a documented feature with no alternate input path.

### 6. Block double-click does nothing for plugin Blocks (F-105)

`webview/src/components/canvas/GraphCanvas.tsx:196-204`

`onNodeDoubleClick` only handles Container/Portal nodes (`containerNodeCount != null || isPortal`); for ordinary instrument/effect Blocks, nothing happens. Spec (Blueprint §10.1, CLAUDE.md): "Double-click Block: Dive into nested Board (Container/Portal) OR open embedded plugin GUI if not a container." The plugin-editor open path is missing — the bridge `elementPluginEditorOpen` exists and is wired in `InspectorHub`, just not from the canvas.

### 7. No drag-from-Tool-Palette to canvas (F-202)

`webview/src/components/layout/ToolPalette.tsx:362+` and `webview/src/components/canvas/GraphCanvas.tsx`

Plugin rows are not `draggable`; canvas has no `onDrop` / `onDragOver` handlers. Users must double-click or click the small + button. Blueprint §7.3 explicitly calls for "Drag onto Board: insert at drop position".

### 8. No add-to-favourite affordance (F-203)

No right-click "Add to Favourites", no star toggle, no `nativeSetPluginFavorite` wrapper, no `elementSetPluginFavorite` C++ bridge. The FAVOURITES section in Tool Palette is decorative — read-only. C++ side fills it via the heuristic `PluginUsageTracker`, never the user.

### 9. Record button missing from toolbar (F-204)

`Toolbar.tsx` renders Play/Stop/Rewind but no Record. Bridge wrapper `nativeTransportSetRecording` exists (`nativeGraph.ts:245`) and C++ handler is implemented (`element_webview_host.cpp:2117`). Pure UI gap.

### 10. Dashboard Builder is partial — composability missing (F-502)

`webview/src/components/layout/DashboardBuilder.tsx:486` carries an "Unbound placeholder overlay" comment. Blueprint §6.2 specifies a fully composable canvas (drag knobs/faders/buttons/meters/pads, wire to any parameter from any Block, save per-Project / per-Scene). The shipped surface delivers MAP MODE + MACROS + a few category buttons but the composer aspect is partial.

---

## Recommendation for Wave 1.5

The critical-bugs list above is short (10 items) and largely localised to two files: `Toolbar.tsx` (5 items: F-102, F-103, F-104, F-204, plus part of F-201) and the `ToolPalette.tsx` / `nativeGraph` family (3 items: F-101, F-202, F-203). A focused Wave 1.5 of ≈ 8–12 hours should clear:

1. F-101 plugin fallback — delete the fallback array; render an empty-state with link to Preferences → scan
2. F-102 / F-103 / F-104 / F-204 — wire 4 onClick handlers (15 minutes), build a TAP helper (~30 min)
3. F-201 scene divergence — collapse `useAppStore.activeScene` and `usePerformStore.activeSceneIndex` into a single bridge-aware selector (1–2 hours, careful)
4. F-105 plugin-GUI double-click — call `nativePluginEditorOpen` in `onNodeDoubleClick` else-branch (15 minutes)
5. F-202 drag-from-palette — HTML5 dnd setup on plugin rows + `<ReactFlow onDrop>` (1–2 hours)
6. F-203 favourite toggle — add `elementSetPluginFavorite` bridge + star-button UI (2–3 hours)
7. F-502 Dashboard Builder composability — multi-hour design effort, defer or scope tightly

Items 1-6 land in Wave 1.5 (~ 1 working day). Item 7 + the P2 list belong in a separate Wave 2 UI-polish pass after Phase D (sandbox) ships, to avoid contention with Phase D's audio-engine churn.

Wave 1 itself does NOT need to be reverted — none of these are Wave-1 regressions; they were latent in the V3.0 webview shell from the start.
