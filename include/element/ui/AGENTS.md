<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# include/element/ui/ — Public UI shell headers

Public C++ headers for the application UI layer. Consumers link against these
to subclass or host Element's UI shells. Implementation lives in `src/ui/`;
these headers expose only the stable contract. All types are in namespace
`element`.

## Key Files

| Header | Role |
|--------|------|
| `navigation.hpp` | `NavigationPanel` — icon sidebar with 4 panels (Session, Browse, Inspector, Editor). Access panels via typed accessors (`getSessionTreePanel()` etc.), NOT `findPanel<T>()`. `NavigationConcertinaPanel` is a backward-compat alias. |
| `content.hpp` | `Content` — abstract base class for the application UI shell; owns the root component tree |
| `web_content.hpp` | `WebContent` — `Content` variant that hosts the React/Tailwind webview via `WebBrowserComponent` |
| `standard.hpp` | `StandardContent` — legacy JUCE-native content shell (pre-webview) |
| `element_webview_host.hpp` | `ElementWebviewHost` — native JUCE component bridging `Context` to the webview; owns the `window.__JUCE__` bridge lifecycle |
| `mainwindow.hpp` | `MainWindow` — top-level `DocumentWindow`; owns a `Content` instance |
| `nodeeditor.hpp` | `NodeEditor` — base class for per-node plugin editor windows |
| `grapheditor.hpp` | `GraphNodeEditor` — `NodeEditor` subclass for graph-type nodes |
| `about.hpp` | `AboutComponent` — about dialog |
| `commands.hpp` | Application command IDs (`CommandIDs` enum) |
| `designer.hpp` | `Designer` — live layout designer for development |
| `decibelscale.hpp` | `DecibelScale` — dB ruler component used in meters |
| `meterbridge.hpp` | `MeterBridge` — multi-channel level meter bridge panel |
| `menumodels.hpp` | Menu model helpers |
| `popups.hpp` | Popup/dialog helpers |
| `preferences.hpp` | Preferences dialog |
| `simplemeter.hpp` | `SimpleMeter` — single-channel level meter component |
| `style.hpp` | `Style` — JUCE `LookAndFeel` subclass for Element's visual theme |
| `updater.hpp` | `Updater` — application update checker UI |
| `view.hpp` | `View` — generic resizable view base |

## For AI Agents

- Headers here are the **public contract** — `src/ui/*.hpp` files are
  implementation-private even if named similarly.
- `NavigationPanel` replaced the old `ConcertinaPanel` accordion; do not
  re-introduce accordion-style panel management.
- `ElementWebviewHost` owns bridge lifetime; do not call `window.__JUCE__`
  setup from outside this component.
- No `using namespace juce;` in any header here — qualify all JUCE types.
