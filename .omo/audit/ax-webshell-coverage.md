# Task 4 — Boot-hang Regression Fixture + AX Web-shell Coverage Check

**Wave-1 investigation deliverable.** Investigation only — no production code or
tests were changed. Repo: `element`, branch `local-enhancements`.

Two parts:
1. **Boot-hang regression fixture** reproducing the fix #1 trigger (large plugin
   list → O(n²) JSON-escape hang). Fixture written to
   `webview/src/test/fixtures/plugins-large.xml`.
2. **AX suite coverage classification** — per-suite static determination of
   whether `element_verify.py` targets the React **web shell** (canonical) or
   the classic **JUCE StandardContent**, with source evidence.

---

## Part 1 — Boot-hang regression fixture

### 1.1 The fix #1 trigger (root cause, confirmed in source)

`element_webview_host.cpp:865-877` registers `elementGetPluginList`. The fix
comment and code:

```cpp
registerFn (
    Identifier ("elementGetPluginList"),
    [this, postCompletion] (const Array<var>&, auto completion) {
        // ... JUCE's emitCompletionEvent does JSON::toString(result).replace("\\","\\\\"),
        // and juce::String::replace is O(n × matches). A JSON *string* result
        // gets every internal quote escaped to \", so matches == quote-count
        // (~28k for the 1996-plugin, ~700 KB payload) → ~150 s main-thread
        // hang on boot. A var serialises structurally ... → O(n).
        postCompletion (completion, JSON::parse (buildPluginListJson()));   // line 876
    });
```

`buildPluginListJson()` (`element_webview_host.cpp:4372-4406`) iterates
`context.plugins().getKnownPlugins().getTypes()` and emits one JSON object per
plugin (`name, descriptiveName, manufacturer, version, format, category,
identifier`) plus `favoriteIdentifiers` / `recentIdentifiers`. The size of that
payload is driven entirely by the **number of known plugins**, i.e. the entry
count in `plugins.xml`.

