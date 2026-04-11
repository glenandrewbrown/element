# Web UI QA matrix (Element)

Native JUCE chrome is covered by `tools/automation/` (Accessibility API). The React board inside `WebBrowserComponent` uses the platform web engine (WKWebView, WebView2, WebKitGTK). Use this matrix in addition to CTest and `cd webview && npx tsc -b`.

## Smoke (each target OS)

1. **Bundle load** — With `webview/dist` built, standalone shows the React shell (no “bundle not found” stub).
2. **Dev URL (debug only)** — `ELEMENT_WEBVIEW_DEV_URL=http://127.0.0.1:5173` is honored **only in debug builds**; **release** builds always load the embedded `webview/dist` (no accidental dev server in production).
3. **Graph sync** — Add/remove a block or cable in the session; the board updates within ~1 frame of the debounced C++ push (or after session tree navigation).
4. **Session tree** — Double-clicking a graph row activates that board under Web content (`WebContent::activateBoard`).
5. **Plugin mode** — VST3/AU editor window shows Perf sliders footer and Web main area; plugin windows still open and hide with editor visibility.
6. **Metering** — Output peak callbacks fire without glitches at 60 Hz (sanity: no runaway CPU from `evaluateJavascript`).
7. **Graph seed** — In Element, the board starts **empty** until the first `onGraphState` snapshot. Standalone Vite dev can use **`VITE_USE_DEMO_GRAPH=1`** to load [demoGraph.ts](../webview/src/data/demoGraph.ts).
8. **Smart cables** — `onCableLevels([{ id, level }])` fires ~60 Hz; `id` matches snapshot cable ids. Audio/CV levels follow source-node output RMS (same scaling as classic arcs); MIDI/Atom uses activity flags. Cables brighten and gain stroke/glow with `level`.

## macOS DAW matrix (Logic Pro)

Run with **Release** build, signed if required by the host.

| Check | AU Music Device | AU Effect | AU MIDI Processor |
|-------|-----------------|-----------|-------------------|
| Instantiation | Load on instrument track | Load on audio track insert | Load on MIDI FX slot |
| Editor open/close | Repeat 5×; no crash | Same | Same |
| Resize editor | Drag corner; WebView + footer layout sane | Same | Same |
| Web graph | Add plugin node, connect, save project, reopen | Same | Same |
| Nested graph | Open container block if present | Same | Same |

## macOS / Windows DAW matrix (Nuendo / Cubase-style)

Primary format: **VST3** (categories: Instrument, Audio FX, MIDI FX if listed).

| Check | Action |
|-------|--------|
| Load each advertised VST3 category | No black screen; UI appears |
| Editor visibility | Hide/show track inspector editor |
| CPU | Brief session with transport running; no runaway from `evaluateJavascript` |

## Session / file bridge (Web toolbar + palette)

Classic parity reference: [WEBVIEW_PARITY_MATRIX.md](WEBVIEW_PARITY_MATRIX.md) §5.

| Check | Expected |
|-------|----------|
| **Snapshot** | Toolbar shows session name stem, **•** when `session.dirty`, device latency (ms) when audio device reports samples. |
| **New** | Toolbar **New** runs native new-session flow (save prompt if dirty); graph refreshes. |
| **Open** | **Open** shows `.els` chooser; after load, board and session name match file. |
| **Save / Save As** | **Save** / **As…** invoke native save; dirty clears when saved. |
| **Cmd+S / Cmd+Shift+S** | Same as Save / Save As with WebView focused. |
| **Recent** | Left palette lists `session.recentFiles`; click opens path via `elementSessionOpenPath`. |
| **Multi-graph** | With 2+ graphs, **Board** `<select>` switches active graph (`elementSessionSetActiveGraph`). |
| **Canvas snap** | Preferences → Board canvas → Apply: `elementGraphSetCanvasOptions`; React Flow snap/grid matches snapshot `canvas`. |
| **Board outline** | ToolPalette shows nested **Board outline** from `activeGraphOutline` when containers exist. |
| **Mute** | Inspector MUTE / MUTE INPUTS toggles `elementGraphSetMute`; block shows muted state after snapshot. |
| **Molecules** | Palette molecule row runs `elementMoleculeInsert(name)`; nodes enqueue via `AddPluginMessage`. |
| **Perform scenes** | Toolbar scene arrows call `elementPerformSetActiveScene`; **+** adds scene (`elementPerformAddScene`); **CAP** captures parameters to active scene (`elementPerformCaptureScene`); orange dot when `hasCapture`; persists under session `webPerform`. |
| **Projects browser** | ToolPalette **Projects** tab lists `elementSessionListFiles`; click opens `elementSessionOpenPath`. |
| **Plugin embed** | Inspector **Embed in shell** / **Float** / **Close** call `elementPluginEditor*`; native editor draws in host overlay (coordinates from inspector slot). |
| **Canvas viewport** | After pan/zoom, host receives `elementGraphSetViewport`; snapshot `canvas.viewport` / `graphBounds` stay consistent for minimap extent. |
| **MIDI maps** | Preferences: learn toggle (`elementMappingSetLearning`); table from `midiMapping.maps`; row remove (`elementMappingRemoveMap`). |
| **About** | Toolbar **About** loads `elementAppGetAbout`; **Check for updates** calls `elementAppCheckForUpdates` (native updater UI). |

