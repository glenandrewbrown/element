# HANDOFF — Element React UI: "functionally unusable" root-caused (2026-05-29)

Branch `local-enhancements`, HEAD `f85e246c`. **Nothing committed** (Glen's standing rule: no commit without explicit ask). All changes uncommitted on disk.

## TL;DR
Two distinct root causes make the React UI unusable. **#1 is FIXED + verified. #2 is precisely root-caused but NOT yet fixed** (the app's WebView is still blank because of it).

---

## ✅ ROOT CAUSE #1 — FIXED & VERIFIED: 150s boot hang (O(n²) bridge emit)
**Symptom:** app boots, then main thread pegs 100% CPU for ~2.5 min → blank/unresponsive.
**Proof:** `sample` of hung PID = 1575/1575 samples in `MessageQueue::deliverNextMessage → ElementWebViewHost completion → NativeFunctionsProvider::emitCompletionEvent → WebBrowserComponent::Impl::emitEvent → juce::String::replace`.
**Mechanism:** JUCE8 `emitCompletionEvent` (build-merged/_deps/juce-src/.../juce_WebBrowserComponent.cpp:424-425) does `JSON::toString(result).replace("\\","\\\\").replace("'","\\'")`. `juce::String::replace` is **O(n × match-count)** (reallocs+copies whole string per match). `elementGetPluginList` returned a ~700KB JSON **string** for the user's **1996 plugins** (plugins.xml). JSON::toString re-escaped every quote → ~28k backslashes → 28k × 700KB ≈ 20GB memcpy ≈ 150s. React calls getPluginList on boot. (The juceBackend.ts bridge fix EXPOSED this — pre-fix calls no-op'd.)
**Fix applied (uncommitted):**
- `src/ui/element_webview_host.cpp`: `elementGetPluginList` handler (~868) and `elementGetNodeParameters` handler (~878) now `postCompletion(completion, JSON::parse(buildXJson()))` — return a structured `var` so JUCE serializes once structurally (quotes structural, not escaped) → ~0 backslashes → O(n).
- `webview/src/bridge/nativeGraph.ts` `nativeGetNodeParameters`: made object-or-string tolerant (`typeof r === "string" ? JSON.parse(r) : r`). `usePluginBrowserStore.ts:64` already object-tolerant.
**Verified:** rebuilt element_app (16:30); relaunch → BEFORE 99.2% CPU `R` 2:32 spin; AFTER **3.8% CPU `S` idle**, sample shows main thread back in `MessageManager` wait. No String::replace spin.
**Do NOT regress:** never return a large pre-serialized JSON *string* from a native fn whose React caller can accept an object. `getGraphState` was LEFT as string (small; its callers `useJuceBridge.ts:452,507,535` require `typeof===string`).

