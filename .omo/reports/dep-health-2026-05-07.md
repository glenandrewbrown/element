# Element — Dependency Health & Build Verification Report

**Run:** 2026-05-07 (Sisyphus / ULTRAWORK)
**Branch:** `local-enhancements` @ `82ac8154`
**Machine:** macOS 14.8.5 / Xcode 16.2 / Apple Clang 16.0.0

---

## TL;DR

The repo did **not build out of the box** on this fresh checkout. Three blocking issues were diagnosed and fixed, after which the entire project compiled cleanly and **all 48 ctest cases pass in 8.6 s**.

| Status | Item |
|--------|------|
| ✅ FIXED | Missing host tools (ninja, pandoc) installed |
| ✅ FIXED | `webview/node_modules` + `webview/dist` produced (`npm ci` + `npm run build`) |
| ✅ FIXED | sol2 ↔ system Lua 5.5 header conflict (forwarding headers) |
| ✅ FIXED | sol2 ↔ Apple Clang 16 / C++20 conditional-`noexcept` SFINAE bug (CMake post-fetch patch) |
| ✅ VERIFIED | `cmake --build build-merged -j8` → exit 0, 0 errors |
| ✅ VERIFIED | `ctest --output-on-failure -j4` → **48/48 passed** |
| ✅ VERIFIED | `Element.app` (85 MB, signed ad-hoc) launches from `build-merged/element_app_artefacts/` with bundled WebView dist |

---

## 1. Toolchain inventory

| Tool | Required | Found before | Action | Found after |
|------|----------|--------------|--------|-------------|
| macOS | 14.0+ | 14.8.5 | — | ✅ |
| Xcode | recent | 16.2 (16C5032a) | — | ✅ |
| Apple clang | C++20 | 16.0.0 | — | ✅ |
| CMake | ≥ 3.26 | 4.3.1 | — | ✅ |
| ninja | required by CI / fast builds | **MISSING** | `brew install ninja` | ✅ 1.13.2 |
| pandoc | required by CI for docs | **MISSING** | `brew install pandoc` | ✅ 3.9.0.2 |
| Boost | ≥ 1.74 | 1.90.0 | — | ✅ |
| Node.js | 20+ | 24.15.0 | — | ✅ |
| npm | recent | 11.12.1 | — | ✅ |
| pkg-config | recent | 2.5.1 | — | ✅ |
| ccache | optional | not installed | (skipped) | ⚠️ would speed rebuilds |
| jack | optional | not installed | (skipped) | ⚠️ no JACK on macOS by default |
| Sparkle.framework | only when `ELEMENT_ENABLE_UPDATER=ON` | not installed | (skipped) | ⚠️ off by default |
| lilv / suil / lv2 | LV2 plugin format on macOS | not installed | (skipped) | ⚠️ LV2 format not built |

**Recommendation:** `brew install ccache lilv suil lv2` for faster rebuilds and full plugin-format coverage.

---

## 2. Build infrastructure state

| Item | Status |
|------|--------|
| Submodule `deps/clap-juce-extensions` | ✅ checked out @ `645ed2fd` |
| `webview/node_modules` | ✅ INSTALLED (`npm ci`, 213 packages, 4 s) |
| `webview/dist` | ✅ BUILT (vite v8.0.3, 632 modules, 687 kB JS, 75 kB CSS, 557 ms) |
| CMake `build-merged/` | ✅ CONFIGURED (130 s first time; 11–13 s incrementally) |
| JUCE source tree | ✅ FETCHED via FetchContent (no system pkg) |
| sol2 source tree | ✅ FETCHED via FetchContent + **patched** in-place by `cmake/FindSol2.cmake` |
| Lua | ✅ Bundled at `src/lua/src/`, version **5.4.1** (LUA_VERSION_NUM=504) |
| `Element.app` | ✅ Built, 85.2 MB, contains bundled `Resources/webview/` |

