# Web UI full port mandate

**Policy:** There is **no** long-term “native only” feature category. Every user-facing capability that exists in classic JUCE chrome must eventually be **reachable from the Web shell** (React + `element_webview_host` bridge), with UX that matches [ELEMENT_UNIFIED_BLUEPRINT.md](ELEMENT_UNIFIED_BLUEPRINT.md).

**What this does *not* ban:** Calling **OS services** from the bridge (e.g. `FileChooser`, future security-scoped picks) triggered by Web actions is fine — the **surface** the user works in is still the Web UI (toolbar buttons, panels, flows), not a separate permanent JUCE-only screen.

**What this bans:** Closing work with “users will use the File menu / Preferences window / floating plugin only” as the **final** answer. Those paths may exist **only** until the Web port ships for that feature.

---

## Port queue (ordered backlog — adjust as product dictates)

Ship in layers; each item ends with **Web UI + bridge**, not classic-only.

| Priority | Area | Classic reference | Direction |
|----------|------|---------------------|-----------|
| P0 | **Preferences** (audio, MIDI, plugins, general, scripting paths) | `preferences`, `DeviceService`, settings | Snapshot + `element*` setters; full **React** forms in `neu` style |
| P0 | **Session tree** (full hierarchy, not only graph switcher) | `sessiontreepanel` | Snapshot + mutations; left or dedicated panel |
| P0 | **Graph import/export .elg** | `SessionService` import/export | Web actions → same service calls (+ chooser or path API) |
| P1 | **Plugin editor in Web** | `presentView`, `PluginWindow` | Embed strategy (OS view / texture / IPC) — **must** land; floating window is a **stopgap** |
| P1 | **MIDI mapping / learn** | `MappingService`, mapping UI | Bridge + React surface |
| P1 | **Lua console / script editor** | `luaconsoleview`, script node editor | Bridge + React (or embedded editor component) |
| P1 | **OSC** (app-level, beyond nodes) | `OscService` | Bridge + React |
| P1 | **Inspector LOG / METERS** | Various | Log stream + meter data over snapshot or events; **no** “use host mixer” as final |
| P2 | **Meter bridge / graph mixer views** | Native views | Port or merge into Perform / inspector per blueprint |
| P2 | **About, updates, splash** | Native dialogs | Web modals or bridge-opened sheets with Web content |

---

## Already bridged (examples — keep extending)

| Action | Entry |
|--------|--------|
| Session new / open / save / save as / recents / active graph | `elementSession*` |
| Graph CRUD, comments, undo/redo, transport, panic, copy/paste | `elementGraph*`, `elementUndo`, … |
| Plugin list, node parameters | `elementGetPluginList`, `elementGetNodeParameters`, `elementSetNodeParameter` |

---

## Tracking

- **Gap list:** [WEBVIEW_PARITY_MATRIX.md](WEBVIEW_PARITY_MATRIX.md) — tag **C** means **port queue**, not “wontfix Web”.  
- **Blueprint vs live UI:** [WEBVIEW_BLUEPRINT_AUDIT_CHECKLIST.md](WEBVIEW_BLUEPRINT_AUDIT_CHECKLIST.md)  
- **QA:** [WEBVIEW_QA.md](WEBVIEW_QA.md)

## Distribution

Notarization / signing are orthogonal; see `.claude/skills/release-sign-notarize/SKILL.md`.
