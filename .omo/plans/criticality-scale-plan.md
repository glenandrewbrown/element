# Criticality Scale — Plugin Scan / Paths / Format-toggles + docked Inspector & Plugin Browser

**Status:** plan (read-only audit; no code edited)
**Date:** 2026-05-31
**Author:** workflow-subagent (criticality-scale planner)
**Scope:** the #1 native gap — plugin **scan / rescan / search-paths / format-toggles** ("no app
without it") — plus the two consumers locked to it: **Plugin Browser** (verdict #5) and the docked
**Inspector** (verdict #6). Build spec = `.omo/bakeoff/VERDICTS.md`; method = `.omo/plans/mvp-bakeoff-plan.md`;
objective = `.omo/HORIZON-v3-ui.md`. Design system = `.nodeblock-v3` in `webview/src/index.css`,
following the reference pattern in `webview/src/components/canvas/Block.tsx`.

> **Build constraint reminder:** other agents are editing `src/**`, `webview/**`, `include/**`,
> CMake concurrently. This file is a plan only. The C++ additions below all live in **one file**
> (`src/ui/element_webview_host.cpp` + its header `include/element/ui/element_webview_host.hpp`) to
> minimise overlap; the React additions are new files + edits to 3 existing components.

---

## 0. Headline — what already EXISTS vs what must be ADDED

### Already exists (C++ engine / PluginManager — NO new engine code)
Grounded in `include/element/plugins.hpp` and `src/pluginmanager.cpp`:

| Capability | Existing API | Location |
|---|---|---|
| Full out-of-process scan (all formats) | `PluginManager::scanAudioPlugins(StringArray formats={})` | plugins.hpp:82, pluginmanager.cpp:1273 |
| Scan one/many formats | `PluginScanner::scanForAudioPlugins(String\|StringArray)` | plugins.hpp:171-174 |
| **Quick scan** (discover w/o validating) | `PluginScanner::quickScanForPlugins(StringArray)` | plugins.hpp:179 |
| Cancel in-flight scan | `PluginScanner::cancel()` | plugins.hpp:182 |
| Is-scanning flag | `PluginManager::isScanningAudioPlugins()` | plugins.hpp:85, pluginmanager.cpp:1072 |
| Currently-scanned name (progress text) | `PluginManager::getCurrentlyScannedPluginName()` | plugins.hpp:89, pluginmanager.cpp:1286 |
| Default search path per format | `PluginManager::defaultSearchPath(StringRef format)` | plugins.hpp:70, pluginmanager.cpp:1016 |
| Persist / restore known list | `saveUserPlugins` / `restoreUserPlugins(ApplicationProperties&)` | plugins.hpp:95-99 |
| Remove a plugin type from list | `KnownPluginList::removeType(...)` (already used) | pluginmanager.cpp:1301,1313 |
| Scan-finished broadcast | `PluginManager : public juce::ChangeBroadcaster` → `sendChangeMessage()` | plugins.hpp:22, pluginmanager.cpp:1332 |
| Per-format last search path (static) | `PluginListComponent::getLastSearchPath/setLastSearchPath(PropertiesFile&, AudioPluginFormat&, FileSearchPath)` | pluginmanagercomponent.hpp:54-65 |
| Enabled-formats persistence | `Settings::pluginFormatsKey` string in the user `PropertiesFile`; read at startup by `addDefaultFormats()` | settings.hpp:25, settings.cpp:15, preferences.cpp:218-239,330 |
| Sandbox mode persistence | `Settings::getPluginSandboxMode/setPluginSandboxMode` | preferences.cpp:258,306 |

### Already exists (bridge → Plugin Browser data path)
- `elementGetPluginList` native fn returns a **structured `var`** (`buildPluginListJson()`,
  element_webview_host.cpp:905-917, 4432-4466) with `plugins[]{name,descriptiveName,manufacturer,
  version,format,category,identifier}`, `favoriteIdentifiers[]`, `recentIdentifiers[]`.
- `webview/src/stores/usePluginBrowserStore.ts` parses that (object-or-string) and infers
  `blockCategory`. `webview/src/components/layout/ToolPalette.tsx` renders it (current Browser).
- `nativeGraphAddPlugin(identifier)` inserts a plugin (nativeGraph.ts:4).

### Already exists (bridge → Inspector data path — Inspector is NOT blocked on the scan gap)
- Params: `elementGetNodeParameters` / `elementSetNodeParameter` (host.cpp:919-943, 4468+;
  `nativeGetNodeParameters`/`nativeSetNodeParameter`, nativeGraph.ts:278-305).
- A/B + presets: `elementPresetSnapshot/Swap/Save/Load/List` (host.cpp:3428-3707; nativeGraph.ts:425-512).
- Embedded plugin window: `elementPluginEditorOpen/Close/SetBounds/Float` (host.cpp:2122-2156;
  `webview/src/bridge/nativePluginEditor.ts`).
- Per-block note: `elementGraphSetNodeNote` (nativeGraph.ts:174).
- Live param deltas: `window.__elementNative.onParameterUpdate` (useJuceBridge.ts:405).
- Current host shell: `webview/src/components/layout/InspectorHub.tsx` (already wired to all of the above).

### Must be ADDED — the gap (all thin wrappers over the table above)
1. **C++/bridge:** 6 new native pull-functions + 1 host→JS push channel (scan progress/finished).
2. **C++/bridge:** the host must drive scan-progress to JS. Use the **existing `juce::Timer`**
   (host already inherits `private juce::Timer`, header line 30) — poll
   `isScanningAudioPlugins()` + `getCurrentlyScannedPluginName()` and push. **Do NOT add a
   `ChangeListener` base** (smaller diff, avoids a header churn that collides with concurrent C++
   work). Alternative (subscribing to the `ChangeBroadcaster`) noted but not chosen.
3. **React:** new `nativePluginScan.ts` bridge module + `useScanStore.ts` + `onPluginList` /
   `onPluginScanProgress` receivers in `useJuceBridge.ts`.
4. **React UI:** rebuild ToolPalette to verdict #5 (mockup search-first list + filter chips on your
   structure + the scan/rescan/paths controls); add a **Plugins** tab to PreferencesModal (verdict
   #33: paths + format toggles + scan trigger); reskin InspectorHub to the mockup docked shell
   (verdict #6).

**Only two items were genuinely uncertain and are now resolved by file evidence:** format-toggle
persistence **exists** (`Settings::pluginFormatsKey`, restart-gated) — it is *not* net-new; and
remove/clear-list **exists** (`KnownPluginList::removeType`). Both are thin wrappers.

---

## 1. C++ / bridge additions (EXACT — all in `element_webview_host.cpp`)

All new pull-handlers MUST follow the established **structured-var** rule (return
`JSON::parse(buildXJson())` via `postCompletion`, never a pre-serialised JSON string — the
O(n²) `String::replace` quote-escape hang documented at host.cpp:908-916). Registration uses the
existing `registerFn(Identifier, lambda)` helper (host.cpp:871).

### 1.1 New native pull-functions (register in the ctor next to `elementGetPluginList`)

```cpp
// Trigger a (re)scan. args: [formats:String[] (empty = all), quick:bool].
// Wraps PluginManager::scanAudioPlugins() / PluginScanner::quickScanForPlugins().
registerFn (Identifier ("elementPluginScanStart"),
    [this, postCompletion] (const Array<var>& a, auto completion) {
        StringArray formats;  bool quick = false;
        if (a.size() > 0 && a[0].isArray())
            for (auto& f : *a[0].getArray()) formats.add (f.toString());
        if (a.size() > 1) quick = (bool) a[1];
        const bool ok = startPluginScan (formats, quick);   // new private helper
        postCompletion (completion, ok);
    });

// Cancel an in-flight scan. Wraps PluginScanner::cancel() via the bg scanner.
registerFn (Identifier ("elementPluginScanCancel"),
    [this, postCompletion] (const Array<var>&, auto completion) {
        postCompletion (completion, cancelPluginScan());
    });

// Live scan status (also pushed; this is the pull fallback / initial state).
// Returns structured var { scanning:bool, currentName:String }.
registerFn (Identifier ("elementPluginScanStatus"),
    [this, postCompletion] (const Array<var>&, auto completion) {
        postCompletion (completion, JSON::parse (buildScanStatusJson()));
    });

// Get per-format search paths + enabled-format flags + sandbox mode.
// Returns structured var:
//   { formats:[ { name, enabled:bool, paths:String[], defaultPaths:String[] } ],
//     sandboxMode:int }
registerFn (Identifier ("elementPluginGetScanConfig"),
    [this, postCompletion] (const Array<var>&, auto completion) {
        postCompletion (completion, JSON::parse (buildScanConfigJson()));
    });

// Set search paths for ONE format. args: [format:String, paths:String[]].
// Wraps PluginListComponent::setLastSearchPath (props, fmt, FileSearchPath).
registerFn (Identifier ("elementPluginSetSearchPath"),
    [this, postCompletion] (const Array<var>& a, auto completion) {
        bool ok = false;
        if (a.size() >= 2) ok = setFormatSearchPath (a[0].toString(), a[1]);
        postCompletion (completion, ok);
    });

// Enable/disable a format (restart-gated, like the native toggles).
// Persists to Settings::pluginFormatsKey. args: [format:String, enabled:bool].
registerFn (Identifier ("elementPluginSetFormatEnabled"),
    [this, postCompletion] (const Array<var>& a, auto completion) {
        bool ok = false;
        if (a.size() >= 2) ok = setFormatEnabled (a[0].toString(), (bool) a[1]);
        postCompletion (completion, ok);
    });

// Optional (MVP-): remove one plugin from the known list. arg: [identifier:String].
// Wraps KnownPluginList::removeType. Returns bool.
registerFn (Identifier ("elementPluginRemove"),
    [this, postCompletion] (const Array<var>& a, auto completion) {
        bool ok = (a.size() >= 1) && removeKnownPlugin (a[0].toString());
        postCompletion (completion, ok);
    });
```

### 1.2 New private host members (header + cpp; header already has `juce::Timer`)

```cpp
// in include/element/ui/element_webview_host.hpp (private section)
bool   startPluginScan (const juce::StringArray& formats, bool quick);
bool   cancelPluginScan();
bool   setFormatSearchPath (const juce::String& format, const juce::var& paths);
bool   setFormatEnabled (const juce::String& format, bool enabled);
bool   removeKnownPlugin (const juce::String& identifier);
juce::String buildScanStatusJson() const;     // { scanning, currentName }
juce::String buildScanConfigJson() const;      // formats[] + sandboxMode
void   pushPluginScanProgress();               // called from timerCallback when scanning
void   pushPluginList();                        // re-push full list on scan-finished
// transient scan-tracking so the timer can detect the scanning→done edge:
bool   wasScanningLastTick = false;
```

### 1.3 Host → JS push (scan progress + list refresh) — reuse the `evalInBrowser` pattern

The host already pushes unsolicited state to JS via
`evalInBrowser("window.__elementNative.onGraphState(" + json + ");")` (host.cpp:4096) and
`onMetering` (host.cpp:4104). Add two analogous pushes, driven from the **existing
`timerCallback`**. **Verified:** the host calls `startTimerHz(60)` (host.cpp:3775) — the timer ticks
continuously at 60 Hz regardless of graph activity (it already drives metering, cable levels, log
history, and the debounced graph push), so a boot-time scan with no graph activity still gets
progress pushes. No `startTimer`/`stopTimer` lifecycle management is needed.

```cpp
// inside ElementWebViewHost::timerCallback() (existing), append:
const bool scanning = context.plugins().isScanningAudioPlugins();
if (scanning)
    pushPluginScanProgress();                       // onPluginScanProgress(...)
if (wasScanningLastTick && ! scanning) {            // scanning → finished edge
    pushPluginList();                               // onPluginList(<full list var>)
    pushPluginScanProgress();                       // final {scanning:false}
}
wasScanningLastTick = scanning;

// helpers:
void ElementWebViewHost::pushPluginScanProgress() {
    evalInBrowser ("window.__elementNative && window.__elementNative.onPluginScanProgress("
                   + buildScanStatusJson() + ");");
}
void ElementWebViewHost::pushPluginList() {
    // buildPluginListJson() already exists (host.cpp:4432). Structured JSON, O(n).
    evalInBrowser ("window.__elementNative && window.__elementNative.onPluginList("
                   + buildPluginListJson() + ");");
}
```

> Progress text source = `getCurrentlyScannedPluginName()`. There is **no numeric 0..1 progress**
> on the public PluginManager API (the `PluginScanner::Listener::audioPluginScanProgress(float)`
> exists internally but isn't surfaced). MVP shows an **indeterminate** spinner + the rolling
> plugin name; do NOT fabricate a percentage. (If a determinate bar is wanted later, surface the
> coordinator's progress through a new `PluginManager` getter — out of MVP scope, flag for the C++ lane.)

### 1.4 Helper bodies (grounded references)

> **⚠️ Scanner-identity fact (verified, pluginmanager.cpp).** There are **two distinct scanner
> objects** in `PluginManager`. `getBackgroundAudioPluginScanner()`, `isScanningAudioPlugins()`,
> and `cancel` all operate on `priv->scanner` (pluginmanager.cpp:1058-1074). But
> `PluginManager::scanAudioPlugins()` **news up a SEPARATE transient scanner** inside `Private`
> (pluginmanager.cpp:896,918) — a *different* instance that `isScanningAudioPlugins()` does NOT
> observe and `cancel` does NOT reach. **Therefore route the full scan through the SAME
> `getBackgroundAudioPluginScanner()` instance — do NOT call `PluginManager::scanAudioPlugins()`** —
> or cancel becomes a no-op and the `wasScanningLastTick` finish-edge never fires.

- `startPluginScan`: `auto* s = context.plugins().getBackgroundAudioPluginScanner();` (plugins.hpp:79);
  gate on `! s->isScanning()` (return false if already scanning); then
  `quick ? s->quickScanForPlugins(formats) : s->scanForAudioPlugins(formats)` (plugins.hpp:171-179).
  Build the default-all `formats` StringArray host-side if empty (mirror pluginmanager.cpp:909-915:
  every format whose name != "Element" and `canScanForPlugins()`, plus "LV2").
- `cancelPluginScan`: `context.plugins().getBackgroundAudioPluginScanner()->cancel()` (plugins.hpp:79,182).
  Because start also used the bg scanner, this now cancels the *same* object that `isScanningAudioPlugins()` reads.
- `buildScanConfigJson`: for each format in `getAudioPluginFormats()` (plugins.hpp:47) emit
  `name`; `enabled` = membership test against the `Settings::pluginFormatsKey` CSV; `defaultPaths`
  = `defaultSearchPath(name)` split to strings; `paths` = `PluginListComponent::getLastSearchPath
  (*props, *fmt)` (the host already holds `props`, see `setPropertiesFile`, plugins.hpp:118).
- `setFormatSearchPath`: build `FileSearchPath` from the var array → `setLastSearchPath(*props,*fmt,sp)`.
- `setFormatEnabled`: read/write the `Settings::pluginFormatsKey` value via
  `context.settings().getUserSettings()`, add/remove `format`, `saveIfNeeded()`. **Mirror the native
  `writeSetting`/`restoreSetting` storage format exactly** (preferences.cpp:296-330) — do not assume
  CSV vs XML string-array; copy whatever those use. **Restart-gated**
  — the bridge response should carry that note to the UI (return `true` = persisted, UI shows
  "applies on restart"), matching `formatNotice` (preferences.cpp:223).
- `removeKnownPlugin`: look up by identifier in `getKnownPlugins()`, `removeType`, then `pushPluginList()`.

---

## 2. Bridge (TypeScript) additions

### 2.1 New module `webview/src/bridge/nativePluginScan.ts`
Follows the exact `invokeElementNative(name, args)` + `logBridgeError` pattern of nativeGraph.ts /
nativePrefs.ts:

```ts
import { invokeElementNative } from "./juceBackend";
import { logBridgeError } from "./bridgeError";

export type ScanFormatConfig = {
  name: string; enabled: boolean; paths: string[]; defaultPaths: string[];
};
export type ScanConfig = { formats: ScanFormatConfig[]; sandboxMode: number };
export type ScanStatus = { scanning: boolean; currentName: string };

export async function nativePluginScanStart(formats: string[] = [], quick = false): Promise<boolean> {
  const r = await invokeElementNative("elementPluginScanStart", [formats, quick]);
  return r === true;
}
export async function nativePluginScanCancel(): Promise<boolean> {
  const r = await invokeElementNative("elementPluginScanCancel", []);
  return r === true;
}
export async function nativePluginScanStatus(): Promise<ScanStatus> {
  const r = await invokeElementNative("elementPluginScanStatus", []);
  try { const o = typeof r === "string" ? JSON.parse(r) : r;
    return { scanning: !!o?.scanning, currentName: String(o?.currentName ?? "") };
  } catch (e) { logBridgeError("nativePluginScanStatus.parse", e); return { scanning:false, currentName:"" }; }
}
export async function nativePluginGetScanConfig(): Promise<ScanConfig> { /* parse → {formats,sandboxMode} */ }
export async function nativePluginSetSearchPath(format: string, paths: string[]): Promise<boolean> { /* … */ }
export async function nativePluginSetFormatEnabled(format: string, enabled: boolean): Promise<boolean> { /* … */ }
export async function nativePluginRemove(identifier: string): Promise<boolean> { /* … */ }
```
Add unit tests under `webview/src/bridge/__tests__/nativePluginScan.test.ts` mirroring the existing
`nativeGraph.test.ts` / `nativePrefs.test.ts` invoke-shape assertions.

### 2.2 Push receivers in `webview/src/hooks/useJuceBridge.ts`
Extend `ElementNativeHooks` (line 397) + register inside the `window.__elementNative = {...}` block
(line 424), same pattern as `onGraphState`/`onCableLevels`:

```ts
// add to ElementNativeHooks:
onPluginList?: (payload: unknown) => void;            // full list re-push after scan
onPluginScanProgress?: (status: { scanning: boolean; currentName: string }) => void;

// inside window.__elementNative = { ...prev, ... }:
onPluginList: (payload) => {
  prev.onPluginList?.(payload);
  // reuse usePluginBrowserStore's parser: feed the same object/string it already accepts
  usePluginBrowserStore.getState().applyListPayload(payload);   // small new action mirroring refresh()'s body
},
onPluginScanProgress: (status) => {
  prev.onPluginScanProgress?.(status);
  if (status && typeof status === "object")
    useScanStore.getState().setStatus(!!status.scanning, String(status.currentName ?? ""));
},
```
> `usePluginBrowserStore.refresh()` (store lines 55-113) currently both *fetches* and *parses*.
> Refactor the parse half into `applyListPayload(payload)` so the push path and the pull path share
> it (no logic duplication; keeps the structured-var contract in one place).

### 2.3 New store `webview/src/stores/useScanStore.ts`
Minimal Zustand store (mirrors `useEngineSnapshotStore` shape):
```ts
interface ScanState {
  scanning: boolean; currentName: string; config: ScanConfig | null;
  setStatus: (scanning: boolean, currentName: string) => void;
  start: (formats?: string[], quick?: boolean) => Promise<void>;   // calls nativePluginScanStart
  cancel: () => Promise<void>;
  loadConfig: () => Promise<void>;                                  // nativePluginGetScanConfig
  setSearchPath: (fmt: string, paths: string[]) => Promise<void>;
  setFormatEnabled: (fmt: string, on: boolean) => Promise<void>;
}
```
On scan-finished the host pushes `onPluginList` → `usePluginBrowserStore` updates → Browser list
re-renders automatically; `useScanStore` just clears `scanning`.

---

## 3. React UI build (`.nodeblock-v3` system + mockup parity)

**Reference pattern (mandatory):** `webview/src/components/canvas/Block.tsx` — a *faithful port* of
the mockup `NodeBlock` on the scoped CSS in `index.css` (`.nodeblock-v3` carries the HSL tokens
`--cat-instrument/midifx/audiofx/modulator`, `--sig-audio/midi/value`, `--status-ok/warn/clip`;
helper classes `neu-sculpt` / `neu-sculpt-hover` / `port-well` / `neu-glow-*`). Every new surface
below uses the same token + `neu-sculpt` chassis vocabulary, NOT ad-hoc Tailwind colours.

### 3.1 Plugin Browser — verdict #5 ("Merge — mockup list + your structure")
**Target:** `webview/src/components/layout/ToolPalette.tsx` (edit in place).
**Mockup parity source:** `/Volumes/Projects/Development_Projects/Github_Repos/mindful-studio/src/components/ToolPalette.tsx`
(search-first flat list; `Search` icon input; `getFunctionMeta`/`ALL_FUNCTION_GROUPS` filter chips;
favourites `Star`; collapsible function-group sections; `categoryVar` map of `--cat-*` tokens).

Build:
1. **Adopt the mockup's search-first flat list + category/function-group filter chips** (its
   `activeGroup`, `expanded`, `favorites` model) — but feed it the **real** `usePluginBrowserStore`
   plugins (NOT the mockup's hard-coded `allPlugins`). Element already has the shape/scaffold
   (category shape components, `usePluginBrowserStore`, `nativeGraphAddPlugin`,
   `nativeMoleculeInsert`) — keep your Plugins/Projects tabs, favourites, recents, molecules, usage.
2. Restyle rows to the mockup look on `.nodeblock-v3` tokens (`--cat-*` accent per row; `neu-sculpt`
   hover). Keep your format badge (NeuBadge — verdict #13 "keep yours").
3. **Add the scan controls** (the #1 native gap) at the panel header/footer:
   - "Rescan" button → `useScanStore.start([], false)`; "Quick scan" → `start([], true)`.
   - Inline **scan status row**: when `useScanStore().scanning`, show indeterminate
     spinner + `currentName` (NeuSkeleton shimmer acceptable — verdict #17). "Cancel" → `cancel()`.
   - Empty-list state (0 plugins, not scanning) uses mockup `NeuEmptyState` (verdict #16) with a
     primary "Scan for plugins" CTA → first-run path.
4. A "Manage paths…" link opens the Preferences → Plugins tab (§3.2) via the existing
   `EV_OPEN_PREFERENCES` event (already imported in ToolPalette.tsx).

### 3.2 Preferences → Plugins tab — verdict #33 (paths + format toggles + scan)
**Target:** `webview/src/components/layout/PreferencesModal.tsx` (add a section/tab; it already uses
staged-local-then-Apply `<section>` blocks, lines 91-345).
Build a **Plugins** section housing the native gaps (verdict #33 explicitly lists "plugin
scan/paths/format-toggles" here):
- **Format toggles:** one `NeuToggle` (verdict #9 mockup green toggle) per format from
  `useScanStore().config.formats`, bound to `setFormatEnabled`. Show the **"applies on restart"**
  note (mirrors native `formatNotice`).
- **Search paths:** per format, an editable path list (add/remove rows) → `setSearchPath`; a
  "Reset to default" using `defaultPaths` from the config payload.
- **Scan actions:** "Scan all" / "Quick scan" / "Cancel" wired to `useScanStore`, with the same
  status row as the Browser.
- Sandbox mode select (existing `Settings::getPluginSandboxMode`) can be surfaced here too (optional,
  config payload already carries `sandboxMode`).
Reuse the mockup Preferences tabbed shell (verdict #33) — Appearance/Audio/MIDI/Shortcuts/**Plugins**.

### 3.3 Inspector — verdict #6 ("Merge — mockup shell + your content")
**Target:** `webview/src/components/layout/InspectorHub.tsx` (reskin; data already fully wired).
**Mockup parity source:** `/Volumes/Projects/Development_Projects/Github_Repos/mindful-studio/src/components/InspectorPanel.tsx`
(docked tabbed shell — Block / Bus / Cable / Health tabs).
Build: adopt the mockup's **docked tabbed shell** (Block / Bus / Cable / Health) on `.nodeblock-v3`
tokens; drop YOUR already-wired content into the tabs unchanged:
- **Block tab:** param sliders (`nativeGetNodeParameters`/`nativeSetNodeParameter` + live
  `onParameterUpdate`), A/B preset compare (`nativePresetSnapshot/Swap`), plugin-window embed
  (`nativePluginEditorOpen/SetBounds/Close/Float`), per-block note (`nativeGraphSetNodeNote`).
- **Bus / Cable tabs:** existing `BusInspector` + `ConnectionEditor`.
- **Health tab:** existing engine-snapshot fields (`useEngineSnapshotStore`).
**No C++ additions for the Inspector** — it is explicitly NOT on the scan critical path. Sequence it
**in parallel** with the scan work, not behind it.

---

## 4. Sequence (critical path first)

The genuine #1-critical chain is **scan → Browser list**. Inspector runs in parallel.

| Step | Lane | Work | Depends on |
|---|---|---|---|
| S1 | C++ | Add 6+1 native fns + helpers + timer push (§1) — **one file** | — |
| S2 | bridge | `nativePluginScan.ts` + tests (§2.1) | S1 fn names |
| S3 | bridge | `useJuceBridge` receivers + `useScanStore` + store parser refactor (§2.2-2.3) | S2 |
| S4 | React | ToolPalette → verdict #5 incl. scan controls (§3.1) | S3 |
| S5 | React | Preferences → Plugins tab (§3.2) | S3 |
| P1 | React | Inspector docked shell reskin (§3.3) — **parallel, no C++ dep** | existing bridge only |
| V | all | tsc -b; `npm run verify-stories`; Storybook MCP `run-story-tests` on ToolPalette / PreferencesModal / InspectorHub; manual scan smoke (fresh build + install) | S4/S5/P1 |

**Hard MUSTs carried into every step:**
- New pull-handlers return a **structured `var`** (`JSON::parse(buildXJson())`), never a JSON
  string — re-reintroduces the 150 s boot hang otherwise (host.cpp:908-916).
- Scan progress = **indeterminate** + rolling name; no fabricated percentage.
- Keep all C++ in `element_webview_host.cpp`/its header to avoid colliding with concurrent C++ lane.
- Format-enable is **restart-gated** — surface that in the UI (not a silent no-op).
- UI on `.nodeblock-v3` tokens + `neu-sculpt` chassis, following `Block.tsx`; reuse locked
  Neu primitives per their verdicts (NeuBadge/NeuInput keep-yours; NeuToggle/NeuEmptyState/
  NeuSkeleton mockup/merge).

---

## 5. Risks / open items
- **No numeric scan progress** on the public API → MVP indeterminate. Determinate bar = future
  `PluginManager` getter surfacing the coordinator progress (out of MVP).
- **Restart-gated format toggles** — the native path requires a restart; don't promise live effect.
- **`props` availability** — host needs a valid `PropertiesFile*` (`setPropertiesFile`, plugins.hpp:118)
  for `getLastSearchPath/setLastSearchPath`; verify it's set before the Preferences paths UI ships
  (guard with a null-check, return the `defaultSearchPath` if `props == nullptr`).
- **Quick scan metadata** — quick-scanned plugins have minimal metadata until first load
  (plugins.hpp:176-178); the Browser row must tolerate empty `manufacturer`/`category`
  (`usePluginBrowserStore` already defaults these).
