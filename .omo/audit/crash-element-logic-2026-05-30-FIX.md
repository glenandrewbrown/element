# CF1 Fix — AX-peer use-after-free on AU editor teardown (2026-05-31)

> Companion to `crash-element-logic-2026-05-30.md` (the read-only investigation).
> Status: **mitigation applied + builds + ctest green — NEEDS HOST VERIFICATION in Logic.**
> Author: debugger agent. C++ only; webview/ untouched.

## Root cause (confirmed by crash report)

Crash report `Logic Pro-2026-05-30-102744.ips`:
`EXC_BAD_ACCESS (SIGSEGV)` on Logic's **main thread**, inbound Mach AX query:
`__CFRunLoopDoSource1 -> _AXXMIGCopyAttributeValue -> NSAccessibilityPerformEntryPointBOOL
-> objc_opt_respondsToSelector` on a **freed NSAccessibilityElement**, ~0.2 s after JUCE
editor windows closed (`JUCEWindow_… finishing close` at 10:27:29.3, crash 10:27:29.5).

The C++ teardown order in `~PluginEditor` was already hardened (close windows + clear
content BEFORE removing from the JUCE hierarchy — commit d4962f8a). That ordering does
**not** cover the macOS **accessibility-peer lifetime**: JUCE's per-Component
`AccessibilityHandler` / `NSAccessibilityElement` peers were being freed *implicitly*,
during the host's native window-peer teardown, at a moment outside JUCE's control. That
left a window where an in-flight inbound Mach AX query (a system AX agent — VoiceOver,
AXVisualSupportAgent, etc.) could deref a peer that had just been freed on the host main
thread.

The fault stack has **zero** Element/JUCE-teardown frames — it is a *later* run-loop turn
servicing a Source1 AX query against a peer freed in an earlier turn. So the bug is "stale
AX ref survives teardown", not a crash *inside* the dtor.

## Why the fix resolves the UAF (mechanism — timing)

`juce::Component::setAccessible(false)` sets `accessibilityIgnoredFlag` and calls
`invalidateAccessibilityHandler()` → `accessibilityHandler = nullptr`. That synchronously
runs `~AccessibilityHandler` → `~AccessibilityNativeImpl` → the
`AccessibleObjCClassDeleter`, which:
  1. frees platform-specific data,
  2. **nulls the ObjC element's `handler` ivar** (so any later accessor's
     `if (auto* handler = getHandler(self))` null-guard returns safely), and
  3. `[element release]` — and JUCE posts `NSAccessibilityUIElementDestroyedNotification`
     so AppKit drops cached references.
(Refs: juce_Component.cpp:3021-3048; juce_AccessibilitySharedCode_mac.mm:39-49;
juce_Accessibility_mac.mm:820, 879.)

By calling `setAccessible(false)` at the **very top** of `~PluginEditor` — on the message
thread, while `this`, its children, and the native window peer are all still alive — the AX
peer subtree is destroyed at a single clean, controlled point *with* the destroyed
notification, **before** native window/view teardown begins. The freed-out-from-under-a-
query window is eliminated. The solid ground is **timing**: same object gets freed either
way, but now it is freed deterministically + announced, not yanked mid-query.

## The fix (minimal diff)

`src/plugineditor.cpp`, `~PluginEditor()` — one statement added at the very start of the
destructor body (plus an explanatory comment), before `saveSettings()` / window close /
content clear:

```cpp
    setAccessible (false);
```

No logic flow changed; no other teardown step touched. ~1 functional line.

## Scope + attribution caveats (carried from the investigation)

- **Scope:** this covers the **editor's own AX subtree** (the heavy WebBrowser/graph
  content + perf sliders). The crash timeline shows `JUCEWindow_… finishing close` ×2 —
  almost certainly the **child plugin windows** (separate top-level JUCE windows torn down
  by `gui->closeAllPluginWindows()`), which are NOT in this editor's child subtree, so
  `setAccessible(false)` on `this` does not reach them. If host-verify still crashes, the
  **next lane** is applying the same early-AX-teardown to the plugin windows
  (windowmanager / pluginwindow).
- **Attribution:** Element-ownership of the freed peer is HYPOTHESIS, not proven (n=1
  report; multiple JUCE-8 plugins were loaded; the closing window hash `2b12aff0…` is
  assumed-but-unconfirmed to be Element's).

## Host-verification steps for Glen (Logic Pro)

Run a FRESH full build + install first (plugin must be the new binary, not the stale
2.2.0 installed copy). Then:
1. Turn **VoiceOver ON** (Cmd+F5) — this is what makes the AX agent actively query peers
   and is what surfaced the crash.
2. In Logic, insert **KV-Element** (AU instrument) on a track. Open its editor.
3. **Open and close the Element editor ≥20×** in a row (close the plugin window, reopen).
   No crash = good.
4. With the Element editor **open**, **save then close the project** (and quit Logic).
   This is the exact path that crashed (window teardown + AX agent live). No crash = good.
5. Repeat 2–4 with **KV-Element-FX** and **KV-Element-MFX**.
6. Optional log check during teardown:
   `log show --last 2m --predicate 'process == "Logic Pro"' | grep -i accessib`
   — AX queries should return cleanly; no fault around `JUCEWindow… finishing close`.
7. Confirm **no** new `Logic Pro-*.ips` appears in `~/Library/Logs/DiagnosticReports/`.

If a crash still occurs, capture the new `.ips` and check whether the faulting
`JUCEWindow_` hash matches Element's editor vs a child plugin window → routes to the
plugin-window lane above.
