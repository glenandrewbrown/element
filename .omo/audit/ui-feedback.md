# UI Feedback Sheet — walk the Storybook, drop notes per component

**Library (open side-by-side):** https://6a1a050dd7e83b33c7e53b0d-eptucqspsl.chromatic.com/
**Local (interactive + Measure/Outline for px):** `cd webview && npm run storybook` → http://localhost:6006

## How to use

Walk the sidebar top→bottom. For anything off, write in the **Your feedback** column:
`<state> → what's wrong → what you want`. Leave blank = looks good. Paste edited sheet back to me
(or just message batches). I fill **Status** as I fix and re-publish.

> Note: Chromatic's click-to-comment lives in **UI Review** (pull-request based) — not on this
> standalone baseline. So this sheet (or chat) is the capture channel until we flip on UI Review.

---

## Canvas (10)

| Component           | States                                                                                | Your feedback | Status |
| ------------------- | ------------------------------------------------------------------------------------- | ------------- | ------ |
| Block               | Generator, Modifier, Logic, Bypassed, Errored, Container, CategoryRow                 |               |        |
| BlockEmbed          | Generator, Modifier, Logic                                                            |               |        |
| BlockExpandedHeight | ExpandedModifier (the W5a height fix)                                                 |               |        |
| Cable               | Audio, Midi, Value, SurroundSixChannel, Sidechain, ActiveWithSignal, WirelessBusBadge |               |        |
| CommandPalette      | Open, EmptyResults                                                                    |               |        |
| CommentFrame        | Blue, Orange, Teal, Unlabeled                                                         |               |        |
| EdgeContextMenu     | Wired, Wireless                                                                       |               |        |
| NodeContextMenu     | Default, BypassedAndMuted                                                             |               |        |
| QuickAddPopup       | Open, NoFavorites, NoPluginsScanned                                                   |               |        |
| ScriptEditor        | Default, WithCloseButton                                                              |               |        |

## Layout (19)

| Component        | States                                                                                       | Your feedback | Status                                    |
| ---------------- | -------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------- |
| AboutModal       | Idle, WithBackdrop                                                                           |               |                                           |
| BlockTabStrip    | MultipleTabs, SingleTab, MiddleTabActive, NoTabs                                             |               |                                           |
| Breadcrumb       | RootOnly, TwoLevels, ThreeLevels, DeepNesting, LongNames                                     |               |                                           |
| BusInspector     | Empty, SingleBus, MultipleBuses, OrphanEndpoint                                              |               |                                           |
| ConnectionEditor | Populated, Empty, AudioOnly, MidiOnly                                                        |               |                                           |
| DashboardBuilder | Populated, EditingMode, Empty, EmptyEditing                                                  |               |                                           |
| InspectorHub     | NothingSelected, ModifierSelected, GeneratorSelected, BypassedBlockSelected, EmptyGraph      |               |                                           |
| LiveHealth       | Nominal, Warning, Critical, Empty                                                            |               |                                           |
| MacroDashboard   | Populated, MapModeActive, KnobsOnly, Empty                                                   |               |                                           |
| NeuPromptModal   | Open, EmptyInput, NoDescription, Closed, Interactive                                         |               |                                           |
| PreferencesModal | Populated, Empty, MidiLearning                                                               |               |                                           |
| QuickAccess      | WithBlocks, Empty, HighCpu                                                                   |               |                                           |
| SceneLauncher    | Populated, Empty, SingleScene                                                                |               |                                           |
| SessionTree      | WithGraphs, Empty, SingleGraph, DirtyFile                                                    |               |                                           |
| SnippetShelf     | WithSnippets, Empty, SingleSnippet, ManySnippets                                             |               |                                           |
| StatusBar        | Running, Stopped, HighCpu, MediumCpu, IsPlayingFallback, DefaultDevice                       |               | (F-04: SAMPLE field shows 1.1.0 — queued) |
| Toolbar          | EditMode, EditModeMultiBoard, EditModeNarrow, PerformMode, PerformModeIdle, EditModeUntitled |               |                                           |
| ToolPalette      | Populated, Empty, PluginsNoExtras, HighCpu                                                   |               |                                           |
| VirtualKeyboard  | Default, FullVelocity, SoftVelocity                                                          |               |                                           |

## Neu primitives (10)

| Component  | States                                                                               | Your feedback | Status |
| ---------- | ------------------------------------------------------------------------------------ | ------------- | ------ |
| EmptyState | NoPlugins, NoConnections, NoMidi                                                     |               |        |
| Icon       | Default, UnknownFallback, AllIcons, ToneMatrix, SizeMatrix, UnknownFallbackGrid      |               |        |
| NeuBadge   | Default, Orange, Teal, Purple, Grey, ColorMatrix                                     |               |        |
| NeuButton  | Default, Active, Panic, Small, VariantMatrix                                         |               |        |
| NeuDisplay | Default, EmptyDisplay, NumericReadout, VariantMatrix                                 |               |        |
| NeuFader   | Default, Vertical, Orange, VariantMatrix, Interactive                                |               |        |
| NeuInput   | Default, WithValue, Placeholder, VariantMatrix, Interactive                          |               |        |
| NeuKnob    | Default, Teal, Orange, SizeMatrix, Interactive                                       |               |        |
| NeuToggle  | Default, ActiveBlue, ActiveOrange, ActiveTeal, VariantMatrix, Interactive            |               |        |
| Skeleton   | Default, TextVariant, CircleVariant, VariantMatrix, CardSkeleton, PluginListSkeleton |               |        |

---

**Not yet storied (no Chromatic snapshot):** `GraphCanvas` (full canvas), `AppShell` (whole-shell layout).
Tell me if you want these added so the holistic layouts are reviewable too.
