# .jira/

Sprint state for the [jira](https://github.com/koolamusic/claudefiles/tree/main/plugins/jira) workflow.

- `STATE.md` — project-wide state: sprint list, decisions log, blockers
- `CURRENT` — slug of the active sprint
- `sprints/YYYY-MM-DD-<slug>/` — one sprint per directory:
  - `BRIEF.md` (problem statement)
  - `RESEARCH.md` (parallel researcher synthesis)
  - `CONTEXT.md` (locked decisions D-XX, deferred ideas, canonical refs)
  - `01-PLAN.md`, `02-PLAN.md`, ... (one per wave-plan, ≤3 tasks each)
  - `EXECUTION.md` (commits, deviations, results)
  - `VERIFICATION.md` (goal-backward post-execution audit)
  - `RETRO.md` (opt-in)

All files inside sprints are committed.
Run `/jira:research <prompt>` or `/jira:research --issue N` to start a sprint.
