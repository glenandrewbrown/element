---
name: element-build-and-package
description: Use when building Element, creating installers (PKG/DMG), running tests, or the user says "build", "release", "installer", "package", "dmg", or "pkg". Covers cmake configure, build, test, sign, and package workflows.
---

# Element Build & Package

## Development Build

```bash
# Configure (first time or after adding new .cpp files — GLOB_RECURSE needs reconfigure)
cmake -B build-merged -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0

# Build
cmake --build build-merged -j8

# Test (33 Boost.Test suites)
cd build-merged && ctest --output-on-failure
```

## Release Build + Installer

```bash
# Configure release
cmake -B build-release -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0

# Build all targets (app + AU + VST3 + CLAP + LV2 + tests)
cmake --build build-release -j8

# Sign (ad-hoc without Developer ID, or set DEVELOPER_ID_APP)
codesign --force --deep --sign - build-release/element_app_artefacts/Release/Element.app

# Package PKG + DMG (auto-increments build number from build_number.txt)
installer/build_pkg.sh 1.2.0 build-release installer/output
```

Output: `installer/output/Element-1.2.0.<build>.dmg`

## After Building

- Run tests: `cd build-merged && ctest --output-on-failure`
- Verify UI: `cd tools/automation && python3 element_verify.py --suite all`
- Launch: `open build-merged/element_app_artefacts/Element.app`

## Key Paths

| What | Path |
|------|------|
| Dev build app | `build-merged/element_app_artefacts/Element.app` |
| Release build app | `build-release/element_app_artefacts/Release/Element.app` |
| Build number | `build_number.txt` (auto-incremented by installer) |
| Installer output | `installer/output/` |

## Gotchas

- New `.cpp` files require `cmake -B build-merged` reconfigure (GLOB_RECURSE)
- macOS needs `-DCMAKE_OSX_DEPLOYMENT_TARGET=14.0` for Sonoma compat
- `build/` directory has stale cache — use `build-merged` or `build-release`