## UI completion (Web shell)

- **Resize** — Narrow host window; minimap/sidebar behavior matches blueprint breakpoints where implemented.
- **Perform mode** — Switch edit/perform; perform strip reads live BPM/buffer/device from graph JSON when connected to Element.
- **Inspector** — Selected block shows real plugin parameters when the node has an audio processor; empty state when none.
- **Comment frames** — Create/move/delete syncs to graph `CommentBoxes` ValueTree (visible in legacy editor after sync).
- **Keyboard** — Focus does not trap inside WebView for critical shortcuts (document host-specific quirks). With Web focus: **Shift+C** adds a comment at viewport center; **Delete/Backspace** removes a selected comment (`elementGraphCommentDelete`) or block (`elementGraphRemoveNode`); **Cmd+C** copies selected block UUIDs to the host pasteboard (`elementGraphCopyNodes`); **Cmd+V** pastes by duplicating each stored UUID (`elementGraphPasteNodes` → `DuplicateNodeMessage`, same undo path as legacy duplicate); **Cmd+D** duplicates the selected block (`elementGraphDuplicateNodes`, fallback single duplicate); **Cmd+R** renames the selected block (`elementGraphRenameNode`, prompt).

## Blueprint / MVP audit (webview)

Use the living checklist: [docs/WEBVIEW_BLUEPRINT_AUDIT_CHECKLIST.md](WEBVIEW_BLUEPRINT_AUDIT_CHECKLIST.md).  
Cross-check [docs/ELEMENT_UNIFIED_BLUEPRINT.md](ELEMENT_UNIFIED_BLUEPRINT.md) and static refs in [docs/stitch-reference/](stitch-reference/DESIGN.md) against `webview/src/`.

| Area | Check |
|------|--------|
| Shell | AppShell, Toolbar, panels use chassis tokens (no glass on primary surfaces). |
| Graph | GraphCanvas, Block, Cable, QuickAdd, CommandPalette wired to bridge where specified. |
| Inspector | Real parameters + bypass; no `PREVIEW_*` on primary path. |
| Perform | Mode toggle; perform data from engine snapshot when hosted (not demo seed). |
| DAW | Resize, footer (`WebContent::setExtraView`), min editor size in plugin hosts. |

## Accessibility (Web)

- **Keyboard** — Focus order reaches primary canvas controls and command palette (`Cmd+K` / equivalent).
- **Semantic structure** — Headings/landmarks on shell panels; graph nodes expose name/state where React Flow allows.

## Release signing & packaging (macOS)

Follow [`.claude/skills/release-sign-notarize/SKILL.md`](../../.claude/skills/release-sign-notarize/SKILL.md) and [CLAUDE.md](../../CLAUDE.md): Developer ID sign, notarize, staple. Verify **embedded** `webview/dist` is the intended production build (`npm run build` from CI or local release step).

## Regression hooks

- `ctest` from the CMake build directory after engine or FIFO changes.
- `npx tsc -b` and `npm run build` under `webview/` after TS changes.
