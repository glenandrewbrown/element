<!-- Parent: ../AGENTS.md -->
<!-- Updated: 2026-06-06 -->

# src/ui/ — Hybrid UI (Web canonical + Standard fallback)

Largest single source dir (~150 files). Two parallel UI shells. **Web is canonical** (V3.0 Instrument paradigm); **Standard is a stopgap**. See [`docs/WEBVIEW_HYBRID_POLICY.md`](../../docs/WEBVIEW_HYBRID_POLICY.md).

## Shell split

| Shell | Public header | Implementation | When loaded |
|---|---|---|---|
| `WebContent` (V3 canonical) | `../../include/element/ui/web_content.hpp` | `web_content.cpp` | Default |
| `StandardContent` (classic JUCE) | `../../include/element/ui/standard.hpp` | `standard.cpp` | When env `ELEMENT_STANDARD_CONTENT=1` |

Both inherit from `Content` (`../../include/element/ui/content.hpp`, impl `content.cpp`).

## C++ ↔ JS bridge

`element_webview_host.{cpp,hpp}` wraps `juce::WebBrowserComponent` and registers native functions on `window.__JUCE__.backend`:

- Names follow `element*` prefix: `elementSession*`, `elementGraph*`, `elementGetPluginList`, `elementSetNodeParameter`, `elementUndo`, …
- Webview consumes via [`webview/src/bridge/juceBackend.ts`](../../webview/src/bridge/juceBackend.ts) → `invokeNativeFunction(name, ...)`.
- Bundle embedding: `cmake/element_webview_dist.h.in` bakes `webview/dist/` into `generated_include/` at CMake configure time.
- **CV value feed (Wave-0):** The 60Hz sync loop in `element_webview_host.cpp` reads `Processor::getOutputCV()` last-sample latches and sets a `"v"` property on each CV-typed cable entry before pushing the graph state to the webview. Audio/MIDI cables do not carry `"v"`. See `cableCvValueForArc()` for the lookup path.

## Classic UI categories (StandardContent path)

- **Views** (full-pane content): `grapheditorview`, `graphmixerview`, `graphsettingsview`, `controllersview`, `controllermapsview`, `audioiopanelview`
- **Panels** (sidebar): `browsepanel`, `datapathbrowser`, `filetreeview`
- **Dialogs**: `aboutscreen`, `audiodeviceselector`, `commentboxcomponent`
- **Graph editor**: `grapheditorcomponent`, `graphnodeeditor`, `connectiongrid`, `block`
- **Primitives**: `buttons`, `decibelscale`, `filecombobox`, `channelstrip`, `breadcrumb`, `console`

## Accessibility

UI exposed via the JUCE Accessibility API → asserted by the [`verify-element-ui`](../../.claude/skills/verify-element-ui/SKILL.md) skill (deterministic AX assertions, no screenshots). Tree inspection via [`inspect-ax-tree`](../../.claude/skills/inspect-ax-tree/SKILL.md).

## Conventions

- All public UI types live under `include/element/ui/*.hpp`; `src/ui/*` is implementation only.
- `viewhelpers.hpp::postMessageFor()` deletes the message immediately — **don't** keep references after the call.
- `GuiService` methods are main-thread-only — `WARNING` flagged in `include/element/ui.hpp`.
- `Molecule::insertIntoGraph()` is `@deprecated` — use `GraphEditorComponent::insertMolecule()` (see `moleculemanager.hpp`).

## Anti-patterns

- New feature in `StandardContent` only, with no port plan for `WebContent` — see hybrid policy.
- Modifying `webview/dist/` directly — always rebuild from `webview/src/`.
- New native bridge function without a matching TS wrapper in `webview/src/bridge/`.
- Long-running work on the message thread — UI freezes; dispatch via `juce::Thread` or async.
- Forgetting Accessibility properties on new components — fails `verify-element-ui` assertions.
