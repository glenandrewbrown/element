<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# installer/ — macOS PKG + DMG Packaging

Builds the release installer: a versioned PKG wrapped in a DMG. Build
numbers are auto-incremented via `build_number.txt` (repo root) on each
`build_pkg.sh` run. Output artifacts land in `installer/output/` which is
gitignored — never edit files there.

## Key Files
| File | Description |
|------|-------------|
| `build_pkg.sh` | Entry point — builds PKG + DMG, increments build number |
| `build_dmg.sh` | Wraps the PKG in a DMG; called by `build_pkg.sh` |
| `component.plist` | PKG component options (install locations, bundle rules) |
| `output/` | Build artifacts (gitignored — do not edit) |

## Usage
```bash
# Full pipeline: configure + build + sign first, then package
cmake -B build-release -DCMAKE_BUILD_TYPE=Release \
      -DELEMENT_BUILD_PLUGINS=ON \
      -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0
cmake --build build-release -j8
bash scripts/sign-all-macos.sh build-release

# Package (auto-increments build_number.txt → e.g. Element-1.2.0.4.dmg)
bash installer/build_pkg.sh 1.2.0 build-release installer/output
```

## For AI Agents
Output naming convention: `Element-<version>.<build>.pkg` and
`Element-<version>.<build>.dmg` (e.g. `Element-1.2.0.3.dmg`).

**Helper packaging (done 2026-06-06, commit 2dabb814):** `build_pkg.sh` nests
`Element Sandbox Host.app` (bundle ID `net.kushview.Element.sandbox`) into
`Element.app/Contents/Helpers/` and HARD-ERRORS if the helper artefact is
missing and not already nested. Root `CMakeLists.txt` POST_BUILD mirrors the
same layout in dev builds (dev layout == ship layout). Signing:
`scripts/codesign-macos.sh` uses `--deep`, which covers the nested helper.
Runtime discovery order lives in `src/engine/sandboxhost.hpp`
(`EL_SANDBOX_HELPER` env → owning-bundle `Contents/Helpers` → executable-adjacent
→ honest fail; never re-execs the host).
