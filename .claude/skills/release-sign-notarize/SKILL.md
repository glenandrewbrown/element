---
name: release-sign-notarize
description: Full macOS release pipeline — release build, code sign, notarize, and package into PKG+DMG installer. Use when "release", "notarize", "sign and ship", "make installer", "ship it".
disable-model-invocation: true
---

# macOS Release Pipeline

Full release build, sign, notarize, and package pipeline for Element.

## Prerequisites

Before running, verify:
```bash
# Check signing identity
security find-identity -v -p codesigning | grep "Developer ID"

# Check notarization credentials (set these env vars)
echo "APPLE_ID: ${APPLE_ID:-NOT SET}"
echo "TEAM_ID: ${TEAM_ID:-NOT SET}"
echo "APP_PASSWORD: ${APP_PASSWORD:+SET}"
```

If no Developer ID is available, the pipeline will use ad-hoc signing (local testing only).

## Pipeline

### Step 1: Release Build

```bash
# Clean release build directory
cmake -B build-release \
  -DCMAKE_BUILD_TYPE=Release \
  -DELEMENT_BUILD_PLUGINS=ON \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0

cmake --build build-release -j8
```

### Step 2: Run Tests

```bash
cd build-release && ctest --output-on-failure
```

Abort if any tests fail.

### Step 3: Code Sign All Targets

```bash
# Signs app bundle, AU, VST3, CLAP, LV2 plugins
# Uses DEVELOPER_ID_APP env var if set, otherwise ad-hoc
scripts/sign-all-macos.sh build-release
```

### Step 4: Build PKG + DMG Installer

```bash
# Auto-increments build number from build_number.txt
# Produces Element-<version>.<build>.pkg and .dmg
installer/build_pkg.sh <version> build-release installer/output
```

The version should match `CMakeLists.txt` — check with:
```bash
grep "project(Element VERSION" CMakeLists.txt
```

### Step 5: Notarize (if Developer ID available)

```bash
# Submit for notarization
scripts/notarize-macos.sh installer/output/Element-<version>.<build>.dmg

# Staple the ticket after approval
xcrun stapler staple installer/output/Element-<version>.<build>.dmg
```

### Step 6: Verify

```bash
# Verify signing
codesign --verify --deep --strict build-release/element_app_artefacts/Element.app

# Verify notarization
spctl --assess --type execute build-release/element_app_artefacts/Element.app

# Check installer
pkgutil --check-signature installer/output/Element-*.pkg
```

## Version Alignment Checklist

- [ ] `CMakeLists.txt` `project(Element VERSION X.Y.Z)` matches intended version
- [ ] `build_number.txt` will auto-increment
- [ ] Installer filename matches: `Element-X.Y.Z.<build>.dmg`
- [ ] App bundle version matches installer version (check Info.plist)

## Output

Final artifacts in `installer/output/`:
- `Element-<version>.<build>.pkg` — macOS installer package
- `Element-<version>.<build>.dmg` — DMG wrapping the PKG
