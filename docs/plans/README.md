# docs/plans

Development Plans written by the `planner` agent (`.claude/agents/planner.md`) and executed by the `implementer` agent (`.claude/agents/implementer.md`).

- One file per change, named per [Naming](#naming). The template lives in `planner.md`.
- Lifecycle: `Status: draft` (planner may still rewrite it) → `approved` (set by a human; frozen, since the planner's write guard refuses non-draft files) → `done`.
- The planner can write only here and in [`docs/agent-specs/`](../agent-specs/README.md) (`.claude/hooks/planner-write-guard.sh`). This README is human-maintained.
- Skill tags in plan steps come from the routing table in `.claude/skills/README.md`.
- `plan-verifier` reads the plan and checks every item; keep criteria checkable.

Flow: `researcher` (optional, any time) → `planner` → human sets the plan to `Status: approved` → `implementer <plan path>` → `test-writer` (optional, when tests are missing) → `plan-verifier <plan path>` + `architecture-reviewer` (+ security reviewer, planned, not in this folder yet) → `doc-writer` → `/pr-self-review` → PR.

## Naming

Pattern: `<verb-phrase>.md`, e.g. `add-test-review-verify-docs-agents.md`. No date in the name — the date lives in the plan's `Date:` header and in git history.

- Lowercase ASCII letters, digits and hyphens only (no underscores, spaces or capitals).
- Start with an imperative verb: `add-`, `fix-`, `refactor-`, `remove-`, `migrate-`, …
- Name the outcome, not the topic: `add-review-retry-on-timeout`, not `review-retries`.
- Keep it short: about 2–6 words, at most 50 characters.
- No generic words (`plan`, `update`, `misc`, `new`, `changes`).
- Names must be unique. If one is taken, make the new slug more specific; never overwrite another plan.
- Once a plan is `approved`, its name is frozen — implementation reports and PRs reference it.

Sources: [Google developer documentation style guide — filenames](https://developers.google.com/style/filenames) (lowercase, hyphens, ASCII, no generic names); [architecture-decision-record — file naming](https://github.com/joelparkerhenderson/architecture-decision-record) (imperative verb phrase, like a commit message).
