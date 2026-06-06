<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# tools/reliability/ — Crash-Isolation Proof and Dev Signing

Contains the live reliability sign-off script (`crash_isolation_proof.sh`)
that implements the Bitwig-model proof: launch Element, load a real plugin
out-of-process via `element_sandbox_host`, SIGKILL the worker, and assert
the host survives. Also provides an ad-hoc dev signing helper.

## Key Files
| File | Description |
|------|-------------|
| `crash_isolation_proof.sh` | Live sign-off: worker SIGKILL → host-survive assertion |
| `sign-dev-build.sh` | Ad-hoc codesign for local dev builds (no Developer ID needed) |

## Sandbox Context
- Worker binary: `element_sandbox_host` (bundle ID `net.kushview.Element.sandbox`)
- The helper must be present inside `Element.app` bundle at the time the script runs
- Installer wiring of `element_sandbox_host` is a **pending TODO** in `installer/build_pkg.sh`

## For AI Agents
```bash
# Full reliability sign-off (Element must NOT already be running)
bash tools/reliability/crash_isolation_proof.sh

# Ad-hoc sign a fresh dev build before running reliability tests
bash tools/reliability/sign-dev-build.sh build-merged
```

**Gotcha — GUI-launch trap:** macOS Gatekeeper blocks ad-hoc-signed `/tmp`
binaries launched via `open -a`. Use `crash_isolation_proof.sh` (terminal
launch path) rather than GUI or `computer-use` for this test.

**Gotcha — single instance:** kill any running Element before the script; a
second instance collides on OSC port 9000 and the verify step returns a
false negative.