## ✅ ROOT CAUSE #2 — FIXED & VERIFIED: React UI renders BLANK (infinite render loop in `BlockEmbed.tsx`)
**Symptom:** Element window shows only native chrome (top bar + footer, both C++ from `src/ui/content.cpp`) with a **blank middle** (WKWebView). React app never paints.
**Root cause (CONFIRMED, not the earlier guesses):** `webview/src/components/canvas/BlockEmbed.tsx` `ParamStripEmbed` subscribed to `useParameterStore` with a selector that builds and returns a **fresh `new Array(visible)` on every call**:
```ts
const values = useParameterStore((st) => { const out = new Array(visible); …; return out; });
```
**Zustand v5** (this repo is `zustand@^5.0.12` + `react@19`) removed the automatic selector memoization that v4 had: the raw selector result is handed straight to React's `useSyncExternalStore`, which compares snapshots with `Object.is`. A new array each call is never `Object.is`-equal to the previous one → React sees the snapshot as perpetually changed → `forceStoreRerender` fires inside the passive-mount effect → **"The result of getSnapshot should be cached to avoid an infinite loop" → "Maximum update depth exceeded"**. The exact handover stack (`forceStoreRerender → updateStoreInstance → commitHookPassiveMountEffects`) is `useSyncExternalStore` internals.
**Why bridge-only / why blank:** `ParamStripEmbed` mounts only when a Block renders embedded controls (i.e. the graph is **populated** + expanded zoom). The loop trips at mount and throws before the tree paints → whole React root blanks. The earlier "empty session" assumption was the red herring — the loaded session had graph content.
**Decisive repro (Playwright, mock JUCE bridge injected before load):** EMPTY graph → renders clean, no loop. POPULATED graph (nodes+cables) → **`loopCount:1`, exact error, `root.children===0` (blank)**. After fix: POPULATED → `loopCount:0`, root paints. (Harness `webview/repro-loop.mjs` was temporary and has been removed.)
**Fix applied (uncommitted):** `BlockEmbed.tsx` — wrap the selector in `useShallow` (`import { useShallow } from "zustand/react/shallow"`). `useShallow` element-compares and returns the cached array when contents are unchanged, satisfying the getSnapshot caching contract. Verified type-clean (`tsc -b`: 0 non-test errors; the 35 remaining errors are the pre-existing `__tests__` drift). Rebuilt: `npx vite build` → `index-CcvRJ5xC.js`, and **manually synced `webview/dist` → `Element.app/.../Resources/webview`** because `element_app` had no C++ delta so its POST_BUILD dist-copy did not fire (the app binary is still the 16:30 fix-#1 build — only the embedded JS changed).
**RUNTIME CONFIRMATION STILL OWED (Glen's rule):** launch `build-merged/element_app_artefacts/Element.app` with a session that has blocks and confirm the React UI paints (panels + canvas + embedded block faders) with no hang.
**General guard (see also project memory):** in this codebase any Zustand selector that returns a **derived** object/array (`.map`, `.filter`, `new Array`, object literal, spread) MUST be wrapped in `useShallow` or it infinite-loops at mount under v5. Audited: `BlockEmbed.tsx:114` was the only offender; `Cable.tsx:86` returns a number (safe); DashboardBuilder/InspectorHub selectors return primitives (safe).

**How to reproduce + see the error (diagnostic technique):**
- `cd webview && npm run dev` (server at :5173, already running this session as a bg proc — may need restart).
- Re-add the temp error overlay to `webview/src/main.tsx` (it was removed; snippet below), then launch Element with the dev URL to SEE the error in-app:
  `ELEMENT_WEBVIEW_DEV_URL=http://localhost:5173 build-merged/element_app_artefacts/Element.app/Contents/MacOS/Element`
- Temp overlay snippet (add at top of main.tsx, before createRoot):
  ```ts
  function __showFatal(m:string){const d=document.createElement('pre');d.style.cssText='position:fixed;inset:0;z-index:999999;margin:0;padding:16px;color:#ff5555;background:#0d0d0f;font:13px monospace;white-space:pre-wrap;overflow:auto';d.textContent='WEBKIT FATAL:\n'+m;document.body.appendChild(d);}
  window.addEventListener('error',e=>__showFatal((e.message||'')+'\n'+((e.error&&e.error.stack)||'')));
  window.addEventListener('unhandledrejection',e=>__showFatal('unhandledrejection: '+String((e as PromiseRejectionEvent).reason)));
  ```
- Better: enable WKWebView remote inspection + attach Safari Web Inspector (Develop menu) to Element's WebView for live console/React DevTools.

## Pre-existing also-broken (found in passing)
- `npm run build` (production) is BLOCKED by ~25 TS errors, ALL in `webview/src/**/__tests__/*` (stale test drift: removed store props `breadcrumbs`,`favorites`,`params`, `SceneData.color`, `MacroControl.label`, etc.). `npx vite build` works (esbuild ignores types). CI/release is broken until tests fixed.
- Right-click on canvas shows WKWebView native "Reload" menu, not the React QuickAdd (onContextMenu/onPaneContextMenu not firing) — minor, revisit after #2.

## Environment / verification tooling
- App bundle: `build-merged/element_app_artefacts/Element.app` (binary 16:30 with fix #1). Settings: `~/Library/Application Support/Kushview/Element/Element.conf` (mainContentType=webview, lastSession=BRASS_4Horns.els which does NOT auto-load). Logs: `.../Element/log/element-verbose.log`.
- AX harness venv recreated at `/tmp/element-verify-venv` (PyObjC+rapidfuzz). `tools/automation/element_ax_map.py --depth N`. `cliclick` at /usr/local/bin. Screenshot: `screencapture -x -R"x,y,w,h"`.
- Build: `cd webview && npx vite build` then `cmake --build build-merged --target element_app -j8` (POST_BUILD copies dist + cleans stale hashes).
- Glen constraints: Claude-only agents; banned oracle/ultrabrain; user MUST confirm UX at runtime (feedback memory `~/.claude/projects/.../memory/feedback_ui_testing.md`); NEVER commit unsolicited.

## Next-session plan
1. Re-add main.tsx overlay → launch dev-URL → confirm the exact loop source line from a fuller stack / React DevTools.
2. Fix the infinite loop (likely an unstable store write-through or effect; add `useShallow` / stabilize getSnapshot / guard the write-through).
3. Rebuild → relaunch embedded bundle → screenshot: React UI must paint (panels + canvas). Then re-verify fix #1 still holds (plugin browser populates, no hang).
4. Then: fix `npm run build` test drift; right-click QuickAdd; re-triage the 78-bug audit (docs/REACT_UI_AUDIT_2026-05-24.md) against the now-rendering UI; hardcoded fake data; audio-perf (60Hz telemetry cost).
