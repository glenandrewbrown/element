# WebView blueprint audit checklist

**Purpose:** Phase UI gate from the macOS DAW / MVP plan — map [ELEMENT_UNIFIED_BLUEPRINT.md](ELEMENT_UNIFIED_BLUEPRINT.md) and [stitch-reference/](stitch-reference/DESIGN.md) to live `webview/` surfaces, record gaps, and drive QA.

**Authority:** Blueprint + stitch-reference override informal notes. [AI_HANDOVER.md](../AI_HANDOVER.md) is operational status only.

---

## Surface map (routes → files)

| Blueprint / stitch area | Web implementation | Notes |
|-------------------------|-------------------|--------|
| App shell (chassis, panels) | `webview/src/components/layout/AppShell.tsx` | Edit vs perform panel slots |
| Toolbar (transport, breadcrumbs, session) | `webview/src/components/layout/Toolbar.tsx` | Native session + graph switcher when bridged |
| Left palette (plugins + projects) | `webview/src/components/layout/ToolPalette.tsx` | `elementGetPluginList`; **Projects** tab: `elementSessionListFiles` + open path |
| Right inspector | `webview/src/components/layout/InspectorHub.tsx` | Params from `elementGetNodeParameters`; plugin embed/float (`elementPluginEditor*`); overview uses engine snapshot |
| Bottom shelf (snippets) | `webview/src/components/layout/SnippetShelf.tsx` | Snippet UX vs blueprint — verify |
| Graph canvas | `webview/src/components/canvas/GraphCanvas.tsx` | React Flow; bridge mutations; `onMoveEnd` → `elementGraphSetViewport`; `translateExtent` from snapshot `graphBounds` |
| Command palette | `webview/src/components/canvas/CommandPalette.tsx` | Cmd+K |
| Perform: Quick access | `webview/src/components/layout/QuickAccess.tsx` | Live blocks from graph store |
| Perform: Live health | `webview/src/components/layout/LiveHealth.tsx` | Engine / metering from store |
| Perform: Macro dashboard | `webview/src/components/layout/MacroDashboard.tsx` | Scene/macro until PresetService wired |
| Neumorphic primitives | `webview/src/components/neu/*` | Tokens in `index.css` |
| Bridge ingestion | `webview/src/hooks/useJuceBridge.ts` | Snapshot → Zustand |

---

## Token / visual compliance (spot-check)

| Requirement (blueprint) | Where to verify |
|-------------------------|-----------------|
| Canvas `#1E1E22`, panel/surface/pressed scale | `webview/src/index.css` |
| No glass / blur / transparency on primary chrome | `AppShell`, `Toolbar`, panels |
| Semantic colours (generator / modifier / logic) | `tailwind` theme + block/cable types |
| Raised / pressed shadows on controls | `neu` components |

---

## Data truthfulness (no silent demo on MVP path)

| Store / UI | Expected source | Status |
|------------|-----------------|--------|
| Graph nodes/edges/comments | Native snapshot (`onGraphState`) | Live when hosted |
| Session name, BPM, buffer, device, latency | Snapshot `session` / `engine` | Live when hosted |
| Plugin list | `elementGetPluginList` | Live when hosted |
| Block parameters | `elementGetNodeParameters` | Live when hosted |
| Initial empty board (no host) | `demoGraph` seed in `useGraphStore` | Dev-only fallback; replaced on first native push |
| Scenes / perform macros | Snapshot `perform` + `hasCapture` | Active scene applies stored `paramStateJson` on host; Toolbar **CAP** runs `elementPerformCaptureScene` |
| MIDI mapping (prefs) | Snapshot `midiMapping` | Learn + map list + remove row bridge to `MappingService` |
| Inspector LOG / METERS tabs | Placeholder copy | **Gap:** bridge log + meter streams — **must** port (no native-only final) |

---

## Stitch-reference HTML

Static references (layout / density): [edit-mode.html](stitch-reference/edit-mode.html), [perform-mode.html](stitch-reference/perform-mode.html). Diff visually against running Web shell during milestone reviews.

---

## QA cross-links

- Host + bridge: [WEBVIEW_QA.md](WEBVIEW_QA.md)
- Parity backlog (A/B/C/D): [WEBVIEW_PARITY_MATRIX.md](WEBVIEW_PARITY_MATRIX.md)
- Full port mandate (no native-only final): [WEBVIEW_HYBRID_POLICY.md](WEBVIEW_HYBRID_POLICY.md)

---

## Sign-off (fill per release)

| Date | Reviewer | Blueprint/stitch pass | Notes |
|------|----------|------------------------|-------|
| | | ☐ | |
