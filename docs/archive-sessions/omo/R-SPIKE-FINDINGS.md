# R-SPIKE findings — out-of-process plugin EDITOR feasibility (2026-06-01)

Gate for Pillar-3 (Bitwig-grade reliability). Tracer-bullet prototype in worktree
`.claude/worktrees/agent-a1c2f243783cd6324` (branch `worktree-agent-a1c2f243783cd6324`, base `c4e7c61a`).
Harness: `tools/rspike/rspike_main.cpp` + new `src/ui/sandboxeditorembed.hpp` + `RemoteEditorView` (CALayerHost) + SandboxHost editor API. Built + ad-hoc signed.

## Run (ValhallaSupermassive VST3, careful headless-driven, host pid 28994 / worker 28998)

### ✅ PROVEN
1. **Out-of-process plugin LOAD** — `[SandboxedProcessor] Plugin loaded: ValhallaSupermassive` in the worker process; shared memory `/el_sb_28994_0` created. The plugin runs in a separate process.
2. **Process-level crash ISOLATION** — after `kill` command (SIGKILL worker while editor open), the **host process stayed alive** (textual + visual: rspike host window still present after kill). Element does NOT die when the plugin process dies. **This is the core Bitwig reliability win.**

### ❌ NOT PROVEN (appears to fail)
3. **Editor RENDER across the process boundary** — the host window was **BLACK** (no plugin editor mirrored). The log stopped at `[rspike] >>> open editor requested` with no editor-opened completion. So the `OpenEditor` IPC handshake did not visibly complete → `RemoteEditorView`/`CALayerHost` had no `CAContext` to mirror → black.

### Suspected cause (to diagnose, not yet confirmed)
- The editor-hosting **worker is dock-hidden / headless** (`Process::setDockIconVisible(false)`) — a headless/agent process may lack the WindowServer/Aqua connection required to create an `NSView` + publish a `CAContext`. Likely needs the editor-worker to be GUI-capable.
- OR the `OpenEditor` worker-side handler (create editor NSView → attach layer + CAContext → return contextId) is incomplete in the prototype.
- Either is plausibly fixable; neither is proven a hard wall.

### Confounds (not product issues)
- My `osascript` "set frontmost" + `screencapture` triggered macOS Accessibility / Screen-Recording permission prompts → cluttered the captures (System Settings/password dialogs visible). Did NOT cause the black editor content (the app renders that itself). Avoid osascript next run.
- "worker still alive" after kill = likely SandboxHost auto-restart spawning a new worker pid (check used the old pid), not a failed kill.

## Architecture built (sound design, compiles)
`SandboxEditorEmbed` (host Component + SandboxHost::Listener): openEditor() → on EditorOpened mirror worker CAContext via RemoteEditorView → forward mouse/key/wheel → **blank cleanly on crash/close (clearContext before teardown — the cross-process teardown safety the architect flagged as the hard part)**. SandboxHost gained openEditor/closeEditor/forwardEditorInput + editor listener callbacks.

## VERDICT: PARTIAL — foundation GO, embedded-editor UNPROVEN
- Sandbox **load + crash-isolation work** (proven) → crash-safe plugin hosting is achievable now.
- The **embedded out-of-process editor** (CALayerHost) — the L-XL long pole the research flagged "may not work with all plugins" — **does not render yet**. One careful run = black; cause looks like headless-worker GUI-capability or an incomplete handshake.

## Recommendation
1. **Short diagnosis pass (½ day)** on the embed: make the editor-worker GUI-capable (it must create NSView/CAContext) + confirm the OpenEditor handshake completes (log contextId). Outcome = quick-fix (→ continue embed) vs wall.
2. If it hits a wall → **B-fallback (REAPER-proven): separate-window editor** — the sandboxed plugin's editor opens in its OWN window from the worker (crash-isolated), not composited into Element's canvas. Delivers the reliability goal (crash can't kill host + editors work) WITHOUT the uncertain CALayerHost embedding; embedded-in-canvas becomes post-ship polish. Glen rejected this pre-evidence; now evidence-justified as the pragmatic path if embed stalls.

**Escalated to Glen 2026-06-01** per the plan's numeric go/no-go (hard criteria not all green → owner re-decision). Worktree preserved for the diagnosis pass.

## Diagnosis (code-level, 2026-06-01) — NOT A WALL
Read the full worker impl `src/engine/sandboxeditor_worker.mm` + host `sandboxeditor_host.mm` + the IPC. Conclusions:
- **Fully implemented + sound approach.** `sandbox_editor_worker::openEditor` creates the plugin editor on the message thread, parents its NSView under a layer-backed NSWindow, publishes the content layer via `CAContext` (`CGSMainConnectionID` + `contextWithCGSConnection` / `remoteContextWithOptions` fallback), returns the `contextId`. Host `RemoteEditorView` sets `CALayerHost.contextId` to mirror. Input forwarding (synthesised NSEvents against the offscreen window) + crash-safe teardown (drop layer → removeFromDesktop → close window) all present. IPC handshake fully wired (OpenEditor→EditorOpened{contextId,w,h}→sandboxEditorOpened→setContextId).
- **The agent already found the #1 gotcha** (code comment lines 104-117): a *fully* offscreen NSWindow is never composited → empty/black CAContext. Workaround in place: keep the source window on-screen-but-behind (`orderBack`, `RSPIKE_WORKER_VISIBLE=1`) so the WindowServer allocates a real backing surface. Flagged the **production fix = off-screen IOSurface-backed CALayer render path**.
- **Why my run was still black: UNCONFIRMED.** The worker's own diagnostic logs (`NSApp=yes/nil`, `editor produced no NSView`, `failed to create CAContext`, `CAContextID=…`) go to the CHILD process and were not captured (worker role sets no FileLogger; host's rspike.log only shows host-side lines). Leading candidates: worker process not getting a composited WindowServer surface (GUI-session/entitlement), or a failure step, or the visible-window hack not taking.
- **Verdict: promising / GO-leaning, NOT proven.** The mechanism is sound + the known black-screen trap was handled; the remaining black is most likely a fixable worker-compositing detail (the IOSurface path the agent named), not a fundamental block. Do NOT call GO until a plugin editor is seen mirroring.

### Bounded continuation (recommended over the separate-window pivot)
1. Re-run with the WORKER's stdout/log captured (set a worker-side FileLogger or redirect child output) → pinpoint the exact failure step.
2. Apply the off-screen IOSurface-backed CALayer render path (removes the on-screen-window dependency + GUI-session fragility).
3. One verification run (best judged live — Glen runs it, or lead runs briefly) → real GO/NO-GO.
