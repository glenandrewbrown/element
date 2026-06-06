<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# tools/ — Automation and Reliability Tooling

Shell scripts and Python suites for autonomous UI verification, reliability
sign-off, and developer code-signing. Two subdirectories with distinct
scopes: `automation/` drives macOS Accessibility API assertions against a
running Element instance; `reliability/` contains the sandbox crash-isolation
proof and dev signing helpers.

## Subdirectories
| Directory | Description |
|-----------|-------------|
| `automation/` | AX-based autonomous UI verification — no screenshots needed |
| `reliability/` | Crash-isolation sign-off script + dev ad-hoc signing |

## For AI Agents
- Both suites require Element to be running. Launch headlessly via
  `agent-harness/` (`cli-anything-element app launch --fresh`) before invoking.
- See each subdirectory's AGENTS.md for per-suite entry points and gotchas.
