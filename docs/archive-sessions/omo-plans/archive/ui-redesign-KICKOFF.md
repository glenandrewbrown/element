> 🗄️ **ARCHIVED — SUPERSEDED. Do NOT execute.** Kickoff prompt for the now-superseded `ui-redesign-execution.md` (the denied+reverted Pass-1 lineage). The current fresh-session kickoff is `.omo/PROJECT-STATE.md` §9. Live UI method: `.omo/plans/mvp-bakeoff-plan.md` · `.omo/bakeoff/VERDICTS.md`.
> Current state: `.omo/PROJECT-STATE.md` · plans index: `.omo/plans/README.md`. _(Archived 2026-05-30.)_

# Fresh-Session Kickoff Prompt — Element UI/UX Redesign

> Paste the block below as the FIRST message in a fresh Claude Code session (standard, NOT FleetView/remote-control — so the magic 21st builder isn't 1s-capped).

---

```
/start-work .omo/plans/ui-redesign-execution.md

Execute this plan as the Sisyphus orchestrator with native sub-agents in parallel waves. Read the plan in full first — it is critic-approved (Claude Opus) and self-contained.

NON-NEGOTIABLE EXECUTION RULES:
1. AGENTS: Use ONLY Claude models (opus/sonnet) for every sub-agent. NEVER route any agent to a ChatGPT/GPT/non-Claude model. `oracle` and `ultrabrain` are BANNED. Do NOT use Momus (it routed to a non-Claude model and aborts) — for any plan/review gate use the Claude Opus `critic` agent. Review/verify lanes use unspecified-high / deep / code-reviewer / qa-tester / verifier.

2. SUB-AGENT PROTOCOL (prevents the recurring sonnet "context-limit / needs extra usage" error — see the plan's "Sub-Agent Execution Protocol"):
   - Do the Pre-Wave-0.5 Hygiene step FIRST: run `git status`; PAUSE for Glen to decide commit/stash/allow-list for the dirty `src/nodes/reroutenode.hpp` + `test/integration/SessionChangedTest.cpp` + untracked `test/*Tests.cpp`; capture baseline `git rev-parse HEAD > .omo/audit/plan-baseline-sha.txt`.
   - Run a canary sub-agent before each wave; abort fan-out if it errors.
   - Pin a standard (non-1M-beta) Claude model per sub-agent; pass each agent ONLY its task section + the listed file:line references — NEVER the whole plan, never broad globs, ≤3 files per task.
   - Cap concurrency at ≤4 until a wave proves stable.
   - SUB-AGENTS EDIT FILES ONLY — the orchestrator (you) does ALL git commits, one `git add … && git commit -F - <<'EOF'…` per wave boundary; `rm -f .git/index.lock` if stale.

3. GATES: Per wave boundary, automated AC must pass FIRST (Storybook story + run-story-tests + Chromatic diff), THEN present to Glen for a combined runtime-confirm + Chromatic-baseline-accept (the 💬 panel / live app). Do NOT auto-proceed past a gate. A rejected component goes to the fix-lane and does not block the rest of the wave.

4. CONSTRAINTS: neumorphism ONLY (no glass/blur) via the neumorphism-generator skill + locked seed; never free-generate tokens. No web/cloud deploy. Single-writer hot files (index.css, App.tsx/AppShell, useAppStore, taxonomy Records, demoGraph) land in Wave 0.5 then are READ-ONLY for component tasks. New .cpp → cmake reconfigure. Webview-only build → force-cp dist into the .app bundle. Do NOT push (Glen decides). Do NOT re-touch shipped Wave 1/2 work.

5. TOOLS per task (from the validated toolchain): Storybook MCP get-documentation (real props) + run-story-tests (self-heal); neumorphism-generator (neu CSS); Stitch MCP (layouts, seed DESIGN.md); HF Qwen image-gen (icons/shapes); magic logo_search (brand SVGs); uiverse-galaxy / reactbits (patterns/motion); @storybook/addon-designs (per-story ref); Chromatic (visual gate). The plan assigns the tool per task.

Begin with the Pre-Wave-0.5 Hygiene step and report the git state + your proposed allow-list to Glen before launching the canary.
```

---

## Why /start-work + native sub-agents (not team/autopilot/ultrawork)
- The 24 items need a **per-component Glen+Chromatic human gate** — /start-work's tracked-boulder + batched-confirm model fits gated work; autopilot/ultrawork weaken the human-gate cadence.
- Shared hot files (index.css, App.tsx, Records, demoGraph, bundle/Chromatic) make worktree-parallel `team` workers collision-prone; a **single orchestrator = single git writer** sidesteps the `.git/index.lock` contention entirely (sub-agents only edit files).
- Survives interruption (boulder state) and gives Glen a clean batched review rhythm.
