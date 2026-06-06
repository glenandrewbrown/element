<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# .github/ — CI Workflows, Issue Templates, and Copilot Config

GitHub Actions workflows, issue/PR templates, and Copilot prompt files.
Conventional Commits are enforced via a commit-msg hook — all commits must
follow the `type(scope): description` format.

## Workflows (`workflows/`)
| File | What it does |
|------|-------------|
| `build.yml` | Main CI build matrix (macOS, Linux, Windows) |
| `release.yml` | Release pipeline — builds + packages installer artifacts |
| `chromatic.yml` | Publishes Storybook to Chromatic for visual UI review |
| `ldoc.yml` | Generates Lua API docs via LDoc |
| `archlinux.yml` | Arch Linux build check |
| `reuse.yml` | REUSE/SPDX license compliance check |

## Issue Templates (`ISSUE_TEMPLATE/`)
| File | Purpose |
|------|---------|
| `bugreport.yaml` | Structured bug report form |
| `feature_request.md` | Feature request template |

## Prompts (`prompts/`)
| File | Purpose |
|------|---------|
| `midiclock.md` | Copilot prompt: MIDI clock implementation context |
| `unittests.md` | Copilot prompt: unit test writing guidance |

## Other
| File | Purpose |
|------|---------|
| `copilot-instructions.md` | GitHub Copilot workspace instructions |
| `FUNDING.yml` | GitHub Sponsors / funding links |

## For AI Agents
- To trigger a release build, push a version tag matching `v*.*.*`.
- Chromatic workflow runs on every PR targeting `main`; visual regressions
  surface as PR review comments (see `docs/CHROMATIC_FEEDBACK_WORKFLOW.md`).
- Never skip the commit-msg hook (`--no-verify`) — Conventional Commits
  format is required for changelog generation.