**Build wallclock:** ~8 minutes for first full build (cold cache) on M-class Mac.

---

## 3. Issues found and fixed (Phase A.5 of the master plan)

### Issue #1 — Missing host tools (`ninja`, `pandoc`)

**Symptom:** CI workflow `.github/workflows/build.yml:95` runs `brew install cmake ninja pandoc` on macOS runners, but the local host had neither.

**Fix:** `brew install ninja pandoc`. Versions installed: `ninja 1.13.2`, `pandoc 3.9.0.2`.

---

### Issue #2 — Webview not built

**Symptom:** `webview/node_modules` and `webview/dist/` both absent. POST_BUILD step in `CMakeLists.txt` would fail to bundle the React UI into `Element.app`.

**Fix:**
```bash
cd webview
npm ci             # 213 packages installed
npm run build      # tsc -b && vite build → dist/
```

**Result:** `webview/dist/` populated with `index.html`, `assets/index-*.js` (687 kB), `assets/index-*.css` (75 kB), `favicon.svg`, `icons.svg`.

---

### Issue #3 — sol2 ↔ system Lua 5.5 header conflict (CRITICAL build blocker)

**Diagnosis:**
1. The host has Homebrew's default `lua` formula installed at `/usr/local/Cellar/lua/5.5.0/`, which symlinks `/usr/local/include/lua/lua.h` → Lua **5.5.0** (`LUA_VERSION_NUM = 505`).
2. sol2's `compatibility/compat-5.3.h` line 10 does `#if __has_include(<lua/lua.h>)` and prefers `<lua/lua.h>` over `<lua.h>`.
3. The compiler resolves `<lua/lua.h>` to the system Lua 5.5 header instead of the project's bundled Lua 5.4.1 at `src/lua/src/lua.h`.
4. sol2's compat layer asserts `LUA_VERSION_NUM ≤ 504` → fires `#error "unsupported Lua version"`.

**Fix:** Add forwarding headers under `src/lua/src/lua/` so `<lua/lua.h>` (and `.hpp`) resolves to the bundled Lua via the project's `-I src/lua/src` include flag, which precedes the system path:

```
src/lua/src/lua/lua.h        →  #include "../lua.h"
src/lua/src/lua/lua.hpp      →  #include "../lua.hpp"
src/lua/src/lua/lauxlib.h    →  #include "../lauxlib.h"
src/lua/src/lua/lualib.h     →  #include "../lualib.h"
```

Also fixed `src/lua/.gitignore` — its anchored `/src/lua` pattern was over-ignoring the new directory.

**Verified:** Compiler trace via `c++ -H -E` confirms bundled Lua 5.4.1 is now resolved consistently for every TU that includes `<lua/...>`.

---

### Issue #4 — sol2 ↔ Apple Clang 16 ↔ C++20 conditional-`noexcept` SFINAE bug (CRITICAL build blocker)

