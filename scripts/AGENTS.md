<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# scripts/ — Shell and Lua Runtime Scripts

Shell scripts for macOS code-signing and notarization, plus Lua scripts
consumed at runtime by Element's scripting engine (`src/el/` bindings).
The signing scripts are required before packaging or running reliability
tests on macOS.

## Key Files
| File | Description |
|------|-------------|
| `codesign-macos.sh` | Sign a single target (ad-hoc if `DEVELOPER_ID_APP` unset) |
| `notarize-macos.sh` | Submit a signed `.dmg` or `.pkg` to Apple notarization |
| `sign-all-macos.sh` | Sign every build target in a build dir (calls `codesign-macos.sh`) |
| `CMakeLists.txt` | Installs Lua scripts as data resources |
| `amp.lua` | Amplitude/gain utility script |
| `ampui.lua` | Amplitude UI helper script |
| `channelize.lua` | MIDI channel routing script |
| `commands.lua` | OSC command surface helpers |
| `console.lua` | Debug console / log helpers |
| `content.lua` | Content/asset path utilities |
| `mtc_generator.lua` | MTC (MIDI Time Code) generator script |
| `spontonchordchooser.lua` | Chord-chooser utility script |
| `view.lua` | View / display helpers |

## For AI Agents
```bash
# Ad-hoc sign all targets (no Apple account needed)
bash scripts/sign-all-macos.sh build-merged

# Sign with real Developer ID (set env var first)
export DEVELOPER_ID_APP="Developer ID Application: Your Name (TEAMID)"
bash scripts/sign-all-macos.sh build-release

# Notarize a built DMG
bash scripts/notarize-macos.sh installer/output/Element-1.2.0.3.dmg
```

**Gotcha:** `sign-all-macos.sh` must be run before `crash_isolation_proof.sh`
and before `installer/build_pkg.sh` on release builds. Ad-hoc signing is
sufficient for local dev and reliability testing.
