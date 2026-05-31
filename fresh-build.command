#!/usr/bin/env bash
#
# fresh-build.command — clean, fresh Release build + sign + package.
# Double-click in Finder, or run from terminal: ./fresh-build.command [VERSION]
#
# Steps:
#   1. Wipe build-release/ and webview/dist/
#   2. Build the webview frontend (npm ci + build)
#   3. Configure CMake (Release, plugins, LTO, macOS 14 target)
#   4. Build with 8 parallel jobs
#   5. Sign all macOS targets
#   6. Build versioned PKG + DMG installer
#
# All step output is tee'd to *.log files in the repo root.

set -euo pipefail

# Resolve repo root = directory this script lives in, regardless of cwd.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

VERSION="${1:-1.2.0}"

echo "==> Element fresh build"
echo "    repo:    $REPO_ROOT"
echo "    version: $VERSION"
echo

echo "==> [1/6] Cleaning build-release/ and webview/dist/"
rm -rf build-release webview/dist

echo "==> [2/6] Building webview frontend"
( cd webview && npm ci && npm run build )

echo "==> [3/6] Configuring CMake (Release + plugins + LTO)"
cmake -B build-release \
    -DCMAKE_BUILD_TYPE=Release \
    -DELEMENT_BUILD_PLUGINS=ON \
    -DELEMENT_ENABLE_LTO=ON \
    -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0 \
    2>&1 | tee build-release-configure.log

echo "==> [4/6] Building (-j8)"
cmake --build build-release -j8 --verbose 2>&1 | tee build-release.log

echo "==> [5/6] Signing macOS targets"
scripts/sign-all-macos.sh build-release 2>&1 | tee sign.log

echo "==> [6/6] Building PKG + DMG installer"
installer/build_pkg.sh "$VERSION" build-release installer/output 2>&1 | tee package.log

echo
echo "==> DONE. Installer output in installer/output/"
ls -lh installer/output/ 2>/dev/null || true

# Keep the Terminal window open when launched via double-click.
if [[ -t 1 ]]; then
    echo
    read -r -p "Press Return to close…" _
fi
