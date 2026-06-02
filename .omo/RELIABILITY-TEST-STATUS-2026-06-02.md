# Reliability crash-isolation test — status (2026-06-02)

Goal: prove the Bitwig-grade ship-gate — **load a plugin sandboxed → SIGKILL its worker → Element host survives** (+ crash event surfaces). Attempted live via computer-use this session.

## ✅ VERIFIED (automation)
- **Current build healthy:** `build-merged` (binary 01:03, this session) runs clean via direct-exec (only harmless `lilv` LV2 reload warnings, no crash). Has the committed sandbox route + the new reskinned webview UI (`index-DjrhxzHr.js`).
- **Sandbox route present:** `GraphManager::createFilter` (graphmanager.cpp:332) → `Settings::shouldSandboxPlugin(desc)` → `PluginManager::createSandboxedGraphNode`. Mode key `pluginSandboxMode` (0=off default, 1=all external, 2=problematic). Settings file: **`~/Library/Application Support/Kushview/Element/Element.conf`** (XML).
- **Worker mechanism proven (prior spike runs, `~/Library/Element/log/sandbox_worker.log`):** `Plugin loaded successfully: ValhallaSupermassive` in a separate worker pid; `PrepareToPlay rate=48000`; shared memory `/el_sb_*`; editor created 820x435 + `CAContextID` published. The out-of-process load + editor-create path works.
- **Live UI runs:** first snapshot launch showed the redesigned webview (Inspector tabs, scan controls, honest "NO SPECTRUM"); ValhallaSupermassive search → load worked (loaded **in-process** because the setting was initially read from the wrong store — see below — then corrected).

## 🚧 BLOCKED — live SIGKILL-survives proof UNMET (launch-environment, not code)
Three distinct macOS obstacles, none a code fault:
1. **`open` Gatekeeper-kills adhoc-signed `/tmp` copies** within ~10s. Direct-exec (`Element.app/Contents/MacOS/Element`) bypasses Gatekeeper → stays alive — but gets **no window** (no LaunchServices activation).
2. **Bundle-id collision:** installed `/Applications/Element.app 2.2.0` shares `net.kushview.Element` → LaunchServices terminates the dev build as a "duplicate". Moving the installed app needs **sudo** (root-owned). Renaming the dev copy's bundle id avoids the collision but then **computer-use screen-access is denied** ("not_installed" — not a registered app).
3. **Window won't foreground** in the (native-filtered) screenshots even when the in-repo build is alive — Glen's display is **mirrored**; the window likely renders where the capture can't see it. The in-repo build also exited ~2 min in (adhoc-launch context; Glen's normal daily launch of this same build is stable).

Also: this Element config had **0 scanned plugins in the prefs grep** (the browser shows ~1996 from a separate store), and sessions are blank/`Internal`-only or reference plugins that won't instantiate without a scan — so no headless session-autoload shortcut. `BRASS_4Horns` AU-hangs (R2) — avoid.

## ▶ HYBRID PATH TO COMPLETE (next session, ~1 min — needs Glen's launch)
1. Glen restores his app first if desired: `sudo mv /tmp/Element-2.2.0-aside.app /Applications/Element.app` — OR keeps testing build-merged directly.
2. Set the conf: `pluginSandboxMode` → `1` in `…/Kushview/Element/Element.conf`.
3. Glen launches `build-merged` **his normal way** (stable for him; window shows on his real screen).
4. Right-click canvas → type `valhalla` → add **ValhallaSupermassive (VST3)**.
5. Lead (terminal): `pgrep -P <host-pid>` → confirm a separate worker process hosts it (R1 proof) → `kill -9 <worker-pid>` → confirm host pid still alive + `sandbox_worker.log`/`onSandboxEvent` shows the crash (crash-isolation proof). Then `elementRestartSandbox` reload.

The Block "plugin crashed — reload" badge (committed this session) will show once a sandboxed node actually crashes — wire-verify it during this run.

## Note
This is the LAST ship-gate criterion that is unmet by evidence. Code is in place + unit/spike-proven; only the production end-to-end SIGKILL demo on a real commercial plugin remains. Do NOT mark Pillar-3 "done" until this passes live.
