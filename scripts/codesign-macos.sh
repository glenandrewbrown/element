#!/bin/bash
# Element macOS Code Signing Script
# Signs a single binary or bundle with Developer ID and hardened runtime.
#
# IMPORTANT: Do NOT use --deep. Apple deprecated --deep because it signs
# nested bundles in an unpredictable order. Always sign INNERMOST bundles
# first (helpers, plugins), then sign the outer .app last so its seal
# covers the already-signed inner bundles. sign-all-macos.sh enforces this
# order: helpers → plugins → app.
#
# Usage: ./scripts/codesign-macos.sh <path-to-app-or-plugin> [entitlements.plist]
# Env:   DEVELOPER_ID_APP - "Developer ID Application: Name (TEAMID)"
#                           Use "-" or unset for ad-hoc signing (local dev only).
#
# Optional second argument overrides the default entitlements file.
# Default entitlements: cmake/entitlements.plist (app + plugins).
# Sandbox helper uses: cmake/entitlements-sandbox.plist (no audio-input).

set -euo pipefail

# Allow ad-hoc signing when DEVELOPER_ID_APP is not set (local dev / CI without certs).
IDENTITY="${DEVELOPER_ID_APP:--}"

TARGET="${1:?Usage: codesign-macos.sh <path-to-bundle> [entitlements.plist]}"

if [ ! -e "$TARGET" ]; then
    echo "ERROR: Target not found: $TARGET"
    exit 1
fi

echo "=== Signing: $(basename "$TARGET") ==="

# Locate entitlements: caller may pass an explicit path as $2.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -n "${2:-}" ] && [ -f "$2" ]; then
    ENTITLEMENTS="$2"
elif [ -f "$SCRIPT_DIR/../cmake/entitlements.plist" ]; then
    ENTITLEMENTS="$SCRIPT_DIR/../cmake/entitlements.plist"
else
    ENTITLEMENTS=""
    echo "  (no entitlements file found, signing without entitlements)"
fi

if [ -n "${ENTITLEMENTS:-}" ]; then
    echo "  Entitlements: $(basename "$ENTITLEMENTS")"
fi

# NOTE: --deep is intentionally ABSENT. Each nested bundle (helper, plugin)
# must be signed explicitly before the outer bundle that contains it.
# --timestamp requires network access; omit for ad-hoc signing.
if [ "$IDENTITY" = "-" ]; then
    CODESIGN_ARGS=(
        --force
        --options runtime
        --sign "$IDENTITY"
    )
else
    CODESIGN_ARGS=(
        --force
        --timestamp
        --options runtime
        --sign "$IDENTITY"
    )
fi

if [ -n "${ENTITLEMENTS:-}" ]; then
    CODESIGN_ARGS+=(--entitlements "$ENTITLEMENTS")
fi

codesign "${CODESIGN_ARGS[@]}" "$TARGET"

echo "=== Verifying ==="
codesign --verify --verbose=2 "$TARGET"
echo "=== Done: $(basename "$TARGET") ==="
