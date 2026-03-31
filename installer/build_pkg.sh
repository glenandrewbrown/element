#!/bin/bash
# Element macOS Package Installer Builder
# Creates a .pkg installer for Element app and all plugins

set -e

# Configuration
VERSION="${1:-1.0.0}"
BUILD_DIR="${2:-build}"
OUTPUT_DIR="${3:-installer/output}"
IDENTIFIER_PREFIX="net.kushview.element"

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Build number: read from build_number.txt, increment, and write back
BUILD_NUMBER_FILE="$PROJECT_ROOT/build_number.txt"
if [ -f "$BUILD_NUMBER_FILE" ]; then
    BUILD_NUMBER=$(cat "$BUILD_NUMBER_FILE" | tr -d '[:space:]')
else
    BUILD_NUMBER=1
fi

# Increment for next build
NEXT_BUILD=$((BUILD_NUMBER + 1))
echo "$NEXT_BUILD" > "$BUILD_NUMBER_FILE"

# Full version includes build number
FULL_VERSION="${VERSION}.${BUILD_NUMBER}"
GIT_HASH=$(git -C "$PROJECT_ROOT" rev-parse --short=8 HEAD 2>/dev/null || echo "unknown")
PKG_ROOT="$PROJECT_ROOT/$OUTPUT_DIR/pkg_root"
PKG_SCRIPTS="$PROJECT_ROOT/$OUTPUT_DIR/scripts"
PKG_RESOURCES="$PROJECT_ROOT/installer/resources"

echo "=== Element Package Builder ==="
echo "Version: $FULL_VERSION (build #${BUILD_NUMBER}, ${GIT_HASH})"
echo "Build Dir: $BUILD_DIR"
echo "Output Dir: $OUTPUT_DIR"
echo ""

# Clean previous build
rm -rf "$PROJECT_ROOT/$OUTPUT_DIR"
mkdir -p "$PKG_ROOT"
mkdir -p "$PKG_SCRIPTS"
mkdir -p "$PROJECT_ROOT/$OUTPUT_DIR/components"

# Create directory structure for installation
mkdir -p "$PKG_ROOT/Applications"
mkdir -p "$PKG_ROOT/Library/Audio/Plug-Ins/Components"
mkdir -p "$PKG_ROOT/Library/Audio/Plug-Ins/VST3"
mkdir -p "$PKG_ROOT/Library/Audio/Plug-Ins/CLAP"
mkdir -p "$PKG_ROOT/Library/Audio/Plug-Ins/LV2"

