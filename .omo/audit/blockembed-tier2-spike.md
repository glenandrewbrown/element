# BlockEmbed Tier-2 live-preview — feasibility spike

**Lane:** Wave-0.5 / Task 6 (F5). **Status:** read-only spike, no code written.
**Author:** worker-spike. **Date:** 2026-05-30.
**Feeds →** Task 16 (= C3, BlockEmbed ground-up rebuild, Wave C).

---

## 0. Verdict

> **A true *live* plugin editor rendered INSIDE the webview DOM is NOT feasible.**
> The webview is an OS web view (WKWebView on macOS) — it composites HTML, not native
> JUCE Components. A JUCE plugin editor can only be **overlaid as a native sibling on top
> of** the web content, never embedded into a DOM node, and it cannot be CSS-scaled.
>
> **BUT a focused, on-demand live editor already exists and works** — the
> `pluginEmbedEditor` native overlay (`elementPluginEditorOpen/SetBounds/Close/Float`).
> It is **single-instance** (one editor at a time), **unscalable** (renders at native px),
> and **always-on-top** (cannot be clipped by canvas z-order/pan/zoom).
>
> **Therefore Tier-2 = a single focused live-editor overlay (existing mechanism, zero new
> C++)**, NOT N simultaneous in-canvas mini-previews. The always-visible per-block content
> is **Tier-3: a bespoke info-card built from the G-29/snapshot bridge data** (no fake
> controls). A scaled static thumbnail is a deferred Tier-2.5 option requiring a new
> `createComponentSnapshot` bridge fn.

---

## 1. Why live-in-DOM is impossible

- The block canvas is React/HTML inside JUCE's `WebBrowserComponent` (CLAUDE.md: "UI:
  React/Tailwind frontend hosted in JUCE's `WebBrowserComponent`"). On macOS that backs to
  a `WKWebView`. A native subview (a JUCE plugin editor `Component`) added to the host
  **layers above** the web content — it is not a DOM element, cannot be reflowed by the
  DOM, cannot be clipped by ReactFlow transforms, and **cannot be CSS-scaled** (a plugin
  editor paints at its own native pixel size).
- This is not a limitation of Element's code; it is the WKWebView compositing model. No
  amount of bridge work makes a JUCE editor a DOM citizen.

## 2. What ALREADY exists — the native-overlay editor (the real "live preview")

Element already embeds a **real, fully-live** plugin editor as a native overlay positioned
over a DOM rect:

| Surface | Where | Note |
|---|---|---|
| Bridge open (retry-polled) | `webview/src/bridge/nativePluginEditor.ts:14-37` (`nativePluginEditorOpen(nodeId,x,y,w,h)`) | bounded retries (≈2.9 s) for the editor-not-ready race. |
| Bridge set-bounds / close / float | `nativePluginEditor.ts:43-54` (`SetBounds`/`Close`/`Float`). |
| Host handlers | `src/ui/element_webview_host.cpp:2121-2153` (`elementPluginEditorOpen/Close/SetBounds/Float`). |
| Open impl | `src/ui/element_webview_host.cpp:3859-3888` (`pluginEditorOpen`) | `createPluginEditorPanel(*gui, n)` → `addAndMakeVisible(*pluginEmbedEditor)` → `rebuildPluginEmbedLayout()` → `toFront(false)`. |
| Bounds tracking | `src/ui/element_webview_host.cpp:3837-3840, 3890-3894` (`rebuildPluginEmbedLayout` / `pluginEditorSetBounds`). |
| Pop-out to window | `src/ui/element_webview_host.cpp:3896-3912` (`pluginEditorFloat` → `gui->presentPluginWindow(n,true)`). |
| Editor factory | `src/ui/pluginwindow.hpp:17` (`createPluginEditorPanel (GuiService&, const Node&)`). |

**Hard constraints of this overlay (from the code):**
1. **Single-instance.** `pluginEmbedEditor` is one `std::unique_ptr<Component>`;
   `pluginEditorOpen` calls `pluginEditorClose()` first (`:3861`, member reset at `:3854`).
   → You **cannot** show N live editors at once. Per-block simultaneous live previews are out.
