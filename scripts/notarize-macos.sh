#!/bin/bash
# Element macOS Notarization Script
# Submits a PKG or DMG to Apple for notarization and staples the ticket.
#
# Usage: ./scripts/notarize-macos.sh <path-to-pkg-or-dmg>
# Env:   NOTARIZE_APPLE_ID  - Apple ID email
#        NOTARIZE_PASSWORD   - App-specific password (not your Apple ID password)
#        NOTARIZE_TEAM_ID    - Developer team ID (e.g. "ABC123DEF4")

set -euo pipefail

APPLE_ID="${NOTARIZE_APPLE_ID:?Set NOTARIZE_APPLE_ID}"
PASSWORD="${NOTARIZE_PASSWORD:?Set NOTARIZE_PASSWORD (app-specific password)}"
TEAM_ID="${NOTARIZE_TEAM_ID:?Set NOTARIZE_TEAM_ID}"
TARGET="${1:?Usage: notarize-macos.sh <path-to-pkg-or-dmg>}"

if [ ! -f "$TARGET" ]; then
    echo "ERROR: File not found: $TARGET"
    exit 1
fi

echo "=== Submitting for notarization: $(basename "$TARGET") ==="
xcrun notarytool submit "$TARGET" \
    --apple-id "$APPLE_ID" \
    --password "$PASSWORD" \
    --team-id "$TEAM_ID" \
    --wait

echo "=== Stapling ==="
xcrun stapler staple "$TARGET"

echo "=== Verifying ==="
spctl --assess --type install --verbose=2 "$TARGET" 2>&1 || true
echo "=== Done ==="
