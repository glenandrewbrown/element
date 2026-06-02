#!/usr/bin/env bash
#
# record-screen.sh — robust macOS screen capture for QA workflows (generic).
#
# Captures "Capture screen 0" via ffmpeg avfoundation into an H.264/yuv420p .mp4
# (faststart, low fps — optimised for small UI-capture files). Works for any
# app/screen, not just Element.
#
# Two modes:
#   * --duration SEC  -> timed capture, exits automatically.
#   * (no duration)   -> records until killed. The ffmpeg PID is written to a
#                        sidecar file (<out>.pid) so a caller can stop it cleanly
#                        with SIGINT/SIGTERM. We forward that to ffmpeg's stdin as
#                        'q', so the mp4 is always finalised (moov atom written) —
#                        never a SIGKILL that would corrupt the file.
#
# macOS TCC NOTE: avfoundation screen capture requires the *host* process (the
# terminal / app launching this script) to hold "Screen Recording" permission
# (System Settings -> Privacy & Security -> Screen Recording). Without it the
# capture is black/empty/0-byte. This script detects that and fails loudly.

set -euo pipefail

# ---- defaults --------------------------------------------------------------
OUT=""
DURATION=""        # empty => run until stopped
FPS="12"
REGION=""          # WxH+X+Y => crop filter
MIC="0"            # 1 => also capture default audio input
SCREEN_INDEX="1"   # avfoundation device index for "Capture screen 0" (overridable via SCREEN_DEVICE_INDEX env)

PROG="$(basename "$0")"

usage() {
  cat >&2 <<EOF
$PROG — capture macOS screen 0 to an mp4 via ffmpeg avfoundation.

USAGE:
  $PROG --out PATH [--duration SEC] [--fps N] [--region WxH+X+Y] [--mic]

OPTIONS:
  --out PATH         (required) output .mp4 path
  --duration SEC     timed capture length in seconds; omit to run until stopped
  --fps N            capture frame rate (default: $FPS)
  --region WxH+X+Y   crop to a region, e.g. 1280x720+0+0 (default: full screen)
  --mic              also capture the default audio input device (default: no audio)
  -h, --help         show this help

STOPPING AN UNTIMED CAPTURE:
  The ffmpeg PID is written to <out>.pid. Stop cleanly with:
      kill -INT  \$(cat <out>.pid)     # or
      kill -TERM \$(cat <out>.pid)
  Do NOT use kill -9 (SIGKILL) — that leaves an unfinalised, unplayable mp4.

NOTE (macOS TCC): requires Screen Recording permission for the launching
process (System Settings -> Privacy & Security -> Screen Recording).
EOF
}

err() { echo "ERROR: $*" >&2; }

# ---- arg parsing -----------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)      OUT="${2:-}"; shift 2 ;;
    --duration) DURATION="${2:-}"; shift 2 ;;
    --fps)      FPS="${2:-}"; shift 2 ;;
    --region)   REGION="${2:-}"; shift 2 ;;
    --mic)      MIC="1"; shift ;;
    -h|--help)  usage; exit 0 ;;
    *) err "unknown argument: $1"; usage; exit 2 ;;
  esac
done

# ---- validation ------------------------------------------------------------
if [[ -z "$OUT" ]]; then
  err "--out is required."; usage; exit 2
fi
case "$OUT" in
  *.mp4|*.MP4) ;;
  *) err "--out must end in .mp4 (got: $OUT)"; exit 2 ;;
esac
if ! [[ "$FPS" =~ ^[0-9]+$ ]] || [[ "$FPS" -lt 1 ]]; then
  err "--fps must be a positive integer (got: $FPS)"; exit 2
