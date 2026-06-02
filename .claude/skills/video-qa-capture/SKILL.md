---
name: "Video QA Capture"
description: "Produce Claude's OWN screen-recorded QA walkthrough of Element's UI, then feed it into the video-review-pipeline. Pick a flow → DRIVE the UI (playwright/chrome-devtools for the webview + Storybook, computer-use/AX for the native JUCE app) → screen-record it → narrate via a sidecar notes file or a macOS `say` audio track → trim/edit with ffmpeg → hand the clip to video-localfile + analyze_video (or the video-review-pipeline skill). Use when asked to 'QA capture', 'record the UI', 'capture a walkthrough', 'self-test the UI on video', 'make a feedback video of X', or self-produce a UI critique clip."
---

# Video QA Capture

## Overview
Turns Claude into the **producer** of Element UI QA clips (not just the consumer). You choose a flow, drive the UI, screen-record the run, optionally narrate, trim, then hand the clip straight into the existing **`video-review-pipeline`** (or directly via **`video-localfile`** → `analyze_video`). Honours Element's **NOTHING-fake**, **AX/screenshot-gate-before-done**, and **judge-interaction-not-stills** rules.

## Prerequisites
- macOS (Intel x86_64), `ffmpeg` + `screencapture` present.
- Capture script alongside this skill: `scripts/record-screen.sh` — flags `--out PATH`, `--duration SEC` (or run-until-stopped), optional `--region`, optional `--mic`.
- Drive tools: **playwright** or **chrome-devtools** MCP (webview / Storybook — DOM-aware); **computer-use** MCP (`request_access` first) or AX tooling (native JUCE window).
- Sibling skills: `video-localfile` (global; `~/.claude/skills/video-localfile/scripts/serve-video.sh`), `video-review-pipeline` (project), `storybook-element`, `verify-element-ui`.
- `video-analyzer` MCP connected (`mcp__video-analyzer__*`).

## Quick Start
```
1. Pick a flow + write the expected-behaviour sidecar notes.
2. record-screen.sh --out /tmp/qa.mov   (run_in_background)
3. Drive the UI (playwright / chrome-devtools / computer-use).
4. Stop the recording.  [optional: mux a `say` narration track]
5. Trim with ffmpeg if needed.
6. Hand off → video-localfile serve → analyze_video, OR invoke video-review-pipeline.
```

---

## Step-by-Step

### 1. Plan the flow
Choose ONE concrete Element flow (e.g. QuickAdd at cursor, dive-into-Board, signal→meter response, Edit↔Perform). Write down the **steps + expected behaviour** — this becomes the sidecar (narration option A). Do NOT script flows through shelved Dashboard/Macro/Scene UI.

### 2. Start recording
Launch the capture in the background so you can drive while it records:
```bash
.claude/skills/video-qa-capture/scripts/record-screen.sh --out /tmp/qa-<flow>.mov   # run_in_background: true
# optional: --duration 30 for a fixed clip, --region for a sub-rect, --mic for live audio
```

### 3. Drive the UI (the actual QA)
- **Webview / Storybook** (`localhost:6006` or `:5173`): use **playwright** or **chrome-devtools** MCP — DOM-aware clicks/typing/waits, reliable. Verify components/props via the Storybook MCP per `storybook-element` (don't invent components).
- **Native JUCE window:** use **computer-use** MCP (`request_access` first) or the AX tooling (`verify-element-ui` / `inspect-ax-tree`).
- Exercise **real engine state** (NOTHING-fake): play signal so meters move, load a real plugin, etc. Weight **dynamic** behaviour (transitions, cable pulses, nav nested-state) — that's what the burst frames will judge.

### 4. Stop + (optional) narrate
Stop the background recording. Self-capture has **no human voice**, so add narration one of two ways:
- **(A) Sidecar notes (lighter):** write `/tmp/qa-<flow>.notes.md` with the steps + expected behaviour + per-timestamp callouts. The pipeline reads it alongside frames + OCR. Fastest; no audio.
- **(B) `say` audio track (true narrated walkthrough):** synth narration and mux it on so `analyze_video`'s transcript step has real audio:
```bash
say -o /tmp/narration.aiff "QuickAdd opens at the cursor; the audio meter should rise as the synth plays."
ffmpeg -i /tmp/qa-<flow>.mov -i /tmp/narration.aiff -c:v copy -c:a aac -shortest /tmp/qa-<flow>-narrated.mov
```
Use (B) when you want a human-style walkthrough; (A) when you just need notes.

### 5. Edit / trim
Native ffmpeg for trims and crop:
```bash
ffmpeg -ss 00:00:03 -to 00:00:18 -i /tmp/qa-<flow>.mov -c copy /tmp/qa-trim.mov
```
Optional polish (zoom / annotate / speed-ramps): the CLI-Hub **"Openscreen"** tool (see `cli-hub-meta-skill`).

### 6. Hand off
Either path:
- **Direct:** invoke `video-localfile` → run `serve-video.sh /tmp/qa-trim.mov` (`run_in_background`), read `VIDEO_URL=`, then
  `mcp__video-analyzer__analyze_video(url, { detail: "detailed", threshold: 0.1 })` (screencast-tuned). Use `get_frame_burst` for motion.
- **Full loop:** invoke the **`video-review-pipeline`** skill with the file (+ the sidecar notes) — it runs the 3 HITL gates and logs to `.omo/audit/ui-comments.jsonl`.

---

## Guardrails
- **NOTHING fake** — capture real engine data (signal→meter > 0, real plugins). No idle/mock states stand in as "working".
- **Judge interaction, not stills** — drive + record motion; rely on `get_frame_burst`, not single frames.
- **AX/screenshot-gate** — confirm the flow actually rendered before claiming the capture is valid.
- **Don't wire/record shelved Dashboard, Macro, or Scene UI.**
- **Private by default** — local capture + loopback serve keeps the video on the Mac; flag any path that sends data out.
- This skill **produces** clips; it does not own the review gates — chain to `video-review-pipeline` for sign-off.

## Troubleshooting
- **No screen-recording permission** → grant Terminal/the host app Screen Recording in System Settings → Privacy.
- **computer-use clicks blocked** → call `request_access`; browsers/terminals are tier-restricted, drive the webview via playwright/chrome-devtools instead.
- **Empty frames in analyze_video** → re-serve via `video-localfile` with `--mp4`, or raise detail to `"detailed"`.
- **No audio transcript** → you used sidecar (A); switch to the `say`+ffmpeg mux (B) if you need a spoken track.

## Related
- `scripts/record-screen.sh` — the capture command (this skill).
- `video-localfile` (global) — local file → loopback URL for `analyze_video`.
- `video-review-pipeline` (project) — the 3-gate review loop this feeds.
- `storybook-element`, `verify-element-ui`, `inspect-ax-tree` — drive/verify the webview + native UI.
- `cli-hub-meta-skill` → "Openscreen" — optional zoom/annotate/speed-ramp polish.
