#!/usr/bin/env bash
# sign-dev-build.sh — ad-hoc code-sign a dev build so the out-of-process sandbox
# can load REAL (3rd-party) plugins.
#
# WHY: the unsigned dev build's sandbox worker dies when loading a real plugin
# dylib (macOS code-load / library-validation). The IPC + crash-isolation
# MECHANISM is already proven by the headless ctest suite (SandboxIsolation /
# SandboxRealProcess) and works unsigned with the in-process test format — only
# REAL-plugin loading needs a signature. rspike loaded ValhallaSupermassive
# out-of-process + survived SIGKILL only when ad-hoc signed with these exact
# flags (adhoc + hardened runtime + entitlements). See
# .omo/RELIABILITY-TEST-STATUS-2026-06-02.md (SESSION-2c) and memory
# project_sandbox_needs_signed_build.
#
# The Element.app here is a SINGLE Mach-O (no nested helper bundles), so a flat
# sign of the binary then the bundle is correct (no inside-out walk needed).
#
# Usage:
#   tools/reliability/sign-dev-build.sh [path-to-Element.app]
# Default app: build-merged/element_app_artefacts/Element.app
#
# After signing, on a CONNECTED display (NOT a disconnected/mirrored one — the
# window routes there and becomes undrivable):
#   1. set pluginSandboxMode=1   (tools/reliability/crash_isolation_proof.sh setup)
#   2. launch the signed build, add ONE ValhallaSupermassive (VST3)
#   3. tools/reliability/crash_isolation_proof.sh proof
#   (EL_SANDBOX_PROBE=1 in the launch env logs the worker's init to
#    ~/Library/Element/log/sandbox_worker_probe.log)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="${1:-$REPO_ROOT/build-merged/element_app_artefacts/Element.app}"
ENT="$REPO_ROOT/cmake/entitlements.plist"
BIN="$APP/Contents/MacOS/Element"

c_grn() { printf '\033[32m%s\033[0m\n' "$*"; }
c_ylw() { printf '\033[33m%s\033[0m\n' "$*"; }
c_red() { printf '\033[31m%s\033[0m\n' "$*"; }

[ -d "$APP" ] || { c_red "App not found: $APP"; exit 2; }
[ -f "$BIN" ] || { c_red "Mach-O not found: $BIN"; exit 2; }
[ -f "$ENT" ] || { c_red "Entitlements not found: $ENT"; exit 2; }

echo "App:          $APP"
echo "Entitlements: $ENT"
c_ylw "WARNING: do not sign while this Element build is running."

# 1) clean any prior signature so we don't stack/conflict
codesign --remove-signature "$APP" 2>/dev/null || true
rm -rf "$APP/Contents/_CodeSignature" 2>/dev/null || true

# 2) sign the inner Mach-O, then the bundle — ad-hoc (-s -), hardened runtime,
#    with the disable-library-validation entitlement (the rspike-proven config).
echo ">>> signing Mach-O…"
codesign --force --options runtime --entitlements "$ENT" --sign - "$BIN"
echo ">>> signing bundle…"
codesign --force --options runtime --entitlements "$ENT" --sign - "$APP"

# 3) clear quarantine (locally built, normally none — belt & braces)
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

# 4) verify
echo ">>> verify"
codesign --verify --verbose=2 "$APP"
codesign -dvvv "$APP" 2>&1 | grep -iE "Identifier|flags|Signature=" | head -3
echo ">>> embedded entitlements"
codesign -d --entitlements - "$APP" 2>/dev/null | grep -iE "library-validation|jit|audio" || true

echo ""
c_grn "Signed (ad-hoc, hardened runtime, entitlements). Now launch on a CONNECTED display and run:"
echo "  tools/reliability/crash_isolation_proof.sh setup    # pluginSandboxMode=1"
echo "  # launch the signed build your normal way, add ONE ValhallaSupermassive (VST3)"
echo "  tools/reliability/crash_isolation_proof.sh proof    # SIGKILL worker → assert host survives"