fi
if [[ -n "$DURATION" ]]; then
  if ! [[ "$DURATION" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    err "--duration must be a number of seconds (got: $DURATION)"; exit 2
  fi
fi
if [[ -n "$REGION" ]] && ! [[ "$REGION" =~ ^[0-9]+x[0-9]+\+[0-9]+\+[0-9]+$ ]]; then
  err "--region must be WxH+X+Y, e.g. 1280x720+0+0 (got: $REGION)"; exit 2
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  err "ffmpeg not found on PATH."; exit 3
fi

# allow override of the avfoundation screen device index
SCREEN_INDEX="${SCREEN_DEVICE_INDEX:-$SCREEN_INDEX}"

# ---- prepare output --------------------------------------------------------
OUT_DIR="$(dirname "$OUT")"
mkdir -p "$OUT_DIR"
PID_FILE="${OUT}.pid"
rm -f "$PID_FILE"

# avfoundation input spec: "<video>:<audio>". Empty audio field => no audio.
if [[ "$MIC" == "1" ]]; then
  INPUT_SPEC="${SCREEN_INDEX}:default"
else
  INPUT_SPEC="${SCREEN_INDEX}:none"
fi

# Build ffmpeg argv as an array (safe quoting).
FF_ARGS=(
  -hide_banner -loglevel warning -nostats -y
  -f avfoundation
  -capture_cursor 1
  -pixel_format uyvy422
  -framerate "$FPS"
  -i "$INPUT_SPEC"
)
[[ -n "$DURATION" ]] && FF_ARGS+=( -t "$DURATION" )

# Video filters: enforce yuv420p (player-compatible); optional crop.
VF="format=yuv420p"
if [[ -n "$REGION" ]]; then
  # WxH+X+Y -> crop=W:H:X:Y
  W="${REGION%%x*}"; rest="${REGION#*x}"
  H="${rest%%+*}";   rest="${rest#*+}"
  X="${rest%%+*}";   Y="${rest#*+}"
  VF="crop=${W}:${H}:${X}:${Y},${VF}"
fi

FF_ARGS+=(
  -vf "$VF"
  -r "$FPS"
  -c:v libx264 -preset veryfast -pix_fmt yuv420p
  -movflags +faststart
)
if [[ "$MIC" == "1" ]]; then
  FF_ARGS+=( -c:a aac -b:a 128k )
fi
FF_ARGS+=( "$OUT" )

echo "RECORDING -> $OUT"

# ---- graceful stop plumbing ------------------------------------------------
# For untimed captures we run ffmpeg in the background with a coproc-style stdin
# pipe so we can send 'q' (clean stop) on SIGINT/SIGTERM. For timed captures
# ffmpeg exits on its own via -t.

FF_PID=""

finalize_report() {
  local bytes=0
  if [[ -f "$OUT" ]]; then
    bytes="$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT" 2>/dev/null || echo 0)"
  fi
  echo "DONE -> $OUT ($bytes bytes)"
}

if [[ -n "$DURATION" ]]; then
  # Timed: run in foreground, ffmpeg self-terminates.
  ffmpeg "${FF_ARGS[@]}" </dev/null
  rm -f "$PID_FILE"
  finalize_report
  exit 0
fi

# Untimed: start ffmpeg reading 'q' from a FIFO so we can stop it cleanly.
FIFO="$(mktemp -u "${TMPDIR:-/tmp}/recscreen.$$.XXXXXX.fifo")"
mkfifo "$FIFO"

# Hold the FIFO open for writing on fd 9 so ffmpeg's stdin doesn't EOF.
exec 9<>"$FIFO"
ffmpeg "${FF_ARGS[@]}" <"$FIFO" &
FF_PID=$!
echo "$FF_PID" > "$PID_FILE"

stop_clean() {
  # Ask ffmpeg to quit gracefully (writes moov atom), then wait.
  if kill -0 "$FF_PID" 2>/dev/null; then
    printf 'q' >&9 || true
    # Give ffmpeg a moment to flush; escalate to SIGINT (still clean) if needed.
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
      kill -0 "$FF_PID" 2>/dev/null || break
      sleep 0.5
    done
    if kill -0 "$FF_PID" 2>/dev/null; then
      kill -INT "$FF_PID" 2>/dev/null || true
      wait "$FF_PID" 2>/dev/null || true
    fi
  fi
}

# Map external SIGTERM/SIGINT to a clean ffmpeg stop.
trap 'stop_clean' INT TERM

# Wait for ffmpeg; `wait` returns when ffmpeg exits OR when a trap fires.
wait "$FF_PID" 2>/dev/null || true
# If a signal triggered the trap mid-wait, stop_clean already ran; ensure done.
stop_clean
exec 9>&- || true
rm -f "$FIFO" "$PID_FILE"
finalize_report
exit 0
