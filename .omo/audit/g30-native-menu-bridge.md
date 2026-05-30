# G-30 — native JUCE right-click menu → webview mirror — bridge spike

**Lane:** Wave-0.5 / Task 6 (F5). **Status:** read-only spike, no code written.
**Author:** worker-spike. **Date:** 2026-05-30.
**Feeds →** Task 20 (= D4, G-30 CommandPalette/native-menu mirror, Wave D).

---

## 0. Verdict

> **The native node context-menu content is NOT exposed over the `element*` bridge today.**
> There is **no menu-enumeration bridge fn and no node-operation bridge fns** (duplicate /
> remove / rename / disconnect / replace / enable) — verified by grep over
> `element_webview_host.cpp` (empty result set). The plugin-*add* menu IS already mirrored
> (plugin store w/ favorites+recent), but node *operations* are not.
>
> **The real fork (elevate this, like G-29's transport) = WHERE the mirror renders:**
> - **Target = a hierarchical webview right-click context-menu on blocks → branch 20b**
>   (add a native menu-enumeration + invoke bridge that serializes the real `NodePopupMenu`
>   tree). This is the only branch that can faithfully "mirror layout + content."
> - **Target = node ops folded into the flat Cmd+K `CommandPalette` → branch 20a**
>   (add discrete per-op bridge verbs; the flat list can't express stateful submenus).
>
> **RECOMMENDED: 20b, conditional on the target being a context-menu** (which matches G-30's
> literal ask: "mirror native JUCE right-click menu LAYOUT + content"). Either branch must
> dispatch the **native-modal items** (Rename, Presets, Color, FXB/FXP) back to native — they
> cannot be reproduced in TS. **Glen decision: context-menu (20b) vs Cmd+K verbs (20a).**

---

## 1. Native right-click menu SOURCE — enumeration (the thing to mirror)

The canonical node context menu is **`NodePopupMenu`** (`src/ui/contextmenus.hpp:229-772`).
It is instantiated as the real block right-click menu at **`src/ui/block.cpp:766`**, and
reused by `connectiongrid.cpp:194/212`, `pluginwindow.cpp:150/234`, `nodeeditorview.cpp:121`,
`sessiontreepanel.cpp:422`. The full assembly used for a Block right-click
(`src/ui/block.cpp:762-822`) — i.e. the exact layout/content G-30 must mirror:

| Item / submenu | Source | Notes |
|---|---|---|
| Enable / Disable (toggle) | `contextmenus.hpp:727` (`EnableNodeOp`) | sets `tags::enabled`; **stateful label**. |
| Rename | `contextmenus.hpp:728, 696-717` (`RenameNodeOp`) | **native modal** `AlertWindow`. |
| Disconnect ▸ All / MIDI / Input / Output | `contextmenus.hpp:731-739` (ids `Disconnect`/`DisconnectMidi`/`DisconnectInputs`/`DisconnectOutputs`). |
| Duplicate | `contextmenus.hpp:741` (id `Duplicate`) | disabled for IONode. |
| Remove | `contextmenus.hpp:743` (id `RemoveNode`). |
| Replace ▸ (all known plugins) | `contextmenus.hpp:350-360` + `block.cpp:767` | **dynamic** plugin list; dispatch via `ReplaceNodeMessage` (`block.cpp:817-821`). |
| Ports… | `block.cpp:772` (id 10) | if not MIDI IO/device. |
| Color ▸ | `contextmenus.hpp:320-330` + `block.cpp:776` | **native custom item** `ColourSelector` — cannot render in webview. |
| Display ▸ | `block.cpp:777` (`addDisplaySubmenu`). |
| Options ▸ Mute input ports / Oversample 2x·4x·8x | `contextmenus.hpp:308-348` | **stateful ticks** (`isMutingInputs`, current oversampling). |
| Presets ▸ Save node / Save default / Reset default / Factory Presets / Native (FXB/FXP) / user presets | `contextmenus.hpp:362-419` | **dynamic + native modal** (FileChooser, `PresetManager`). |
| Sources / Destinations ▸ (port connect) | `contextmenus.hpp:258-301` (`SingleConnectOp`) | **dynamic** from live `getPossibleSources/Destinations`. |
| Factory Presets ▸ (programs) | `contextmenus.hpp:421-429` | ticks current program. |

The plugin-**add** menu is **`PluginsPopupMenu`** (`contextmenus.hpp:18-226`): Favorites,
Recently Used, full known list by manufacturer, Unverified submenu — used at
`grapheditorcomponent.cpp:1164` and `connectiongrid.cpp:326`.

## 2. Is it already bridged? — NO (for node ops)

- **No menu-enumeration bridge fn** exists: `grep "element*Menu"` over
  `src/ui/element_webview_host.cpp` → empty.
- **No node-operation bridge fns** for duplicate/remove/rename/disconnect/replace/enable:
  `grep registerFn … (duplicate|remove|rename|disconnect|menu|replace|enable|node)` → empty.
  The webview today has only coarse verbs (e.g. `nativeGraphSetBypass`, `nativeGraphAddPlugin`
  in `nativeGraph.ts`) — bypass ≠ the menu's Enable/Disable (`tags::enabled`).
- **Plugin-add IS effectively mirrored**: `QuickAddPopup.tsx` + `CommandPalette.tsx` read
  `usePluginBrowserStore` (favorites/recent/all) and call `nativeGraphAddPlugin`
  (`QuickAddPopup.tsx:13,203`; `CommandPalette.tsx:288`). So `PluginsPopupMenu` needs **no new
  bridge** — only the node-operations menu does.
- **Current `CommandPalette`** (`CommandPalette.tsx:154-340`) aggregates actions/blocks/
  plugins/scenes/settings from stores — it is **not** a `NodePopupMenu` mirror.

## 3. Branch comparison

| | **20b — native menu-enumeration bridge (RECOMMENDED for context-menu target)** | **20a — discrete TS verbs in flat Cmd+K** |
|---|---|---|
| What | New native `nodeMenuBuild(uuid)→JSON tree` + `nodeMenuInvoke(uuid,itemId)`, reusing `NodePopupMenu` + `createMessageForResultCode` (`contextmenus.hpp:431-498`). | ~8-10 new per-op bridge fns (`nativeGraphDuplicate/Remove/Rename/Disconnect*/Replace/Enable…`) + a TS-authored menu structure. |
| Fidelity to native layout+content | **Exact** (serializes the real menu incl. ticks/gating/dynamic submenus). | **Manual** — TS must replicate structure/labels/ticks → drifts from `contextmenus.hpp`. |
| Dynamic submenus (Presets/Replace/Sources-Destinations/Programs) | handled natively, free. | must re-derive each in TS (heavy, stateful). |
| Native-modal items (Rename/Color/FXB-FXP/preset FileChooser) | dispatched to native — already modal, fine. | **still** must call native (can't reproduce) → 20a doesn't avoid native dispatch anyway. |
| Reusable primitives | menu-only. | per-op verbs reusable by keyboard shortcuts / block hover actions. |
| New C++ churn | one bridge pair + a non-`show()` serialize path on `NodePopupMenu`. | many small fns; no menu refactor. |
| Render fit | hierarchical webview context-menu. | flat fuzzy list. |

**Antithesis (steelman 20a):** if Glen wants node ops *inside Cmd+K* (one keyboard-first
entry point) rather than a separate right-click menu, 20b's submenu tree is awkward to
flatten, and discrete verbs are cleaner + reusable as shortcuts/hover actions. 20a also keeps
the webview pure-web (no native-tree renderer). The cost is permanent manual parity with
`contextmenus.hpp` and re-deriving the stateful submenus — which is exactly where drift bugs
live. Net: 20a wins only if the *target surface is the flat palette*; for a faithful
right-click menu, 20b.

## 4. Contract for the new native (branch 20b) — with the race fixed

```
// Build (message thread): serialize the canonical block-menu assembly (block.cpp:762-782)
//   WITHOUT show(). Returns the menu as a tree.
elementNodeMenuBuild(nodeUuid: string, portId?: string) -> JSON
  { items: MenuItem[] }
  MenuItem = {
    itemId: string,        // STABLE SEMANTIC key (see hazard below) — NOT the volatile 1024+ code
    label: string,
    enabled: boolean,
    ticked: boolean,
    isSeparator?: boolean,
    isHeader?: boolean,
    isNativeModal?: boolean,  // Rename/Color/Preset/FXB — webview shows it, native handles click
    submenu?: MenuItem[]
  }

// Invoke (message thread): perform the chosen item, dispatch via the existing
//   createMessageForResultCode / Message post (block.cpp:792-822 pattern).
elementNodeMenuInvoke(nodeUuid: string, itemId: string) -> boolean
```

**⚠️ Race hazard (must be designed out).** `NodePopupMenu`'s `ResultOp`-backed items
(Rename, presets, Sources/Destinations, connect ops) get **sequential result codes from
1024 in build order** (`contextmenus.hpp:526-527, 746-750`), and `resultMap`/`deleter` are
**instance-scoped**. The build→serialize→user-click→invoke round-trip is async; if node
state changes between build and invoke (a preset added, a connection made elsewhere altering
`getPossibleSources`, enable toggled), the same numeric code maps to a *different* op → wrong
action fires. **Fix (pick one, put in the contract):**
- (a) **Stable semantic itemIds** for the dynamic items (string keys independent of build
  order), resolved server-side at invoke; OR
- (b) **Keep the `NodePopupMenu` instance alive C++-side keyed by `nodeUuid`** between build
  and invoke and dispatch on that *same* instance via `createMessageForResultCode` — no
  rebuild, no remap.
The fixed enum ids (`Duplicate=1`, `RemoveNode`, `Disconnect*` — `contextmenus.hpp:232-241`)
are stable and need no special handling. Native-modal items keep popping their native dialog
on invoke (acceptable — they already do).

## 5. Citation spot-check
- `src/ui/contextmenus.hpp:229` → `class NodePopupMenu : public PopupMenu` OK
- `src/ui/block.cpp:766` → `NodePopupMenu menu (node);` (canonical block right-click) OK
- `src/ui/contextmenus.hpp:746-750` → `addItemInternal` assigns `currentResultOpId` in build order (the race) OK
- grep `element*Menu` in host → empty (no enumeration bridge today) OK

---

## 6. Directive — what D4 (plan Task 20, G-30 mirror) will therefore do

**Task D4 (= plan task 20) will therefore: FIRST get Glen's fork — (i) a hierarchical
webview right-click context-menu on blocks, or (ii) node ops folded into the flat Cmd+K
palette. If (i) [recommended], implement branch 20b: add `elementNodeMenuBuild(nodeUuid)`
(serialize the `block.cpp:762-782` `NodePopupMenu` assembly without `show()`) +
`elementNodeMenuInvoke(nodeUuid, itemId)` (dispatch via the existing
`createMessageForResultCode` path), using STABLE semantic item-ids OR a node-keyed live menu
instance to eliminate the 1024+ build-order race, and render the returned tree as a neu
context-menu — native-modal items (Rename/Color/Presets/FXB) flagged and dispatched back to
native. If (ii), implement branch 20a: add discrete `nativeGraph*` verbs
(Duplicate/Remove/Rename/Disconnect*/Enable/Replace) and surface them as flat Cmd+K commands.
The plugin-add menu needs NO new bridge under either branch (already mirrored via
`usePluginBrowserStore` + `nativeGraphAddPlugin`).**