**The trigger is the size/entry-count of the known-plugin list**, not any
particular plugin. The fix returns a structured `juce::var` (O(n)) instead of a
pre-serialised JSON string (O(n²) under JUCE's result-escaping).

### 1.2 Real-world source shape

The live trigger file on this machine:

| Property | Value | Evidence |
|---|---|---|
| Path | `~/Library/Application Support/Kushview/Element/plugins.xml` | `ls` |
| Entry count | **1996** `<PLUGIN .../>` | `grep -c "<PLUGIN "` |
| Byte size | **736698** (719.4 KB) | `wc -c` |
| Format mix | 1493 AudioUnit / 462 VST3 / 41 Element | `grep -oE 'format="[^"]*"' | sort | uniq -c` |
| Root element | `<KNOWNPLUGINS>` | file head |

Real `<PLUGIN/>` attribute set (JUCE `KnownPluginList` serialization):
`name, descriptiveName, format, category, manufacturer, version, file,
uniqueId, isInstrument, fileTime, infoUpdateTime, numInputs, numOutputs,
isShell, hasARAExtension, uid`.

### 1.3 Synthesized fixture

**Path:** `webview/src/test/fixtures/plugins-large.xml` (directory created).

| Property | Fixture | Real file | Acceptance |
|---|---|---|---|
| Entry count | **1996** | 1996 | ~1996 → EXACT |
| Byte size | **743481** (726.1 KB) | 736698 | ~700 KB ±10% (630–770 KB) → PASS (+0.92% vs real) |
| Well-formed XML | PASS (`xmllint --noout`) | — | — |
| Format mix | 1493 AU / 462 VST3 / 41 Element | identical | mirrors real distribution |
| Determinism | content is a pure function of entry index; no timestamps | — | byte-identical on every regen |

The fixture mirrors the real attribute set and root element so it can be fed
directly to JUCE's `KnownPluginList::recreateFromXml` for a native boot test,
**or** derived into the `elementGetPluginList` JSON payload for a webview-side
regression test (see §1.5).

Generator (reproducible — re-run produces byte-identical output):

```python
# /tmp/gen_plugins_large.py
import html
PLAN = [("AudioUnit", 1493), ("VST3", 462), ("Element", 41)]   # mirrors real plugins.xml mix
MANUS = ["Acme Audio","Soniccraft","Waverly DSP","Northgate","Lumen Labs",
         "Apex Instruments","Bluewave","Crimson Audio","Delta Sound","Echelon"]
CATS  = ["Synth","Reverb","Delay","EQ","Dynamics","Distortion","Filter",
         "Sampler","Sequencer","Utility","Analysis","MIDI Effect","","Unknown"]
def esc(s): return html.escape(s, quote=True)
def entry(i, fmt):
    manu, cat = MANUS[i%len(MANUS)], CATS[i%len(CATS)]
    is_inst = "1" if cat in ("Synth","Sampler") else "0"
    if fmt == "AudioUnit":
        name = f"{manu} {cat or 'FX'} {i}"; file = f"AudioUnit:Effects/aufx,e{i:04d},Acme"
        uid = f"0x{(0x10000000+i):08x}"; ins, outs = (0 if is_inst=='1' else 2), 2
    elif fmt == "VST3":
        name = f"{manu.replace(' ','')}{cat or 'FX'}{i}"; file = f"/Library/Audio/Plug-Ins/VST3/{name}.vst3"
        uid = f"{(0x20000000+i):d}"; ins, outs = (0 if is_inst=='1' else 2), 2
    else:
        name = f"{cat or 'Node'} {i}"; file = f"element.node{i:04d}"; uid = "0"; ins, outs = 1, 1
    return (f'  <PLUGIN name="{esc(name)}" descriptiveName="{esc(cat or name)}"\n'
            f'          format="{fmt}" category="{esc(cat)}" manufacturer="{esc(manu)}" version="1.{i%10}.0"\n'
            f'          file="{esc(file)}" uniqueId="{uid}" isInstrument="{is_inst}"\n'
            f'          fileTime="0" infoUpdateTime="0" numInputs="{ins}" numOutputs="{outs}"\n'
            f'          isShell="0" hasARAExtension="0" uid="0"/>\n')
out = ['<?xml version="1.0" encoding="UTF-8"?>\n\n<KNOWNPLUGINS>\n']
i = 0
for fmt, n in PLAN:
    for _ in range(n): out.append(entry(i, fmt)); i += 1
out.append('</KNOWNPLUGINS>\n')
open("webview/src/test/fixtures/plugins-large.xml","w").write("".join(out))
```

### 1.4 Fix #1 escape-cost, quantified from the fixture

Deriving the `elementGetPluginList` JSON payload from the fixture (one object
per plugin, minified):

| Metric | Value |
|---|---|
| Plugin objects | 1996 |
| JSON payload bytes | 406828 (397.3 KB) |
| Double-quote chars in payload | 55894 |
| O(n×matches) work units = `payload_len × quote_count` | **22,739,244,232** (~2.27 × 10¹⁰) |

This is the number of character-ops the **pre-fix** string-return path forced
onto the message thread via `juce::String::replace("\\","\\\\")` over a
result string whose own quotes all required escaping — the ~150 s boot hang.
The post-fix `var` path has `matches ≈ 0` → O(n). (The C++ comment cites ~28k
quotes for a leaner attribute set; the fixture's richer attributes yield ~56k,
same order of magnitude and same n² hazard.)

### 1.5 How the boot regression test (items 6/16) loads the fixture and measures

Two complementary measurement paths. The fixture supports both.

**Path A — webview-side store regression (fast, deterministic, CI-friendly).**
This is the path the existing test infra already supports.

1. **Load:** read `webview/src/test/fixtures/plugins-large.xml`, parse the
   `<PLUGIN/>` attributes, and project them into the `elementGetPluginList`
   payload shape:
   `{ plugins: [{ identifier, name, descriptiveName, manufacturer, format,
   category }...], favoriteIdentifiers: [], recentIdentifiers: [] }`
   (matches `buildPluginListJson()` at `element_webview_host.cpp:4372` and what
   `usePluginBrowserStore.refresh` consumes at `usePluginBrowserStore.ts:49,64-99`).
2. **Inject:** install the bridge mock and resolve the large payload:
   `const bridge = installJuceBridgeMock();`
   `bridge.mock.mockResolvedValueOnce(largePayload);`
   (pattern proven in `usePluginBrowserStore.test.ts:23-47` and
   `mockJuceBridge.ts:105-131`).
3. **Measure:** `const t0 = performance.now();`
   `await usePluginBrowserStore.getState().refresh();`
   `const dt = performance.now() - t0;`
   Assert `dt < BUDGET_MS` and `getState().plugins.length === 1996`.
   This exercises the **real** `invokeElementNative` wrapper + the JSON
   parse/map loop in `refresh()`, which is the JS-side cost the C++ payload size
   drives. It does NOT re-run JUCE's escape bug (that lives in C++), but it is
   the regression guard for "the store can ingest a 1996-entry / ~400 KB
   payload within budget without blocking".
   Note: the bridge mock returns an **object** (post-fix var shape), matching
   the production fix. A string-return variant can be added to assert the store
   still parses the legacy string shape (`usePluginBrowserStore.ts:64`).

**Path B — native boot test (true fix #1 guard, requires the running app).**
This is the item-6 live AX run, and is the only path that exercises the actual
C++ escape regression.

1. **Load:** stage the fixture as the app's known-plugin list before launch —
   copy `plugins-large.xml` over
   `~/Library/Application Support/Kushview/Element/plugins.xml` (back up the
   real file first). JUCE deserialises it via `KnownPluginList::recreateFromXml`
   at startup, so `getKnownPlugins().getTypes()` returns 1996 entries and
   `buildPluginListJson()` emits the ~400 KB payload.
2. **Measure boot-completion = "main thread returns to idle":** launch
   `Element.app` and poll the AX tree (reuse `element_verify.py`'s
   `_ensure_element_running` + `assert_window_exists`). The window appears, but
   under the pre-fix path the **message thread is blocked ~150 s inside the
   escape pass**, so AX queries against the window content time out (the AX
   server is starved while the main thread spins in `String::replace`).
   Boot-completion time = wall-clock from `open` until the first AX query that
   touches the web-shell content (e.g. the plugin-browser suite's "Plugins"
   button) returns successfully — i.e. the main thread has drained the
   `elementGetPluginList` completion and gone idle.
   - **Regression threshold:** post-fix this should complete in well under a few
     seconds; the pre-fix hang was ~150 s. A budget of e.g. ≤ 10 s cleanly
     separates fixed from regressed.
   - Restore the real `plugins.xml` from backup after the run.

**Recommended:** Path A as the CI gate (deterministic, no app), Path B as the
item-6 manual/AX confirmation that the native escape path stays O(n).

---

## Part 2 — AX suite coverage classification

### 2.1 Which content host is canonical?

`DefaultContentFactory::createMainContent` (`guiservice.cpp:51-63`):

```cpp
#if JUCE_WEB_BROWSER
    const char* stdEnv = std::getenv ("ELEMENT_STANDARD_CONTENT");
    const bool forceStandard = stdEnv != nullptr && String (stdEnv).trim() == "1";
    if (type == "standard" || forceStandard)
        return std::make_unique<StandardContent> (context);
    return std::make_unique<WebContent> (context);   // <-- DEFAULT
#else
    return std::make_unique<StandardContent> (context);
#endif
```

- **Default = `WebContent` (React web shell).** `WebContent::WebContent`
  (`web_content.cpp:33-44`) owns the React surface:
  `webHost = std::make_unique<ElementWebViewHost> (ctx);` (`web_content.cpp:36`).
- **`StandardContent` (classic JUCE)** is the fallback only when
  `ELEMENT_STANDARD_CONTENT=1`, `type=="standard"`, or `JUCE_WEB_BROWSER` is off.

**Therefore the canonical surface is the React web shell.** Any suite whose
labels exist only in `webview/src` intrinsically targets the web shell; the
suites themselves are content-agnostic (they BFS the live AX window tree and
have no awareness of which content is mounted).

### 2.2 Where do the suite assertion labels originate? (string-presence sweep)

`grep -rln "<label>" src/` (classic C++) vs `webview/src` (React):

| Label (suite) | C++ `src/` | `webview/src` | Origin |
|---|---|---|---|
| `Plugins` | none | 8 | **web shell only** |
| `Projects` | none | 2 | **web shell only** |
| `Sessions` | none | 1 | **web shell only** |
| `Perform` | none | 46 | **web shell only** |
| `Dashboard` | none | 10 | **web shell only** |
| `Keyboard` | none | 23 | **web shell only** |
| `Inspector` | none | 12 | **web shell only** |
| `Device:` | `content.cpp:317` (+controllersview/audiodeviceselector) | 1 | **both** (classic footer + web) |

### 2.3 Structural reachability caveat (applies to ALL web-shell suites)

The AX search has a **hard BFS depth cap of 5** for both title and role/value
searches:

- `find_element_by_title(..., max_depth=5)` → `if depth > max_depth: continue`
  (`element_assertions.py:107,118`).
- `assert_role_exists` / `assert_value_contains` → `if depth > 5: continue`
  (`element_verify.py:62,103`).

WebKit exposes the React DOM under an `AXWebArea` subtree that is typically
**deeper than 5 levels** below the window root, and `_collect_windows` starts
from `AXMainWindow`/`AXFocusedWindow`/`AXWindows` (`element_assertions.py:84-85`).
None of the suites descend into or special-case `AXWebArea`. So a web-shell
label can be present in the React DOM yet **unreachable** within the depth-5
BFS. This is the dominant gap for every web-shell suite and is the most likely
cause of any item-6 AX failures. (Confirm empirically in item 6 with
`element_ax_map.py --depth N` for N ≥ 10.)

Matching is fuzzy (`rapidfuzz.token_set_ratio ≥ 70`,
`element_assertions.py:29,42-45`) across `AXTitle`/`AXIdentifier`/`AXDescription`
— so labels need to surface as one of those AX attributes on the WebKit node,
which depends on the React markup exposing accessible names.

### 2.4 Per-suite classification

| Suite | Runner (line) | Targets | Evidence | Gap / Action |
|---|---|---|---|---|
| **plugin-browser** | `_run_plugin_browser` (`element_verify.py:187-193`) | **webshell** | Asserts `Plugins` + `Projects` `AXButton` + an `AXTextArea`; "Plugins"/"Projects" exist only in `webview/src` (8/2 hits), none in `src/`. Canonical host = `WebContent` (`guiservice.cpp:58`). | Verify the React tab buttons + search box are reachable within depth-5 of the AXWebArea (§2.3). If not, raise `max_depth` and/or add an AXWebArea entry-point. No re-pointing of labels needed — already web-shell labels. |
| **session-browser** | `_run_session_browser` (`element_verify.py:196-201`) | **webshell** | Asserts `Projects` `AXButton` + `AXTextArea`. "Projects" web-only (2 hits). | Same depth-5/AXWebArea reachability check as plugin-browser. Label is correct for web shell. |
| **navigation** | `_run_navigation` (`element_verify.py:204-211`) | **mixed → webshell-leaning** | Asserts `Plugins`, `Sessions`, `view`, `Graph`. `Plugins`/`Sessions` web-only; `Graph` matches the window title (AXWindow, host-agnostic); `view` is a generic fuzzy token. | `Plugins`/`Sessions` are web-shell labels → confirm reachability (§2.3). `Graph`/`view` may pass via window title/fuzz regardless of host and can mask a web-shell miss. Action: tighten `view` to a specific web-shell nav identifier; treat `Graph` as a window-level (not content) check. |
| **toolbar** | `_run_toolbar` (`element_verify.py:214-219`) | **AMBIGUOUS (classic OR web)** | Asserts `AXValue` contains `Device:`. `Device:` is emitted by **classic** `StandardContent` footer (`content.cpp:317`) AND appears once in `webview/src`. | This suite can pass against EITHER host. Under the default `WebContent` it must match the React status bar; under `ELEMENT_STANDARD_CONTENT=1` it matches the JUCE footer. **Action: re-point at a web-shell-unique status-bar identifier** so a pass proves the web shell rendered, not the classic footer. Document which host the item-6 run used. |
| **dashboard-builder** | `_run_dashboard_builder` (`element_verify.py:222-239`) | **webshell** | Asserts `Perform`, `Dashboard`, `Edit`. `Perform`/`Dashboard` web-only (46/10 hits), none in `src/`. Dashboard Builder is a Perform-mode React feature (CLAUDE.md). Runner's own TODO(P1-18) notes AX labels are not yet set in C++. | Web-shell labels already. Action: depth-5/AXWebArea reachability (§2.3); per existing TODO, ensure React sets accessible names on the Perform tab + edit toggle; disambiguate `Edit` (generic) with a unique identifier. |
| **command-palette** | `_run_command_palette` (`element_verify.py:242-291`) | **webshell** | Sends Cmd+K via osascript, then role-only `AXTextField` + `AXScrollArea`. Command palette (Cmd+K) is a React canvas feature (CLAUDE.md keyboard table). Runner TODO(P1-18): AX identifier not yet set in C++. | Role-only BFS within depth-5 of AXWebArea (§2.3). Action: add an AXIdentifier/AXTitle for the palette search field in the React markup; then switch from role-only to label assertion. |
| **bus-inspector** | `_run_bus_inspector` (`element_verify.py:294-322`) | **webshell** | Asserts `Inspector` label + generic `AXGroup`. "Inspector" web-only (12 hits). Runner TODO(P1-18): not AX-labelled in C++; needs a live cable + right-click→Inspect. | Web-shell label. Action: requires a populated graph + right-click trigger (not wired). The generic `AXGroup` check is near-vacuous (any group passes). Add a web-shell-unique inspector-panel identifier and a cable-selection precondition. |
| **virtual-keyboard** | `_run_virtual_keyboard` (`element_verify.py:325-348`) | **webshell** | Asserts `Keyboard` label + generic `AXButton`. "Keyboard" web-only (23 hits). `VirtualKeyboard.tsx` is a React component (modified on this branch). Runner TODO(P1-18): container not AX-labelled in C++. | Web-shell label. Action: depth-5/AXWebArea reachability (§2.3); generic `AXButton` check is near-vacuous (any button passes) — tighten to the keyboard container's unique identifier once React sets it. |

### 2.5 Summary

- **7 of 8 suites are web-shell suites** (plugin-browser, session-browser,
  navigation, dashboard-builder, command-palette, bus-inspector,
  virtual-keyboard). Their labels exist only in `webview/src`. No label
  re-pointing to the web shell is required — they already target it.
- **1 suite (toolbar) is AMBIGUOUS** and is the only one needing **re-pointing**:
  `Device:` is shared by the classic JUCE footer (`content.cpp:317`) and the
  React status bar, so a pass does not prove the web shell rendered. Re-point it
  at a web-shell-unique status-bar identifier.
- **Cross-cutting structural gap (all web-shell suites):** the depth-5 BFS cap
  + no `AXWebArea` descent (`element_assertions.py:107,118`;
  `element_verify.py:62,103`) likely prevents the suites from reaching React DOM
  nodes nested under WebKit's `AXWebArea`. This is the highest-priority fix for
  item-6 AX coverage and the most probable cause of false negatives. Verify with
  `element_ax_map.py --depth 10+`.
- **Near-vacuous role-only checks** (generic `AXGroup`/`AXButton` in
  bus-inspector, virtual-keyboard, dashboard-builder `Edit`) can pass without
  proving the intended element exists; tighten to web-shell-unique identifiers.

---

## Source evidence index (file:line)

| Claim | Evidence |
|---|---|
| `elementGetPluginList` fix #1 (var, not string) | `src/ui/element_webview_host.cpp:865-877` (esp. 876) |
| Plugin-list JSON builder + payload shape | `src/ui/element_webview_host.cpp:4372-4406` |
| React store consumes payload (object-or-string) | `webview/src/stores/usePluginBrowserStore.ts:49,64-99` |
| Bridge-mock injection pattern for store tests | `webview/src/test/mockJuceBridge.ts:105-131`; `webview/src/stores/__tests__/usePluginBrowserStore.test.ts:23-47,118-127` |
| Default content host = WebContent (web shell) | `src/services/guiservice.cpp:51-63` |
| WebContent owns ElementWebViewHost (React) | `src/ui/web_content.cpp:33-44` (line 36) |
| Suite definitions + runners | `tools/automation/element_verify.py:138-360` |
| BFS depth-5 cap (title) | `tools/automation/element_assertions.py:107,118` |
| BFS depth-5 cap (role/value) | `tools/automation/element_verify.py:62,103` |
| Fuzzy match attributes/threshold | `tools/automation/element_assertions.py:29,41-45` |
| Window collection roots | `tools/automation/element_assertions.py:84-85` |
| `Device:` in classic footer | `src/ui/content.cpp:317` |
| Real plugins.xml stats | `~/Library/Application Support/Kushview/Element/plugins.xml` (1996 entries / 736698 B) |
| Fixture stats | `webview/src/test/fixtures/plugins-large.xml` (1996 / 743481 B); `.omo/evidence/task-4-fixture-stats.txt` |
