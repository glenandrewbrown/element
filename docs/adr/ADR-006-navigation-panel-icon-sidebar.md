# ADR-006: NavigationPanel Icon Sidebar over ConcertinaPanel Accordion

**Status**: accepted
**Date**: 2026-05-24
**Deciders**: ui
**Tags**: navigation, layout, sidebar

## Context

The original sidebar used a JUCE `ConcertinaPanel` accordion stacking Session tree, Plugins, Sessions browser, Inspector, Data Path, and Properties. The accordion wasted vertical space on collapsed-panel headers, required two clicks to switch panel, and could not be addressed deterministically from automation (`findPanel<T>()` was string-typed and brittle). The Instrument Paradigm requires single-keystroke panel switching and consistent affordances.

## Decision

Replace `ConcertinaPanel` with **`NavigationPanel`** — an icon-only sidebar exposing exactly four panels: Session, Browse, Inspector, Editor. Bindings:

- `Cmd+1` → Session tree
- `Cmd+2` → Browse (tabbed Plugins + Sessions wrapper, `BrowsePanel`)
- `Cmd+3` → Inspector (tabbed Node + Graph properties, `InspectorPanel`)
- `Cmd+4` → Editor

Backward-compat: `NavigationConcertinaPanel` remains as an alias so existing call sites continue to compile during transition.

Panel access uses **typed accessors** (`nav->getSessionTreePanel()`) — not the legacy `findPanel<T>()`.

`DataPathTreeComponent` is removed from the sidebar; data-path access moves to the File menu.

## Consequences

### Positive
- One keystroke to any panel.
- Each panel renders at full sidebar height — denser information.
- Automation can resolve panels through typed accessors without string lookups.
- AX tree depth is reduced; UI-verification suites under `tools/automation/` are simpler to reason about.

### Negative
- Loses the "many things visible at once" affordance of the accordion. Users who relied on simultaneously visible Plugins + Sessions must use the tabbed `BrowsePanel`.
- Adds two new wrapper classes (`BrowsePanel`, `InspectorPanel`) to maintain.

### Neutral
- Inspector auto-activates on node selection.

## Links
- `include/element/ui/navigation.hpp`
- `src/ui/browsepanel.hpp`
- `src/ui/inspectorpanel.hpp`
- ADR-007 (gesture/keyboard model)

**Related**: ADR-007