echo "Copying application..."
# Use Release subdirectory which contains the latest build
if [ -d "$PROJECT_ROOT/$BUILD_DIR/element_app_artefacts/Release/Element.app" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_app_artefacts/Release/Element.app" "$PKG_ROOT/Applications/"
elif [ -d "$PROJECT_ROOT/$BUILD_DIR/element_app_artefacts/Element.app" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_app_artefacts/Element.app" "$PKG_ROOT/Applications/"
else
    echo "ERROR: Element.app not found"
    exit 1
fi

echo "Copying AU plugins..."
# Instrument - prefer Release path
if [ -d "$PROJECT_ROOT/$BUILD_DIR/element_instrument_artefacts/Release/AU/KV-Element.component" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_instrument_artefacts/Release/AU/KV-Element.component" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/Components/"
elif [ -d "$PROJECT_ROOT/$BUILD_DIR/element_instrument_artefacts/AU/KV-Element.component" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_instrument_artefacts/AU/KV-Element.component" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/Components/"
fi

# Effect - prefer Release path
if [ -d "$PROJECT_ROOT/$BUILD_DIR/element_effect_artefacts/Release/AU/KV-Element-FX.component" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_effect_artefacts/Release/AU/KV-Element-FX.component" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/Components/"
elif [ -d "$PROJECT_ROOT/$BUILD_DIR/element_effect_artefacts/AU/KV-Element-FX.component" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_effect_artefacts/AU/KV-Element-FX.component" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/Components/"
fi

# MIDI Effect - prefer Release path
if [ -d "$PROJECT_ROOT/$BUILD_DIR/element_midi_effect_artefacts/Release/AU/KV-Element-MFX.component" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_midi_effect_artefacts/Release/AU/KV-Element-MFX.component" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/Components/"
elif [ -d "$PROJECT_ROOT/$BUILD_DIR/element_midi_effect_artefacts/AU/KV-Element-MFX.component" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_midi_effect_artefacts/AU/KV-Element-MFX.component" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/Components/"
fi

echo "Copying VST3 plugins..."
# Instrument - prefer Release path
if [ -d "$PROJECT_ROOT/$BUILD_DIR/element_instrument_artefacts/Release/VST3/KV-Element.vst3" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_instrument_artefacts/Release/VST3/KV-Element.vst3" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/VST3/"
elif [ -d "$PROJECT_ROOT/$BUILD_DIR/element_instrument_artefacts/VST3/KV-Element.vst3" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_instrument_artefacts/VST3/KV-Element.vst3" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/VST3/"
fi

# Effect - prefer Release path
if [ -d "$PROJECT_ROOT/$BUILD_DIR/element_effect_artefacts/Release/VST3/KV-Element-FX.vst3" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_effect_artefacts/Release/VST3/KV-Element-FX.vst3" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/VST3/"
elif [ -d "$PROJECT_ROOT/$BUILD_DIR/element_effect_artefacts/VST3/KV-Element-FX.vst3" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_effect_artefacts/VST3/KV-Element-FX.vst3" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/VST3/"
fi

echo "Copying CLAP plugins..."
# Instrument - prefer Release path
if [ -d "$PROJECT_ROOT/$BUILD_DIR/element_instrument_artefacts/Release/CLAP/KV-Element.clap" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_instrument_artefacts/Release/CLAP/KV-Element.clap" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/CLAP/"
elif [ -d "$PROJECT_ROOT/$BUILD_DIR/element_instrument_artefacts/CLAP/KV-Element.clap" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_instrument_artefacts/CLAP/KV-Element.clap" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/CLAP/"
fi

# Effect - prefer Release path
if [ -d "$PROJECT_ROOT/$BUILD_DIR/element_effect_artefacts/Release/CLAP/KV-Element-FX.clap" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_effect_artefacts/Release/CLAP/KV-Element-FX.clap" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/CLAP/"
elif [ -d "$PROJECT_ROOT/$BUILD_DIR/element_effect_artefacts/CLAP/KV-Element-FX.clap" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_effect_artefacts/CLAP/KV-Element-FX.clap" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/CLAP/"
fi

echo "Copying LV2 plugins..."
# Instrument - prefer Release path
if [ -d "$PROJECT_ROOT/$BUILD_DIR/element_instrument_artefacts/Release/LV2/KV-Element.lv2" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_instrument_artefacts/Release/LV2/KV-Element.lv2" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/LV2/"
elif [ -d "$PROJECT_ROOT/$BUILD_DIR/element_instrument_artefacts/LV2/KV-Element.lv2" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_instrument_artefacts/LV2/KV-Element.lv2" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/LV2/"
fi

# Effect - prefer Release path
if [ -d "$PROJECT_ROOT/$BUILD_DIR/element_effect_artefacts/Release/LV2/KV-Element-FX.lv2" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_effect_artefacts/Release/LV2/KV-Element-FX.lv2" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/LV2/"
elif [ -d "$PROJECT_ROOT/$BUILD_DIR/element_effect_artefacts/LV2/KV-Element-FX.lv2" ]; then
    cp -R "$PROJECT_ROOT/$BUILD_DIR/element_effect_artefacts/LV2/KV-Element-FX.lv2" \
        "$PKG_ROOT/Library/Audio/Plug-Ins/LV2/"
fi

# Create preinstall script for complete clean uninstall
cat > "$PKG_SCRIPTS/preinstall" << 'EOF'
#!/bin/bash
# Element Pre-Installation Script
# Performs complete clean removal of existing Element installation

echo "=== Element Pre-Installation Cleanup ==="
echo "Removing existing Element installation..."

# Kill any running Element processes
echo "  - Stopping Element processes..."
killall -9 Element 2>/dev/null || true
killall -9 "Element Helper" 2>/dev/null || true

# Wait for processes to terminate
sleep 1

# Remove existing application
echo "  - Removing Element.app..."
if [ -d "/Applications/Element.app" ]; then
    rm -rf "/Applications/Element.app"
    echo "    Removed /Applications/Element.app"
fi

# Remove system-wide AU plugins
echo "  - Removing AU plugins from /Library/Audio/Plug-Ins/Components/..."
rm -rf "/Library/Audio/Plug-Ins/Components/KV-Element.component" 2>/dev/null
rm -rf "/Library/Audio/Plug-Ins/Components/KV-Element-FX.component" 2>/dev/null
rm -rf "/Library/Audio/Plug-Ins/Components/KV-Element-MFX.component" 2>/dev/null
rm -rf "/Library/Audio/Plug-Ins/Components/Element.component" 2>/dev/null
# Legacy: raw artefacts directories from early installers (Dec 2025)
rm -rf "/Library/Audio/Plug-Ins/Components/element_instrument_artefacts" 2>/dev/null
rm -rf "/Library/Audio/Plug-Ins/Components/element_effect_artefacts" 2>/dev/null
rm -rf "/Library/Audio/Plug-Ins/Components/element_midi_effect_artefacts" 2>/dev/null

# Remove user AU plugins
echo "  - Removing AU plugins from ~/Library/Audio/Plug-Ins/Components/..."
if [ -n "$HOME" ]; then
    rm -rf "$HOME/Library/Audio/Plug-Ins/Components/KV-Element.component" 2>/dev/null
    rm -rf "$HOME/Library/Audio/Plug-Ins/Components/KV-Element-FX.component" 2>/dev/null
    rm -rf "$HOME/Library/Audio/Plug-Ins/Components/KV-Element-MFX.component" 2>/dev/null
    rm -rf "$HOME/Library/Audio/Plug-Ins/Components/Element.component" 2>/dev/null
fi

# Remove system-wide VST3 plugins
echo "  - Removing VST3 plugins from /Library/Audio/Plug-Ins/VST3/..."
rm -rf "/Library/Audio/Plug-Ins/VST3/KV-Element.vst3" 2>/dev/null
rm -rf "/Library/Audio/Plug-Ins/VST3/KV-Element-FX.vst3" 2>/dev/null
rm -rf "/Library/Audio/Plug-Ins/VST3/Element.vst3" 2>/dev/null
# Legacy artefacts
rm -rf "/Library/Audio/Plug-Ins/VST3/element_instrument_artefacts" 2>/dev/null
rm -rf "/Library/Audio/Plug-Ins/VST3/element_effect_artefacts" 2>/dev/null

# Remove user VST3 plugins
echo "  - Removing VST3 plugins from ~/Library/Audio/Plug-Ins/VST3/..."
if [ -n "$HOME" ]; then
    rm -rf "$HOME/Library/Audio/Plug-Ins/VST3/KV-Element.vst3" 2>/dev/null
    rm -rf "$HOME/Library/Audio/Plug-Ins/VST3/KV-Element-FX.vst3" 2>/dev/null
    rm -rf "$HOME/Library/Audio/Plug-Ins/VST3/Element.vst3" 2>/dev/null
fi

# Remove system-wide CLAP plugins
echo "  - Removing CLAP plugins from /Library/Audio/Plug-Ins/CLAP/..."
rm -rf "/Library/Audio/Plug-Ins/CLAP/KV-Element.clap" 2>/dev/null
rm -rf "/Library/Audio/Plug-Ins/CLAP/KV-Element-FX.clap" 2>/dev/null
rm -rf "/Library/Audio/Plug-Ins/CLAP/Element.clap" 2>/dev/null
# Legacy artefacts
rm -rf "/Library/Audio/Plug-Ins/CLAP/element_instrument_artefacts" 2>/dev/null
rm -rf "/Library/Audio/Plug-Ins/CLAP/element_effect_artefacts" 2>/dev/null

# Remove user CLAP plugins
echo "  - Removing CLAP plugins from ~/Library/Audio/Plug-Ins/CLAP/..."
if [ -n "$HOME" ]; then
    rm -rf "$HOME/Library/Audio/Plug-Ins/CLAP/KV-Element.clap" 2>/dev/null
    rm -rf "$HOME/Library/Audio/Plug-Ins/CLAP/KV-Element-FX.clap" 2>/dev/null
    rm -rf "$HOME/Library/Audio/Plug-Ins/CLAP/Element.clap" 2>/dev/null
fi

# Remove system-wide LV2 plugins
echo "  - Removing LV2 plugins from /Library/Audio/Plug-Ins/LV2/..."
rm -rf "/Library/Audio/Plug-Ins/LV2/KV-Element.lv2" 2>/dev/null
rm -rf "/Library/Audio/Plug-Ins/LV2/KV-Element-FX.lv2" 2>/dev/null
rm -rf "/Library/Audio/Plug-Ins/LV2/Element.lv2" 2>/dev/null

# Remove user LV2 plugins
echo "  - Removing LV2 plugins from ~/Library/Audio/Plug-Ins/LV2/..."
if [ -n "$HOME" ]; then
    rm -rf "$HOME/Library/Audio/Plug-Ins/LV2/KV-Element.lv2" 2>/dev/null
    rm -rf "$HOME/Library/Audio/Plug-Ins/LV2/KV-Element-FX.lv2" 2>/dev/null
    rm -rf "$HOME/Library/Audio/Plug-Ins/LV2/Element.lv2" 2>/dev/null
fi

# Clear Element's own plugin scanner cache so stale entries don't cause crashes
echo "  - Clearing Element plugin scanner cache..."
if [ -n "$HOME" ]; then
    rm -f "$HOME/Library/Application Support/Element/scanner.xml" 2>/dev/null
    rm -f "$HOME/Library/Application Support/Kushview/Element/scanner.xml" 2>/dev/null
fi

# Note: We do NOT clear the entire AudioUnit cache - that would force
# all plugins to be re-validated. The system will automatically detect
# that Element plugins have changed and rescan only those.

# Remove Element application support data (optional - keeps user presets)
# Uncomment below to do a complete clean install including user data
# echo "  - Removing Element application support..."
# if [ -n "$HOME" ]; then
#     rm -rf "$HOME/Library/Application Support/Element" 2>/dev/null
#     rm -rf "$HOME/Library/Application Support/Kushview/Element" 2>/dev/null
# fi

# Remove Element preferences (optional - keeps user preferences)
# Uncomment below to do a complete clean install including preferences
# echo "  - Removing Element preferences..."
# if [ -n "$HOME" ]; then
#     rm -f "$HOME/Library/Preferences/net.kushview.Element.plist" 2>/dev/null
#     rm -f "$HOME/Library/Preferences/com.kushview.element.plist" 2>/dev/null
# fi

echo "=== Pre-installation cleanup complete ==="
exit 0
EOF
chmod +x "$PKG_SCRIPTS/preinstall"

# Create postinstall script to set permissions and finalize installation
cat > "$PKG_SCRIPTS/postinstall" << 'EOF'
#!/bin/bash
# Element Post-Installation Script
# Sets permissions - macOS will automatically detect plugin changes

echo "=== Element Post-Installation ==="

# Set proper permissions on installed files
echo "  - Setting permissions..."
chmod -R 755 /Library/Audio/Plug-Ins/Components/KV-Element*.component 2>/dev/null || true
chmod -R 755 /Library/Audio/Plug-Ins/VST3/KV-Element*.vst3 2>/dev/null || true
chmod -R 755 /Library/Audio/Plug-Ins/CLAP/KV-Element*.clap 2>/dev/null || true
chmod -R 755 /Library/Audio/Plug-Ins/LV2/KV-Element*.lv2 2>/dev/null || true

# Create receipt marker
RECEIPT_DIR="/var/db/receipts"
echo "Version: $VERSION" > "$RECEIPT_DIR/net.kushview.element.version" 2>/dev/null || true
echo "Installed: $(date)" >> "$RECEIPT_DIR/net.kushview.element.version" 2>/dev/null || true

echo "=== Element installation complete! ==="
echo ""
echo "Element has been installed to:"
echo "  Application: /Applications/Element.app"
echo "  AU Plugins:  /Library/Audio/Plug-Ins/Components/"
echo "  VST3 Plugins: /Library/Audio/Plug-Ins/VST3/"
echo "  CLAP Plugins: /Library/Audio/Plug-Ins/CLAP/"
echo "  LV2 Plugins:  /Library/Audio/Plug-Ins/LV2/"
echo ""
echo "Please restart your DAW to see the new plugins."

exit 0
EOF
chmod +x "$PKG_SCRIPTS/postinstall"

# ---- Code Signing ----
# If DEVELOPER_ID_APP is set, sign all binaries before packaging.
# This ensures the PKG contains properly signed, hardened-runtime bundles.
SIGN_SCRIPT="$PROJECT_ROOT/scripts/codesign-macos.sh"
if [ -n "${DEVELOPER_ID_APP:-}" ] && [ -x "$SIGN_SCRIPT" ]; then
    echo ""
    echo "=== Code Signing ==="
    # Sign the app
    if [ -d "$PKG_ROOT/Applications/Element.app" ]; then
        "$SIGN_SCRIPT" "$PKG_ROOT/Applications/Element.app"
    fi
    # Sign all plugin bundles in the staging area
    for ext in component vst3 clap lv2; do
        find "$PKG_ROOT" -name "*.${ext}" -type d | while read -r bundle; do
            "$SIGN_SCRIPT" "$bundle"
        done
    done
    echo "=== Code Signing Complete ==="
elif [ -n "${DEVELOPER_ID_APP:-}" ]; then
    echo "WARNING: DEVELOPER_ID_APP is set but $SIGN_SCRIPT not found; skipping signing."
fi

echo ""
echo "Building component packages..."

# Build Application package (includes preinstall/postinstall scripts)
# --component-plist prevents macOS from relocating to stale bundle locations
echo "  - Element Application"
pkgbuild \
    --root "$PKG_ROOT/Applications" \
    --identifier "${IDENTIFIER_PREFIX}.app" \
    --version "$VERSION" \
    --install-location "/Applications" \
    --component-plist "$SCRIPT_DIR/component.plist" \
    --scripts "$PKG_SCRIPTS" \
    "$PROJECT_ROOT/$OUTPUT_DIR/components/ElementApp.pkg"

# Build AU Plugins package (no scripts — preinstall/postinstall only on app component)
if [ -n "$(ls -A "$PKG_ROOT/Library/Audio/Plug-Ins/Components/" 2>/dev/null)" ]; then
    echo "  - AU Plugins"
    pkgbuild \
        --root "$PKG_ROOT/Library/Audio/Plug-Ins/Components" \
        --identifier "${IDENTIFIER_PREFIX}.au" \
        --version "$VERSION" \
        --install-location "/Library/Audio/Plug-Ins/Components" \
        "$PROJECT_ROOT/$OUTPUT_DIR/components/ElementAU.pkg"
fi

# Build VST3 Plugins package
if [ -n "$(ls -A "$PKG_ROOT/Library/Audio/Plug-Ins/VST3/" 2>/dev/null)" ]; then
    echo "  - VST3 Plugins"
    pkgbuild \
        --root "$PKG_ROOT/Library/Audio/Plug-Ins/VST3" \
        --identifier "${IDENTIFIER_PREFIX}.vst3" \
        --version "$VERSION" \
        --install-location "/Library/Audio/Plug-Ins/VST3" \
        "$PROJECT_ROOT/$OUTPUT_DIR/components/ElementVST3.pkg"
fi

# Build CLAP Plugins package
if [ -n "$(ls -A "$PKG_ROOT/Library/Audio/Plug-Ins/CLAP/" 2>/dev/null)" ]; then
    echo "  - CLAP Plugins"
    pkgbuild \
        --root "$PKG_ROOT/Library/Audio/Plug-Ins/CLAP" \
        --identifier "${IDENTIFIER_PREFIX}.clap" \
        --version "$VERSION" \
        --install-location "/Library/Audio/Plug-Ins/CLAP" \
        "$PROJECT_ROOT/$OUTPUT_DIR/components/ElementCLAP.pkg"
fi

# Build LV2 Plugins package
if [ -n "$(ls -A "$PKG_ROOT/Library/Audio/Plug-Ins/LV2/" 2>/dev/null)" ]; then
    echo "  - LV2 Plugins"
    pkgbuild \
        --root "$PKG_ROOT/Library/Audio/Plug-Ins/LV2" \
        --identifier "${IDENTIFIER_PREFIX}.lv2" \
        --version "$VERSION" \
        --install-location "/Library/Audio/Plug-Ins/LV2" \
        "$PROJECT_ROOT/$OUTPUT_DIR/components/ElementLV2.pkg"
fi

echo ""
echo "Building distribution package..."

# Create distribution XML
DIST_XML="$PROJECT_ROOT/$OUTPUT_DIR/distribution.xml"
cat > "$DIST_XML" << EOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>Element</title>
    <organization>net.kushview</organization>
    <domains enable_localSystem="true" enable_currentUserHome="false"/>
    <options customize="allow" require-scripts="false" hostArchitectures="x86_64,arm64"/>

    <welcome file="welcome.html"/>
    <license file="license.html"/>
    <conclusion file="conclusion.html"/>

    <choices-outline>
        <line choice="app"/>
        <line choice="au"/>
        <line choice="vst3"/>
        <line choice="clap"/>
        <line choice="lv2"/>
    </choices-outline>

    <choice id="app" title="Element Application"
            description="The main Element application"
            enabled="true">
        <pkg-ref id="${IDENTIFIER_PREFIX}.app"/>
    </choice>

    <choice id="au" title="Audio Unit Plugins"
            description="Element AU plugins for Logic Pro, GarageBand, and other AU hosts"
            enabled="true">
        <pkg-ref id="${IDENTIFIER_PREFIX}.au"/>
    </choice>

    <choice id="vst3" title="VST3 Plugins"
            description="Element VST3 plugins for Ableton Live, Cubase, and other VST3 hosts"
            enabled="true">
        <pkg-ref id="${IDENTIFIER_PREFIX}.vst3"/>
    </choice>

    <choice id="clap" title="CLAP Plugins"
            description="Element CLAP plugins for Bitwig and other CLAP hosts"
            enabled="true">
        <pkg-ref id="${IDENTIFIER_PREFIX}.clap"/>
    </choice>

    <choice id="lv2" title="LV2 Plugins"
            description="Element LV2 plugins for Ardour and other LV2 hosts"
            enabled="true">
        <pkg-ref id="${IDENTIFIER_PREFIX}.lv2"/>
    </choice>

    <pkg-ref id="${IDENTIFIER_PREFIX}.app" version="$VERSION" onConclusion="none">ElementApp.pkg</pkg-ref>
    <pkg-ref id="${IDENTIFIER_PREFIX}.au" version="$VERSION" onConclusion="none">ElementAU.pkg</pkg-ref>
    <pkg-ref id="${IDENTIFIER_PREFIX}.vst3" version="$VERSION" onConclusion="none">ElementVST3.pkg</pkg-ref>
    <pkg-ref id="${IDENTIFIER_PREFIX}.clap" version="$VERSION" onConclusion="none">ElementCLAP.pkg</pkg-ref>
    <pkg-ref id="${IDENTIFIER_PREFIX}.lv2" version="$VERSION" onConclusion="none">ElementLV2.pkg</pkg-ref>
</installer-gui-script>
EOF

# Create resources directory
mkdir -p "$PROJECT_ROOT/$OUTPUT_DIR/resources"

# Create welcome HTML
cat > "$PROJECT_ROOT/$OUTPUT_DIR/resources/welcome.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; }
        h1 { color: #333; }
        h3 { color: #555; margin-top: 20px; }
        p { color: #666; line-height: 1.6; }
        .logo { text-align: center; margin-bottom: 20px; }
        .clean-install { background: #fff3cd; border: 1px solid #ffc107; border-radius: 5px; padding: 12px; margin: 15px 0; }
        .clean-install strong { color: #856404; }
        ul { margin: 10px 0; }
        li { margin: 5px 0; }
    </style>
</head>
<body>
    <div class="logo">
        <h1>Element</h1>
    </div>
    <p>Welcome to the Element installer.</p>
    <p>Element is a modular plugin host that allows you to create complex audio
       and MIDI routing configurations. It can run as a standalone application
       or as a plugin inside your favorite DAW.</p>

    <div class="clean-install">
        <strong>Clean Installation:</strong> This installer will automatically remove any
        existing Element installation (application and all plugins) before installing
        the new version. Your user presets and preferences will be preserved.
    </div>

    <h3>Components to be installed:</h3>
    <ul>
        <li><strong>Element Application</strong> - Standalone application in /Applications</li>
        <li><strong>AU Plugins</strong> - For Logic Pro, GarageBand, and other AU hosts</li>
        <li><strong>VST3 Plugins</strong> - For Ableton Live, Cubase, and other VST3 hosts</li>
        <li><strong>CLAP Plugins</strong> - For Bitwig and other CLAP hosts</li>
        <li><strong>LV2 Plugins</strong> - For Ardour and other LV2 hosts</li>
    </ul>

    <h3>What will be removed:</h3>
    <ul>
        <li>Existing Element.app from /Applications</li>
        <li>All Element plugins from system and user plugin folders</li>
    </ul>

    <p><strong>Note:</strong> Please close any DAWs or audio applications before proceeding
       to ensure a clean installation.</p>

    <p>Click <strong>Continue</strong> to proceed with the installation.</p>
</body>
</html>
EOF

# Create license HTML
cat > "$PROJECT_ROOT/$OUTPUT_DIR/resources/license.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; }
        h2 { color: #333; }
        pre { background: #f5f5f5; padding: 15px; overflow: auto; font-size: 11px; }
    </style>
</head>
<body>
    <h2>GNU General Public License v3</h2>
    <p>Element is free software licensed under the GNU General Public License version 3.</p>
    <pre>
Element - A Modular Plugin Host
Copyright (C) 2017-2025 Kushview, LLC

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see https://www.gnu.org/licenses/.
    </pre>
</body>
</html>
EOF

# Create conclusion HTML
cat > "$PROJECT_ROOT/$OUTPUT_DIR/resources/conclusion.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; }
        h1 { color: #2ecc71; }
        h3 { color: #555; margin-top: 20px; }
        p { color: #666; line-height: 1.6; }
        .paths { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .paths code { display: block; margin: 5px 0; font-size: 12px; }
        .success { background: #d4edda; border: 1px solid #28a745; border-radius: 5px; padding: 12px; margin: 15px 0; }
        .success strong { color: #155724; }
        .note { background: #e7f3ff; border: 1px solid #007bff; border-radius: 5px; padding: 12px; margin: 15px 0; }
        .note strong { color: #004085; }
        ul { margin: 10px 0; }
        li { margin: 5px 0; }
    </style>
</head>
<body>
    <h1>✓ Installation Complete!</h1>

    <div class="success">
        <strong>Success!</strong> Element has been freshly installed on your system.
        Any previous installation has been completely removed and replaced.
    </div>

    <h3>Installation Locations:</h3>
    <div class="paths">
        <code><strong>Application:</strong> /Applications/Element.app</code>
        <code><strong>AU Plugins:</strong> /Library/Audio/Plug-Ins/Components/KV-Element*.component</code>
        <code><strong>VST3 Plugins:</strong> /Library/Audio/Plug-Ins/VST3/KV-Element*.vst3</code>
        <code><strong>CLAP Plugins:</strong> /Library/Audio/Plug-Ins/CLAP/KV-Element*.clap</code>
        <code><strong>LV2 Plugins:</strong> /Library/Audio/Plug-Ins/LV2/KV-Element*.lv2</code>
    </div>

    <div class="note">
        <strong>Important:</strong> Please restart any DAWs or audio applications
        that were running during installation to see the new Element plugins.
    </div>

    <h3>Getting Started:</h3>
    <ul>
        <li><strong>Standalone:</strong> Launch Element from /Applications</li>
        <li><strong>In your DAW:</strong> Load "KV-Element" as an instrument or effect plugin</li>
        <li><strong>Graph Editor:</strong> Use horizontal layout for intuitive left-to-right signal flow</li>
        <li><strong>Features:</strong> Minimap, comment boxes, auto-connect, wire activity visualization</li>
    </ul>

    <h3>Plugin Types:</h3>
    <ul>
        <li><strong>KV-Element</strong> - Instrument plugin (MIDI in, audio out)</li>
        <li><strong>KV-Element-FX</strong> - Effect plugin (audio in, audio out)</li>
        <li><strong>KV-Element-MFX</strong> - MIDI effect plugin (MIDI processing)</li>
    </ul>

    <p>For documentation and support, visit:
       <a href="https://kushview.net">kushview.net</a></p>
</body>
</html>
EOF

# Build the final product package
FINAL_PKG="$PROJECT_ROOT/$OUTPUT_DIR/Element-${FULL_VERSION}.pkg"

productbuild \
    --distribution "$DIST_XML" \
    --resources "$PROJECT_ROOT/$OUTPUT_DIR/resources" \
    --package-path "$PROJECT_ROOT/$OUTPUT_DIR/components" \
    "$FINAL_PKG"

# ---- PKG Signing ----
# If DEVELOPER_ID_INSTALLER is set, sign the product PKG itself.
# Note: PKGs are signed with "Developer ID Installer" (not "Application").
if [ -n "${DEVELOPER_ID_INSTALLER:-}" ]; then
    echo ""
    echo "=== Signing PKG ==="
    SIGNED_PKG="${FINAL_PKG%.pkg}-signed.pkg"
    productsign --sign "$DEVELOPER_ID_INSTALLER" --timestamp "$FINAL_PKG" "$SIGNED_PKG"
    mv "$SIGNED_PKG" "$FINAL_PKG"
    echo "PKG signed with: $DEVELOPER_ID_INSTALLER"
    pkgutil --check-signature "$FINAL_PKG"
fi

# ---- Notarization ----
# If notarization credentials are set, submit the PKG for notarization.
NOTARIZE_SCRIPT="$PROJECT_ROOT/scripts/notarize-macos.sh"
if [ -n "${NOTARIZE_APPLE_ID:-}" ] && [ -n "${NOTARIZE_PASSWORD:-}" ] && [ -n "${NOTARIZE_TEAM_ID:-}" ]; then
    if [ -x "$NOTARIZE_SCRIPT" ]; then
        echo ""
        "$NOTARIZE_SCRIPT" "$FINAL_PKG"
    else
        echo "WARNING: Notarization credentials set but $NOTARIZE_SCRIPT not found; skipping."
    fi
fi

echo ""
echo "=== PKG Build Complete ==="
echo "Package created: $FINAL_PKG"
echo ""

# Build DMG wrapper (default release format)
if [ "${SKIP_DMG:-}" != "1" ]; then
    echo "Building DMG installer..."
    bash "$SCRIPT_DIR/build_dmg.sh" "$VERSION" "$BUILD_DIR" "$OUTPUT_DIR"
else
    echo "Skipping DMG (SKIP_DMG=1)"
    echo "To install: sudo installer -pkg \"$FINAL_PKG\" -target /"
    echo "Or double-click the .pkg file in Finder"
fi
