#!/bin/bash
# Element macOS Batch Signing Script
# Signs Element.app and all plugin bundles found in a build directory.
#
# Usage: ./scripts/sign-all-macos.sh <build-dir>
# Env:   DEVELOPER_ID_APP - "Developer ID Application: Name (TEAMID)"
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

SIGNED_COUNT=0

# Sign standalone application
find "$BUILD_DIR" -name "Element.app" -type d | while read -r app; do
    "$SCRIPT_DIR/codesign-macos.sh" "$app"
    SIGNED_COUNT=$((SIGNED_COUNT + 1))
done

# Sign AU plugins
find "$BUILD_DIR" -name "*.component" -type d | while read -r plugin; do
    "$SCRIPT_DIR/codesign-macos.sh" "$plugin"
    SIGNED_COUNT=$((SIGNED_COUNT + 1))
done

# Sign VST3 plugins
find "$BUILD_DIR" -name "*.vst3" -type d | while read -r plugin; do
    "$SCRIPT_DIR/codesign-macos.sh" "$plugin"
    SIGNED_COUNT=$((SIGNED_COUNT + 1))
done

# Sign CLAP plugins
find "$BUILD_DIR" -name "*.clap" -type d | while read -r plugin; do
    "$SCRIPT_DIR/codesign-macos.sh" "$plugin"
    SIGNED_COUNT=$((SIGNED_COUNT + 1))
done

# Sign LV2 plugins
find "$BUILD_DIR" -name "*.lv2" -type d | while read -r plugin; do
    "$SCRIPT_DIR/codesign-macos.sh" "$plugin"
    SIGNED_COUNT=$((SIGNED_COUNT + 1))
done

echo "=== All binaries signed ==="
