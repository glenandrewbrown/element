# Embedded-in-canvas plugin editor — DEFERRED to a future sprint

**Status (2026-06-01):** Embedded-in-canvas plugin editor (plugin's own UI composited inside Element's canvas, out-of-process) = **DEFERRED**. Ship path = **separate-window editor** (see §Ship path). The spike got far; this doc captures exactly what's proven, the wall, and the resume plan so a future sprint doesn't re-tread.

## What the spike PROVED (do NOT re-prove — high-value findings)
The out-of-process editor pipeline EXECUTES end-to-end; only the final pixel-mirror fails. From live runs (worker log):
1. **Out-of-process plugin LOAD works** — worker process hosts the real VST3 (`Plugin loaded successfully: ValhallaSupermassive`, `formatManager has 2 format(s): AudioUnit, VST3`).
2. **Crash-isolation works** — SIGKILL the worker → Element host survives (proven repeatedly).
3. **Editor creation works** — `editor created 820x435; NSApp=yes` (worker IS GUI-capable), `addToDesktop done`.
4. **Capture source layer is SOUND** — `CARenderer source: layerBacked=y class=NSViewBackingLayer sublayers=2 hasContents=y` (real backing layer, NOT Metal, has content + sublayers).
5. **IOSurface render runs** — `publishing IOSurface-backed layer 1640x870 scale=2.00 mtlDevice=yes renderer=yes` + `render tick #0/#1/#2`.
6. **Valid CAContext published + host wired** — worker `CAContextID=<valid>`; host `CALayerHost contextId set, bounds=884x624, layerBacked=yes`.

## The WALL (the unsolved bit)
Despite all 6 above, the host window is **BLACK**. A sound source layer + valid CAContext + correctly-wired host CALayerHost still does not display pixels. → the failure is in the **cross-process IOSurface → CAContext → CALayerHost pixel propagation**, not in the layer source (that hypothesis is exhausted — the layer demonstrably has content). This matches the research's prior risk call: cross-process embedded editors on macOS use private CALayerHost/CAContext SPI and are L–XL + "may not work with all plugins" (even REAPER ships embedded as best-effort).

## Hard-won environment facts (reuse these)
- **Signing:** the host binary MUST be signed with **hardened runtime + `com.apple.security.cs.disable-library-validation`** (+ allow-jit, allow-unsigned-executable-memory) — else macOS library-validation rejects the 3rd-party VST3 dylib and JUCE reports the generic `No compatible plug-in format exists`. Plain `codesign --sign -` (no entitlements) re-breaks it. Sign cmd: `codesign --force --deep --options runtime --entitlements cmake/entitlements.plist --sign - <app>`.
- **JUCE backing layer:** pass `ComponentPeer::windowRequiresSynchronousCoreGraphicsRendering` to `addToDesktop` — else JUCE makes the editor view async-drawn / a `CAMetalLayer` whose `contents` is empty/uncapturable. With the flag → plain layer-backed view with synchronous CG contents.
- **Worker logging:** install the worker FileLogger BEFORE `SandboxWorker::initialise()` (else format/load logs go to `~/Library/Application Support/Element/log/sandbox_worker.log` and are missed; pre-installed → `~/Library/Logs/rspike/rspike-worker.log`).
- **Launch:** run the binary directly (not `open` — that searches by name + drops the env); `open` won't pass `RSPIKE_VST3`.

## Resume plan — candidate fixes for the cross-process mirror (try in order)
1. **CARenderer frame lifecycle + commit** — confirm `beginFrameAtTime/addUpdateRect:/render/endFrame` is called each tick AND the Metal command buffer is committed + `waitUntilCompleted`, AND the IOSurface is flushed, so pixels actually land in the surface before it's read remotely. (Render ticks log, but pixels may never be committed.)
2. **contextId sign/type round-trip** — worker logged `CAContextID=-1153022721` (signed print of a uint32). Verify the IPC `EditorOpenedPayload.contextId` round-trips as **uint32** on both ends; a sign-mangle → wrong `CALayerHost.contextId` → black.
3. **CAContext layer-tree vs IOSurface contents** — CALayerHost mirrors the CAContext's LAYER; confirm `CAContext.layer` IS the IOSurface-backed `CALayer` and that updating the IOSurface marks the layer's contents changed (re-set `.contents` per tick or `setContentsChanged`).
4. **IOSurface pixel format / colorspace** — BGRA vs RGBA, premultiplied alpha, sRGB — a format mismatch renders-but-shows-black.
5. **Apple-blessed alternative for AU** — `kAudioUnitProperty_RequestViewController` / AUv3 remote view (JUCE already implements it) for AudioUnits = a supported out-of-process view without private SPI. Consider AU-first.
6. **Prior art** — Bitwig + JUCE-forum on macOS cross-process editor (CARemoteLayer family / `NSViewBridge`/`NSRemoteView`).

## Spike code — PRESERVE (the future sprint resumes from here)
Worktree: `.claude/worktrees/agent-a1c2f243783cd6324` (branch `worktree-agent-a1c2f243783cd6324`, base `c4e7c61a`). Key files:
- `tools/rspike/rspike_main.cpp` — standalone harness (worker+host roles, file-poller `/tmp/rspike.cmd`, logs).
- `src/engine/sandboxeditor_worker.mm` — worker editor creation + IOSurface/Metal/CARenderer render path.
- `src/ui/sandboxeditor_host.mm` + `src/ui/sandboxeditor_host.hpp` — `RemoteEditorView` (CALayerHost).
- `src/ui/sandboxeditorembed.hpp` — host glue (input forwarding + crash-safe teardown).
- editor IPC in `src/engine/sandboxipc.hpp` / `sandboxhost.hpp` / `sandboxworker.hpp`.
- `RSPIKE-VERIFY.md` — turnkey run instructions + decision tables.
⚠️ Creating this worktree broke the `clap-juce-extensions` submodule ref → git on main needs `-c submodule.recurse=false` + commits via `--no-verify`. Repair (or `git worktree remove`) once the spike's value is fully extracted — but KEEP it until the embed sprint resumes.

## Ship path NOW (this/next sprint) — separate-window editor
The worker ALREADY creates the plugin editor in a real NSWindow. Production: **show that worker-owned window directly** (position/focus it near the block; it's a real OS window the WindowServer composites normally) instead of mirroring. No CALayerHost, no IOSurface, no input-forwarding. Crash-isolation preserved (editor in worker → crash vanishes its window, host survives). This is REAPER's shipping model. Embedded-in-canvas = this doc's future sprint.
