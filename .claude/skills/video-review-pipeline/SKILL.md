---
name: "Video Review Pipeline"
description: "Turn a narrated screen-recording of Element's UI into actioned, verified fixes via a human-in-the-loop loop. Ingests a video (local file or Loom) → extracts synced transcript + frames + OCR timeline → maps each spoken note to a component/file → YOU approve → applies fixes → re-verifies (build, Storybook tests, AX, visual-verdict) → YOU sign off → logs to ui-comments.jsonl. Use when Glen hands over a feedback video, screen recording, narrated UI critique, or says 'review this recording', 'here's my feedback video', 'action this walkthrough'."
---

# Video Review Pipeline

## What This Skill Does
Converts a **narrated UI feedback video** into verified, signed-off changes for the Element webview. It fuses the `video-analyzer` MCP (what was said + what was shown, time-synced) with Element's existing review tooling, and **gates on Glen at three points** — triage, plan, sign-off — so nothing ships unverified. Honours the project's **NOTHING-fake** rule and **screenshot/AX-gate-before-done** rule.

## Prerequisites
- **Native extractor deps (primary path):** `ffmpeg`, `whisper` (`brew install ffmpeg openai-whisper`), and `yt-dlp` (`brew install yt-dlp`, only for URLs). Keep `OPENAI_API_KEY` unset → transcript stays fully local.
- **Optional:** `video-analyzer` MCP (`mcp__video-analyzer__*`) + `video-localfile` global skill — only if you want the MCP's OCR/annotation. Flaky; not required.
- Element review tooling (all present in-repo): `storybook-element` skill, `verify-element-ui` skill, `oh-my-claudecode:visual-verdict`, `docs/CHROMATIC_FEEDBACK_WORKFLOW.md`, feedback channel `.omo/audit/ui-comments.jsonl`

## The Loop (3 HITL gates)

```
intake → EXTRACT → comprehend → [GATE 1: triage] → log → [GATE 2: plan]
        → apply → re-verify → [GATE 3: sign-off] → close
```

Never skip a gate. Default to ONE feedback item at a time unless Glen says batch.

---

## Step-by-Step

### 0. Intake — get the source
- **Local file:** use the path directly (the native extractor reads files, no serving needed).
- **Loom / URL:** pass the share link or direct `.mp4`/`.webm` URL.

### 1. Extract — NATIVE primary (reliable), MCP optional
**Use the native extractor.** It is fully local (no cloud, no flaky dep) and produces a time-synced `timeline.json` + readable `timeline.md` from frames + Whisper transcript:
```bash
.claude/skills/video-review-pipeline/scripts/extract.sh \
  --src <path-or-url> --out /tmp/review1 --threshold 0.1 --model tiny
# → /tmp/review1/timeline.md  (🗣 narration + 🖼 frame events, sorted by time)
#   /tmp/review1/timeline.json (events[], frameCount, segmentCount, duration)
#   /tmp/review1/frames/*.jpg  (scene-change frames — Read these for visual context)
```
`--threshold 0.1` = screencast-tuned (more frames; lower = more). `--model small` for better transcript accuracy. Read the frame jpgs with the Read tool for OCR/visual analysis.

> **Why native:** the `video-analyzer` MCP (`analyze_video`) works but is young/flaky — it crashed mid-run in testing. Treat it as OPTIONAL: only reach for it (via the `video-localfile` serve → `analyze_video`) when you specifically want its built-in OCR/annotation and it's connected. The native path above is the default and was verified end-to-end (verbatim Whisper transcript + multi-frame scene extraction).

