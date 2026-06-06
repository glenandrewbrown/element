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

**Pending TODO:** `element_sandbox_host` helper binary (bundle ID
`net.kushview.Element.sandbox`) must be wired into the `Element.app`
bundle payload inside `build_pkg.sh` before sandbox isolation works in
shipped builds. This is not yet implemented.
