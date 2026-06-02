#!/usr/bin/env bash
# Example QA smoke workflow for the Element bridge.
#
# Demonstrates the actuate → observe → verify loop an agent would script in
# place of manual GUI clicking. Exits non-zero if the QA verdict fails.
#
# Usage:  ./qa_smoke.sh   (Element must be built or installed; this KILLS any
#                          running Element via --fresh to get a clean instance.)
set -euo pipefail

CLI="${CLI:-cli-anything-element}"

echo "▶ launching a fresh Element (OSC enabled)…"
"$CLI" --json app launch --fresh --wait 6 \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('  alive=%s osc_bound=%s pid=%s' % (d['alive'], d['osc_bound'], d['pid'])); sys.exit(0 if d['alive'] else 1)"

echo "▶ driving it over OSC…"
"$CLI" control transport play   >/dev/null
"$CLI" control view graph-editor >/dev/null
"$CLI" control panic            >/dev/null
"$CLI" engine sample-rate 48000 >/dev/null

echo "▶ QA verdict (alive + no crash)…"
if "$CLI" --json verify assert --alive --no-crash \
     | python3 -c "import sys,json; d=json.load(sys.stdin); print('  verdict:', 'PASS' if d['passed'] else 'FAIL'); sys.exit(0 if d['passed'] else 1)"; then
  echo "✓ QA smoke passed"
  STATUS=0
else
  echo "✗ QA smoke FAILED — recent log:"
  "$CLI" app logs --which main --lines 15 || true
  STATUS=1
fi

echo "▶ shutting down (graceful OSC quit)…"
"$CLI" app quit >/dev/null || "$CLI" app kill >/dev/null || true

exit "$STATUS"
