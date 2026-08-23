Resuming the Element audio-plugin UI/UX overhaul. Do NOT start fixing features yet — work in the three phases below, in order, and stop for my input where noted.

CONTEXT — read these first, in order:
1. .omo/audit/SESSION-RESET-HANDOFF.md   (current state, git/branch state, what's done vs the plan)
2. .omo/plans/deep-app-audit.md          (the master plan)
3. docs/CHROMATIC_FEEDBACK_WORKFLOW.md    (the feedback-system design so far)
4. .omo/audit/findings.md, layout-finding.md, ui-feedback.md   (open issues + the feedback sheet)
5. CLAUDE.md + docs/ELEMENT_UNIFIED_BLUEPRINT.md   (design authority — neumorphic, terminology, semantic hues)

HARD LESSONS from the last session — do NOT repeat:
- Chromatic UI Review comments are NOT machine-readable (no public API). Do NOT use Chromatic as the feedback channel.
- Before trusting ANY feedback channel, PROVE a round-trip: point to / leave a test note and confirm YOU can read it programmatically. No channel is "set up" until you've read a real note through it.
- Do NOT implement off a single comment. Collect my full feedback set first, then batch + prioritise.
- Standing rules: fresh build + INSTALL before asking me to test; minimal commits (I decide); I confirm UI changes at runtime. Don't go off on infra tangents.

== PHASE 1 — Fresh research + stand up a WORKING design/review feedback workflow (BEFORE any review) ==
1. Re-research current best practice: Storybook AI/MCP (storybook.js.org/docs/ai, /mcp/overview, /best-practices), Chromatic's actual role, and machine-readable design-feedback channels — compare: Vercel preview Toolbar comments (readable via the Vercel MCP), GitHub PR review comments (readable via gh), annotated screenshots, and a structured repo feedback file. 
2. Verify/repair what already exists: Storybook MCP (@storybook/addon-mcp at http://localhost:6006/mcp) live + usable by you; @storybook/addon-designs; the enriched 41-component Storybook build; and reconcile the git branches — chromatic-ui-review vs local-enhancements — committing the uncommitted W5a C++ (element_webview_host.cpp format/category, graphmanager.cpp origin-pile) so there is ONE source of truth.
3. DECIDE and STAND UP the single feedback channel I will use that YOU can definitely read, and PROVE it round-trips end-to-end (ingest a sample note). Keep Chromatic only as a visual gallery, not the comment channel. Recommend the simplest reliable option.
4. STOP and report: the chosen channel, proof it works (you read a real note), the exact steps for me to give feedback, and the reconciled branch/build state.

== PHASE 2 — Review session (my UI design feedback) ==
- I provide UI design feedback through the validated channel. Help me salvage my ~50 existing notes from Chromatic build 2 first (e.g. I screenshot them, you ingest).
- Capture EVERYTHING into .omo/audit/ui-feedback.md as a tracked, prioritised worklist: {component/view, issue → desired, severity P0–P3, status}. Do NOT implement yet — confirm with me that you've captured it all and agree the priorities.

== PHASE 3 — Update the plan + tasks, then execute ==
- Update .omo/plans/deep-app-audit.md to reflect reality (Gate A passed; Wave 4 ≈void; W5a status) and fold my feedback worklist into Wave 5 as concrete tasks with acceptance criteria.
- Present the revised wave plan for my approval, THEN execute the loop: implement a batch → fresh build + install → I re-review via the channel → iterate → Final review → Gate B.

Start with Phase 1. Do not proceed to Phase 2 until the feedback channel is proven to work.
