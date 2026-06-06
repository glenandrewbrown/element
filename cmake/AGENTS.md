<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# cmake/ — CMake Modules and Build Configuration

CMake helper modules (Find* scripts, version/header templates, entitlements)
used by the root `CMakeLists.txt`. Most are included automatically during
`cmake -B build`; agents should not need to modify these except when
adjusting entitlements for new sandbox capabilities.

## Key Files
| File | Description |
|------|-------------|
| `entitlements.plist` | macOS sandbox entitlements — required for `element_sandbox_host` worker |
| `Element.cmake` | Core build targets and options for Element app and plugins |
| `FindJUCE.cmake` | Locates the JUCE framework (FetchContent fallback) |
| `FindJack.cmake` | Locates JACK audio library on Linux |
| `FindSol2.cmake` | Locates sol2 Lua binding library |
| `FindSparkle.cmake` | Locates Sparkle auto-update framework (macOS) |
| `FindWinSparkle.cmake` | Locates WinSparkle auto-update framework (Windows) |
| `buildversion.txt.in` | Template expanded to `buildversion.txt` at configure time |
| `element_webview_dist.h.in` | Template for embedding the webview dist path |
| `version.txt.in` | Template expanded to `version.txt` at configure time |

## For AI Agents
- `entitlements.plist` must include `com.apple.security.cs.allow-jit` and
  any IPC entitlements needed by the sandbox worker; edit here if a new
  sandbox capability is required.
- Do NOT hand-edit `buildversion.txt` or `version.txt` — they are generated
  at configure time from the `.in` templates.
- macOS builds require `-DCMAKE_OSX_DEPLOYMENT_TARGET=14.0` at configure time.
