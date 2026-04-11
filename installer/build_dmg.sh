#!/bin/bash
# Element macOS DMG Installer Builder
# Wraps the PKG installer in a professional DMG with background and layout
#
# Usage: ./installer/build_dmg.sh [version] [build-dir] [output-dir]
# Example: ./installer/build_dmg.sh 1.1.0 build-release installer/output

set -e

VERSION="${1:-1.0.0}"
BUILD_DIR="${2:-build-release}"
OUTPUT_DIR="${3:-installer/output}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Match build_pkg.sh: CFBundleVersion is the PKG filename (e.g. 2.2.0.16).
APP_PLIST=""
if [ -f "$PROJECT_ROOT/$BUILD_DIR/element_app_artefacts/Release/Element.app/Contents/Info.plist" ]; then
    APP_PLIST="$PROJECT_ROOT/$BUILD_DIR/element_app_artefacts/Release/Element.app/Contents/Info.plist"
elif [ -f "$PROJECT_ROOT/$BUILD_DIR/element_app_artefacts/Element.app/Contents/Info.plist" ]; then
    APP_PLIST="$PROJECT_ROOT/$BUILD_DIR/element_app_artefacts/Element.app/Contents/Info.plist"
fi

FULL_VERSION=""
SHORT_VERSION="$VERSION"
if [ -n "$APP_PLIST" ]; then
    FULL_VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$APP_PLIST" 2>/dev/null || true)
    SHORT_VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP_PLIST" 2>/dev/null || echo "$VERSION")
fi
if [ -z "$FULL_VERSION" ]; then
    BN=$(cat "$PROJECT_ROOT/build_number.txt" 2>/dev/null | tr -d '[:space:]' || echo "1")
    FULL_VERSION="${VERSION}.${BN}"
fi

# Find the PKG (must match productbuild output from build_pkg.sh)
PKG_PATH="$PROJECT_ROOT/$OUTPUT_DIR/Element-${FULL_VERSION}.pkg"
if [ ! -f "$PKG_PATH" ]; then
    PKG_PATH="$PROJECT_ROOT/$OUTPUT_DIR/Element-${SHORT_VERSION}.pkg"
fi

DMG_PATH="$PROJECT_ROOT/$OUTPUT_DIR/Element-${FULL_VERSION}.dmg"
DMG_STAGING="$PROJECT_ROOT/$OUTPUT_DIR/dmg_staging"
DMG_VOLUME_NAME="Element ${FULL_VERSION}"

echo "=== Element DMG Builder ==="
echo "Version: $FULL_VERSION"
echo ""

# Step 1: Build the PKG if it doesn't exist
if [ ! -f "$PKG_PATH" ]; then
    echo "PKG not found, building first..."
    bash "$SCRIPT_DIR/build_pkg.sh" "$VERSION" "$BUILD_DIR" "$OUTPUT_DIR"
fi

if [ ! -f "$PKG_PATH" ]; then
    echo "ERROR: PKG build failed — $PKG_PATH not found"
    exit 1
fi

echo "Using PKG: $PKG_PATH ($(du -h "$PKG_PATH" | cut -f1))"

# Step 2: Clean and create staging directory
rm -rf "$DMG_STAGING"
mkdir -p "$DMG_STAGING"

# Step 3: Copy PKG into staging
cp "$PKG_PATH" "$DMG_STAGING/Install Element.pkg"

# Step 4: Create README
cat > "$DMG_STAGING/README.txt" << 'READMEEOF'
Element - Modular Audio Plugin Host
====================================
Version: FULLVERSIONPLACEHOLDER
Copyright (C) 2017-2026 Kushview, LLC
License: GPL-3.0-or-later

INSTALLATION
------------
Double-click "Install Element.pkg" to run the installer.

The installer will place:
  - Element.app in /Applications
  - AU plugins in /Library/Audio/Plug-Ins/Components/
  - VST3 plugins in /Library/Audio/Plug-Ins/VST3/
  - CLAP plugins in /Library/Audio/Plug-Ins/CLAP/
  - LV2 plugins in /Library/Audio/Plug-Ins/LV2/

Any existing Element installation will be cleanly removed first.
Your presets and preferences are preserved.

FIRST LAUNCH
------------
If macOS says "Element can't be opened":
  1. Right-click Element.app > Open > Open
  2. This is only needed once

After installing plugins, restart your DAW to see them.

UNINSTALL
---------
To remove Element, delete:
  - /Applications/Element.app
  - /Library/Audio/Plug-Ins/Components/KV-Element*.component
  - /Library/Audio/Plug-Ins/VST3/KV-Element*.vst3
  - /Library/Audio/Plug-Ins/CLAP/KV-Element*.clap
  - /Library/Audio/Plug-Ins/LV2/KV-Element*.lv2

SUPPORT
-------
https://kushview.net
READMEEOF

# Replace version placeholder
sed -i '' "s/FULLVERSIONPLACEHOLDER/$FULL_VERSION/g" "$DMG_STAGING/README.txt"

# Step 5: Copy license
if [ -f "$PROJECT_ROOT/LICENSES/GPL-3.0-or-later.txt" ]; then
    cp "$PROJECT_ROOT/LICENSES/GPL-3.0-or-later.txt" "$DMG_STAGING/LICENSE.txt"
elif [ -f "$PROJECT_ROOT/LICENSES/GPL3.txt" ]; then
    cp "$PROJECT_ROOT/LICENSES/GPL3.txt" "$DMG_STAGING/LICENSE.txt"
fi

# Step 6: Create the DMG
echo ""
echo "Creating DMG..."

# Remove old DMG if exists
rm -f "$DMG_PATH"

# Create compressed read-only DMG directly from staging folder
hdiutil create \
    -srcfolder "$DMG_STAGING" \
    -volname "$DMG_VOLUME_NAME" \
    -fs HFS+ \
    -format UDZO \
    -imagekey zlib-level=9 \
    "$DMG_PATH"

# Clean up staging
rm -rf "$DMG_STAGING"

# Clear quarantine
xattr -rd com.apple.quarantine "$DMG_PATH" 2>/dev/null || true

echo ""
echo "=== DMG Build Complete ==="
echo "Installer: $DMG_PATH"
echo "Size: $(du -h "$DMG_PATH" | cut -f1)"
echo ""
echo "Contents:"
echo "  - Install Element.pkg (double-click to install)"
echo "  - README.txt"
echo "  - LICENSE.txt"
echo ""
echo "To distribute: share the .dmg file"