2. **Always-on-top / unclippable.** `addAndMakeVisible` + `toFront(false)` (`:3885-3887`)
   layers it above the WebView; it will paint over panels, ignore canvas z-index, and not
   clip to the block rect on pan/zoom unless `SetBounds` is continuously re-synced.
3. **Min size clamp.** `jmax(120,w) × jmax(80,h)` (`:3876`) — it refuses to shrink to a
   thumbnail; a real editor at block scale would be clipped, not scaled.
4. **Bounds must be DOM-synced.** Every pan/zoom/scroll must push `SetBounds` to keep the
   overlay aligned — manageable for ONE focused editor, fragile for many.

## 3. Tier ladder (recommendation for Task 16)

| Tier | What | Feasible? | Mechanism |
|---|---|---|---|
| **Tier-3 (DEFAULT in-block content)** | Bespoke per-category **info-card** — name, category (4-cat shape/colour), format badge, port summary, latency, params from `paramStateJson`, and (G-29) bus id/role. **No fake controls.** | ✅ now | Pure React reading the existing block snapshot (`element_webview_host.cpp:4247-4327`) + `captureGraphParameterStateJson` (`:242+`). |
| **Tier-2 (on-demand focused live editor)** | User action (e.g. double-click / "Open editor") pins the **real** plugin UI over the block rect; one at a time; "Float" pops it to a window. | ✅ now, zero new C++ | Existing `nativePluginEditorOpen/SetBounds/Close/Float`. |
| **Tier-2.5 (deferred, optional)** | Static **scaled screenshot** thumbnail per block (live-ish if polled). | ⚠️ needs new C++ | New bridge fn rendering `Component::createComponentSnapshot` offscreen → PNG/data-URL; goes stale without polling; only if Glen wants per-block visual thumbnails. |
| **Tier-2-live-per-block (N simultaneous in-DOM)** | Many live editors embedded in blocks. | ❌ impossible | WKWebView can't composite native into DOM; overlay is single-instance + unscalable. |

## 4. Fallback decision (explicit)

- **Default**: Tier-3 info-card (no live preview, no fake controls). This is the always-on
  per-block content and the safe baseline that satisfies G-20-23 ("kill the fake demo
  controls; want useful info").
- **On-demand**: Tier-2 focused overlay via the existing bridge — the genuine "live plugin
  preview" without any new native code.
- **Screenshot (Tier-2.5)** is OUT unless Glen explicitly requests per-block visual
  thumbnails (then add `createComponentSnapshot` bridge fn).
- **N live in-canvas previews** are formally OFF the table (impossible).

## 5. Citation spot-check
- `webview/src/bridge/nativePluginEditor.ts:14` → `export async function nativePluginEditorOpen(` OK
- `src/ui/element_webview_host.cpp:3877` → `pluginEmbedEditor = createPluginEditorPanel (*gui, n);` OK
- `src/ui/element_webview_host.cpp:3861` → `pluginEditorClose();` (proves single-instance reset) OK
- `src/ui/element_webview_host.cpp:3876` → `jmax (120, w), jmax (80, h)` (min-size clamp) OK

---

## 6. Directive — what C3 (plan Task 16, BlockEmbed rebuild) will therefore do

**Task C3 (= plan task 16) will therefore: build the default in-block content as a Tier-3
bespoke info-card sourced from the existing block snapshot + `paramStateJson` + G-29 bus
fields (zero fake controls), and add an on-demand "Open live editor" affordance that calls
the EXISTING `nativePluginEditorOpen` overlay (single-instance, bounds-synced, with
Float-to-window) for the real live preview. It will NOT attempt N simultaneous in-DOM live
previews (impossible under WKWebView), and will treat a scaled-screenshot thumbnail as a
deferred option contingent on a new `createComponentSnapshot` bridge fn + explicit Glen
sign-off.**
