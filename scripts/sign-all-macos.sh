#!/bin/bash
# Element macOS Batch Signing Script
# Signs Element.app and all plugin bundles found in a build directory.
#
# Usage: ./scripts/sign-all-macos.sh <build-dir>
# Env:   DEVELOPER_ID_APP - "Developer ID Application: Name (TEAMID)"
#                           Omit or set to "-" for ad-hoc signing (local dev).
#
# Signing order (INNERMOST-FIRST — Apple requirement, --deep is deprecated):
#   1. Element Sandbox Host helper (nested inside Element.app/Contents/Helpers/)
#   2. Plugin bundles (.component, .vst3, .clap, .lv2) — standalone artefacts
#   3. Element.app (outer bundle last — its seal covers the signed helper)
#
# Verification after signing:
#   codesign --verify --deep --strict --verbose=2 Element.app
#   spctl --assess --type exec --verbose Element.app   (requires Developer ID)
#
# Plugin formats signed: .component (AU), .vst3, .clap, .lv2

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="${1:?Usage: sign-all-macos.sh <build-dir>}"

if [ ! -d "$BUILD_DIR" ]; then
    echo "ERROR: Build directory not found: $BUILD_DIR"
    exit 1
fi

echo "=== Signing all Element binaries in: $BUILD_DIR ==="

SANDBOX_ENTITLEMENTS="$SCRIPT_DIR/../cmake/entitlements-sandbox.plist"
APP_ENTITLEMENTS="$SCRIPT_DIR/../cmake/entitlements.plist"

# ---------------------------------------------------------------------------
# STEP 1 — Sign the sandbox helper BEFORE the outer Element.app.
#
# The helper lives at Element.app/Contents/Helpers/Element Sandbox Host.app.
# It must be signed first so the outer app's seal covers an already-signed
# helper. Uses the least-privilege sandbox entitlements (JIT +
# disable-library-validation; NO device.audio-input — the worker uses shm).
#
# We search for the helper ONLY inside an Element.app subtree so we don't
# accidentally pick up a standalone artefact copy built by CMake.
# ---------------------------------------------------------------------------
echo "--- Step 1: Sign sandbox helper (innermost-first) ---"
find "$BUILD_DIR" -path "*/Element.app/Contents/Helpers/Element Sandbox Host.app" -type d | while read -r helper; do
    echo "  Helper: $helper"
    "$SCRIPT_DIR/codesign-macos.sh" "$helper" "$SANDBOX_ENTITLEMENTS"
done

# Also sign the standalone helper artefact (outside Element.app) if present,
# so it is signed before any future bundling step picks it up.
find "$BUILD_DIR" -name "Element Sandbox Host.app" -type d \
    ! -path "*/Element.app/*" | while read -r helper; do
    echo "  Standalone helper artefact: $helper"
    "$SCRIPT_DIR/codesign-macos.sh" "$helper" "$SANDBOX_ENTITLEMENTS"
done

# ---------------------------------------------------------------------------
# STEP 2 — Sign plugin bundles (.component, .vst3, .clap, .lv2).
# These are standalone artefacts in the build tree, not nested inside
# Element.app, so they can be signed in any order relative to the app.
# ---------------------------------------------------------------------------
echo "--- Step 2: Sign plugin bundles ---"

# Sign AU plugins (exclude any nested inside Element.app to avoid double-sign)
find "$BUILD_DIR" -name "*.component" -type d \
    ! -path "*/Element.app/*" | while read -r plugin; do
    "$SCRIPT_DIR/codesign-macos.sh" "$plugin"
done

# Sign VST3 plugins
find "$BUILD_DIR" -name "*.vst3" -type d \
    ! -path "*/Element.app/*" | while read -r plugin; do
    "$SCRIPT_DIR/codesign-macos.sh" "$plugin"
done

# Sign CLAP plugins
find "$BUILD_DIR" -name "*.clap" -type d \
    ! -path "*/Element.app/*" | while read -r plugin; do
    "$SCRIPT_DIR/codesign-macos.sh" "$plugin"
done

# LV2 plugins: LV2 is a Linux-native format (.so + .ttl files, no macOS bundle
# structure). codesign rejects them as "bundle format unrecognized". Skip them
# here — LV2 on macOS is not code-signed; the containing app is what matters.

# ---------------------------------------------------------------------------
# STEP 3 — Sign Element.app LAST (outer bundle seal covers the signed helper).
# ---------------------------------------------------------------------------
echo "--- Step 3: Sign Element.app (outer bundle, last) ---"
find "$BUILD_DIR" -name "Element.app" -type d | while read -r app; do
    "$SCRIPT_DIR/codesign-macos.sh" "$app"
done

echo "=== All binaries signed ==="
echo ""
echo "To deep-verify the signed app:"
echo "  codesign --verify --deep --strict --verbose=2 <build-dir>/...Element.app"
