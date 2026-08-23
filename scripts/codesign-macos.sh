#!/bin/bash
# Element macOS Code Signing Script
# Signs a single binary or bundle with Developer ID and hardened runtime.
#
# Usage: ./scripts/codesign-macos.sh <path-to-app-or-plugin>
# Env:   DEVELOPER_ID_APP - "Developer ID Application: Name (TEAMID)"

set -euo pipefail

IDENTITY="${DEVELOPER_ID_APP:?Set DEVELOPER_ID_APP environment variable}"
TARGET="${1:?Usage: codesign-macos.sh <path-to-bundle>}"

if [ ! -e "$TARGET" ]; then
    echo "ERROR: Target not found: $TARGET"
    exit 1
fi

echo "=== Signing: $(basename "$TARGET") ==="

# Locate entitlements file relative to this script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENTITLEMENTS="$SCRIPT_DIR/../cmake/entitlements.plist"
if [ ! -f "$ENTITLEMENTS" ]; then
    ENTITLEMENTS=""
    echo "  (no entitlements file found, signing without entitlements)"
fi

CODESIGN_ARGS=(
    --force
    --deep
    --timestamp
    --options runtime
    --sign "$IDENTITY"
)

if [ -n "$ENTITLEMENTS" ]; then
    CODESIGN_ARGS+=(--entitlements "$ENTITLEMENTS")
fi

codesign "${CODESIGN_ARGS[@]}" "$TARGET"

echo "=== Verifying ==="
codesign --verify --verbose=2 "$TARGET"
echo "=== Done: $(basename "$TARGET") ==="