### 2. Comprehend — build the feedback list
Walk the timeline. For each spoken critique produce a row:
| field | from |
|-------|------|
| `timestamp` | transcript entry |
| `quote` | what Glen *said* (verbatim-ish) |
| `frame` | the synced frame at that ts (what's on screen) |
| `target` | component/file — resolve via OCR text + frame → search `webview/src/**` (Storybook story id where possible) |
| `ask` | the concrete change |
| `severity` | P0 blocker · P1 major · P2 normal · P3 nit |

Map targets against real files (use Grep/Glob on `webview/src`, or the `🔍 Review/*` story ids). Do NOT invent components — verify via Storybook MCP / `list-all-documentation` per the `storybook-element` skill.

### 3. GATE 1 — Triage (🔴 Glen)
Present the table. Glen edits/merges/drops/re-prioritises. Lead with a **🔴 YOUR MOVE** banner (per his signposting rule). Wait for confirmation.

### 4. Log to the feedback channel
Append each confirmed item to `.omo/audit/ui-comments.jsonl` (`status:"open"`) using the helper (keeps schema exact):
```bash
python3 .claude/skills/video-review-pipeline/scripts/log-feedback.py \
  --story "review:quickadd:audio" --title "🔍 Review/QuickAdd" \
  --name "<state/variant>" --severity P2 --text "<the ask>"
# prints the generated id — keep it for close-out
```

### 5. GATE 2 — Plan (🔴 Glen)
Propose the fix approach per item (files, component, risk). For multi-file/complex work route to `oh-my-claudecode:executor` (`model=opus` if deep). Glen approves before any edit.

### 6. Apply
Implement. Follow Element conventions (neumorphic tokens, `juce::` qualified headers, etc.). Webview UI → author/adjust the Storybook story too (`storybook-element`). Respect the bundle POST_BUILD gotcha (touch a `.cpp` or force-copy `dist`→bundle if it's a webview-only change).

### 7. Re-verify (evidence before claims)
Per change, collect real evidence — keep authoring and review in separate passes:
- **Type/build:** `cd webview && npx tsc -b` (and `npm run build` if shipping to app)
- **Storybook tests:** `mcp__storybook__run-story-tests` on the affected story (interaction + a11y) — iterate to green
- **Visual:** `mcp__storybook__preview-stories` → screenshot → `oh-my-claudecode:visual-verdict` before/after vs the ask
- **Native UI (if `src/ui/**` touched):** `verify-element-ui` skill (AX assertions, no screenshots)
- **Optional governance:** Chromatic per `docs/CHROMATIC_FEEDBACK_WORKFLOW.md`

### 8. GATE 3 — Sign-off (🔴 Glen)
Show the result — story URL + before/after screenshot (or AX evidence). Glen confirms resolved or sends it back to step 6.

### 9. Close out
Mark the item resolved in the channel:
```bash
python3 .claude/skills/video-review-pipeline/scripts/resolve-feedback.py \
  --id "<id-from-step-4>" --note "<what changed>" --commit "$(git rev-parse --short HEAD)"
```

---

## Guardrails
- **3 gates are mandatory.** No applying without GATE 2, no "done" without GATE 3 + evidence.
- **NOTHING fake** — every changed component shows real engine data; no placeholder/mock ships.
- **Judge interaction, not stills** — for motion/transition feedback lower `--threshold` (e.g. 0.05) for denser frames and weight dynamic UX.
- **Private by default** — local file + native extract (`ffmpeg`+`whisper`) = video never leaves the Mac. Flag explicitly if a Loom/URL source or `OPENAI_API_KEY` sends data out.
- **Don't re-run the bake-off** or wire shelved Dashboard/Macro/Scene UI.

## Scripts
- `scripts/extract.sh` — **native extractor (primary):** file/URL → scene-change frames + Whisper transcript → `timeline.json`/`timeline.md`. No MCP. Flags: `--src --out [--threshold 0.1] [--model tiny] [--lang en] [--no-transcript]`.
- `scripts/log-feedback.py` — append a feedback item to `.omo/audit/ui-comments.jsonl` (schema-exact, generates id).
- `scripts/resolve-feedback.py` — flip an item to `status:"resolved"` with note + commit.

## Troubleshooting
- **0 frames / all one frame** → clip has no hard cuts (gradual motion doesn't trip scene detection); lower `--threshold`, or the mid-point fallback frame is expected for static clips.
- **Transcript empty** → install `openai-whisper` + `ffmpeg` on PATH; check `whisper --help` runs.
- **URL won't download** → `brew install yt-dlp`; for a local file pass the path directly (no download).
- **Target unresolved** → ask Glen to scrub to the moment; re-run `extract.sh` on a trimmed `--src` (ffmpeg `-ss/-to`) for denser coverage of that window.

## Related
- `video-localfile` (global) — local-file → URL bridge this builds on.
- `storybook-element`, `verify-element-ui`, `oh-my-claudecode:visual-verdict` — the verify lane.
- `docs/CHROMATIC_FEEDBACK_WORKFLOW.md` — human visual governance.