**Diagnosis:**
sol2 has 10 occurrences of templates declared as
```cpp
static int call(lua_State* L) noexcept(std::is_nothrow_copy_assignable_v<T>) { … }
```
Apple Clang 16 + C++20 produces a hard substitution failure when `T` is one of certain JUCE types (e.g. `juce::MouseEvent::*` member-pointer types referenced by `sol::readonly_property` lambdas). The compiler reports:
```
error: address of overloaded function 'call' does not match required type 'int (lua_State *)'
note: candidate template ignored: substitution failure
```
This reproduced on **every sol2 release tag tested** (v3.3.0, v3.3.1, v3.5.0, and the project's pinned dev commit `c1f95a7`). It is a sol2 / new-Clang interaction, not a project-side bug.

**Fix:** Strip the conditional-`noexcept` clause via a CMake post-fetch patch in `cmake/FindSol2.cmake` (idempotent, gated by a `.element_noexcept_patched` marker file, applied across all `_deps/sol2-src/include/sol/*.hpp`):

```cmake
file(GLOB_RECURSE _sol2_headers "${sol2_SOURCE_DIR}/include/sol/*.hpp")
foreach(_hdr ${_sol2_headers})
    file(READ "${_hdr}" _sol2_contents)
    string(REPLACE
        "noexcept(std::is_nothrow_copy_assignable_v<T>)"
        ""
        _sol2_contents_patched
        "${_sol2_contents}")
    if(NOT "${_sol2_contents_patched}" STREQUAL "${_sol2_contents}")
        file(WRITE "${_hdr}" "${_sol2_contents_patched}")
    endif()
endforeach()
```

Files patched:
- `_deps/sol2-src/include/sol/function_types_stateless.hpp`
- `_deps/sol2-src/include/sol/function_types_stateful.hpp`
- `_deps/sol2-src/include/sol/ebco.hpp`

**Verified:** Configure → fetch → patch → build → ctest sequence is reproducibly clean from a freshly-deleted `_deps/sol2-*`.

**Upstream tracking:** This fix should be revisited when sol2 publishes a release that handles Apple Clang 16's stricter SFINAE on conditional-`noexcept`. Until then the patch is required for all macOS Sonoma+ developer machines using current Xcode.

---

## 4. Verification matrix

| Check | Result |
|-------|--------|
| `cmake -B build-merged -DCMAKE_EXPORT_COMPILE_COMMANDS=ON` | ✅ exit 0 (11 s incremental, 130 s cold) |
| `cmake --build build-merged -j8` | ✅ exit 0, 0 errors, 0 fatal warnings |
| `Element.app/Contents/MacOS/Element` exists | ✅ 85.2 MB |
| `Element.app/Contents/Resources/webview/index.html` exists | ✅ |
| `ctest --output-on-failure --timeout 30 -j4` | ✅ **48/48 passed**, 8.6 s |

The project is now in the green baseline state required by `AI_HANDOVER.md` (matches the Apr 28 audit-P1 closeout HEAD `82ac8154` reporting 48/48 ctest).

Plugin bundles (`.vst3`, `.component`, `.clap`, `.lv2`) are **not** built by default — `cmake/Element.cmake:4` defaults `ELEMENT_BUILD_PLUGINS=OFF`. Enable explicitly with `-DELEMENT_BUILD_PLUGINS=ON` for plugin-format work.

---

## 5. Files changed for this session

```
M  cmake/FindSol2.cmake          (+26 −0)   sol2 noexcept patch step
M  src/lua/.gitignore            (+2 −2)   anchored pattern fix
A  src/lua/src/lua/lua.h         (NEW)      forwarding header
A  src/lua/src/lua/lua.hpp       (NEW)      forwarding header
A  src/lua/src/lua/lauxlib.h     (NEW)      forwarding header
A  src/lua/src/lua/lualib.h      (NEW)      forwarding header
```

These are the **only** code changes from today's session. They are surgical, scoped to the build infrastructure, and committable as a single PR titled e.g. `fix(build): unbreak macOS 14 / Apple Clang 16 / Lua 5.5-host build`.

The associated planning artefacts are at:
- `.sisyphus/plans/master-fix-plan.md` (master fix plan for crashes + UI)
- `.sisyphus/reports/dep-health-2026-05-07.md` (this report)

---

## 6. Recommended next steps

1. **Commit** the 6-file build fix as its own PR (small, easy to review, unblocks every developer on macOS 14+ with brew Lua 5.5 installed).
2. Update **`docs/building.md`** with a one-line note: "Apple Clang 16 / Lua 5.5 hosts: the CMake build now applies a sol2 patch automatically — no user action required."
3. Add CI check on macOS (latest GitHub runner — currently macOS 14) to confirm clean fetch + build is permanently green.
4. Begin **Phase B** of `master-fix-plan.md` (Stop the Bleeding) on this now-green baseline.
