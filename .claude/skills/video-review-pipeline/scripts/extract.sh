#!/usr/bin/env bash
# extract.sh — native, fully-local video extractor for the video-review-pipeline.
#
# Replaces the flaky video-analyzer MCP for the extract step: takes a local file
# OR a URL and produces scene-change frames + a Whisper transcript, merged into a
# time-synced timeline.json (+ human-readable timeline.md). No cloud, no MCP.
#
# Deps: ffmpeg (+ffprobe), whisper (openai-whisper), yt-dlp (only for URLs), python3.
#
# Usage:
#   extract.sh --src /path/feedback.mp4 --out /tmp/review1
#   extract.sh --src https://www.loom.com/share/... --out /tmp/review1
#   extract.sh --src clip.mp4 --out out --threshold 0.1 --model tiny
#
# Flags: --threshold N (scene sensitivity 0..1, default 0.1) · --model NAME
#        (whisper model, default tiny) · --lang CODE (default en) · --no-transcript
set -euo pipefail

SRC="" OUT="" TH="0.1" MODEL="tiny" LANG="en" DO_TX=1
while [ $# -gt 0 ]; do
  case "$1" in
    --src) SRC="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    --threshold) TH="$2"; shift 2;;
    --model) MODEL="$2"; shift 2;;
    --lang) LANG="$2"; shift 2;;
    --no-transcript) DO_TX=0; shift;;
    *) echo "ERROR: unknown arg '$1'" >&2; exit 1;;
  esac
done
[ -n "$SRC" ] && [ -n "$OUT" ] || { echo "Usage: extract.sh --src <url|path> --out <dir> [--threshold 0.1] [--model tiny] [--lang en] [--no-transcript]" >&2; exit 1; }

command -v ffmpeg >/dev/null || { echo "ERROR: ffmpeg not found" >&2; exit 1; }
mkdir -p "$OUT/frames"

# 1. Resolve source → a local media file.
LOCAL="$SRC"
if printf '%s' "$SRC" | grep -qiE '^https?://'; then
  command -v yt-dlp >/dev/null || { echo "ERROR: yt-dlp needed for URLs (brew install yt-dlp)" >&2; exit 1; }
  echo "Downloading via yt-dlp..." >&2
  yt-dlp -q --no-warnings -o "$OUT/source.%(ext)s" "$SRC"
  LOCAL=$(ls "$OUT"/source.* 2>/dev/null | head -1)
  [ -n "$LOCAL" ] || { echo "ERROR: yt-dlp produced no file" >&2; exit 1; }
fi
[ -f "$LOCAL" ] || { echo "ERROR: source not found: $LOCAL" >&2; exit 1; }
DUR=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$LOCAL" 2>/dev/null || echo 0)

# 2. Scene-change frames + their timestamps (parsed from showinfo).
echo "Extracting scene frames (threshold=$TH)..." >&2
ffmpeg -nostdin -loglevel info -y -i "$LOCAL" \
  -vf "select='gt(scene,$TH)',showinfo" -vsync vfr -q:v 3 "$OUT/frames/f_%04d.jpg" \
  2> "$OUT/.showinfo.txt" || true
grep -o 'pts_time:[0-9.]*' "$OUT/.showinfo.txt" 2>/dev/null | cut -d: -f2 > "$OUT/.frametimes.txt" || true

# Guard: static clip → no scene cuts. Grab a single mid-point frame so we never return zero.
if [ ! -s "$OUT/.frametimes.txt" ]; then
  echo "No scene changes detected — sampling one mid-point frame." >&2
  MID=$(python3 -c "print(max(0,float('$DUR')/2))")
  ffmpeg -nostdin -loglevel error -y -ss "$MID" -i "$LOCAL" -frames:v 1 -q:v 3 "$OUT/frames/f_0001.jpg"
  echo "$MID" > "$OUT/.frametimes.txt"
fi

# 3. Whisper transcript (local, timestamped JSON).
TX_JSON=""
if [ "$DO_TX" = "1" ]; then
  if command -v whisper >/dev/null; then
    echo "Transcribing with whisper (model=$MODEL)..." >&2
    mkdir -p "$OUT/.w"
    whisper "$LOCAL" --model "$MODEL" --language "$LANG" --output_format json --output_dir "$OUT/.w" >/dev/null 2>&1 || true
    TX_JSON=$(ls "$OUT/.w"/*.json 2>/dev/null | head -1)
  else
    echo "WARN: whisper not found — skipping transcript (brew install openai-whisper)." >&2
  fi
fi

# 4. Merge frames + transcript → timeline.json + timeline.md.
python3 - "$OUT" "$TX_JSON" "$DUR" <<'PY'
import json, os, sys
out, tx_json, dur = sys.argv[1], sys.argv[2], sys.argv[3]
frames_dir = os.path.join(out, "frames")
times = []
ftf = os.path.join(out, ".frametimes.txt")
if os.path.exists(ftf):
    times = [float(x) for x in open(ftf).read().split() if x.strip()]
frame_files = sorted(f for f in os.listdir(frames_dir) if f.endswith(".jpg"))
frames = [{"t": round(times[i], 2) if i < len(times) else None,
           "file": os.path.join(frames_dir, f)} for i, f in enumerate(frame_files)]

segs = []
if tx_json and os.path.exists(tx_json):
    data = json.load(open(tx_json))
    for s in data.get("segments", []):
        segs.append({"t": round(s["start"], 2), "end": round(s["end"], 2), "text": s["text"].strip()})

events = ([{"t": s["t"], "kind": "say", "text": s["text"]} for s in segs] +
          [{"t": f["t"] if f["t"] is not None else 0.0, "kind": "frame", "file": f["file"]} for f in frames])
events.sort(key=lambda e: e["t"])

timeline = {"duration": round(float(dur), 2) if dur else None,
            "frameCount": len(frames), "segmentCount": len(segs), "events": events}
json.dump(timeline, open(os.path.join(out, "timeline.json"), "w"), indent=1, ensure_ascii=False)

def mmss(t):
    t = int(t); return f"{t//60}:{t%60:02d}"
lines = [f"# Extract timeline — {len(segs)} narration segs · {len(frames)} frames · {timeline['duration']}s\n"]
for e in events:
    if e["kind"] == "say":
        lines.append(f"- **{mmss(e['t'])}** 🗣  {e['text']}")
    else:
        lines.append(f"- **{mmss(e['t'])}** 🖼  `{os.path.basename(e['file'])}`")
open(os.path.join(out, "timeline.md"), "w").write("\n".join(lines) + "\n")
print(f"OK frames={len(frames)} segments={len(segs)} -> {out}/timeline.json + timeline.md")
PY

rm -f "$OUT/.showinfo.txt" "$OUT/.frametimes.txt" 2>/dev/null || true
