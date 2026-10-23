# docs/plans

Implementation Plans written by the `implementation-planner` agent (`.claude/agents/implementation-planner.md`) and executed by the `implementer` agent (`.claude/agents/implementer.md`).

- One file per change, named per [Naming](#naming). The template lives in `implementation-planner.md`.
- Lifecycle: `Status: draft` (the planner may still rewrite it) → `approved` (set by a human; frozen, since the planner's write guard refuses non-draft files) → `done`.
- The implementation-planner can write only here (`.claude/hooks/implementation-planner-write-guard.sh`). This README is human-maintained.
- Every plan records its `Execution mode`: `single-agent` (one `implementer`, linear pass) or `multi-agent` (an `## Execution` table of workstreams with non-overlapping `Owns files` forming a DAG; `W0` with contracts/DB runs first, the rest in parallel, verification once on the combined diff). Every plan also has a `## Tests` table (`T#` rows, written by `test-writer`, never the implementer) and one `TW-<pkg>` test workstream per package with tests.
- Every plan records `Requirements (verified)` as checkable `RQ` items (unconfirmed ones marked `assumed default — confirm`) and `Open questions & recommendations` (non-blocking spec issues, technical decisions and which recommendations were accepted). Requirements come from an approved spec; the planner never re-clarifies them. Every step lists the spec ACs it implements (`ACs: SPEC-NN/AC-k`, or `—` with a reason) and the `RQ` items it `Covers`.
- Skill tags in plan steps come from the routing table in `.claude/skills/README.md`.
- `plan-verifier` reads the plan and checks every item; keep criteria checkable.

Flow: `researcher` (optional, any time) → `implementation-planner` round 1 (verified requirements, questions, recommendations, execution mode; no file) → user answers → `implementation-planner` round 2 (writes the plan) → human sets the plan to `Status: approved` → `implementer <plan path>` (multi-agent: one per `W*` workstream, `W0` first; production code only) → check gate (`scripts/check.sh` per touched package) → `test-writer <plan path> package <pkg>` per `TW-*` row → `plan-verifier <plan path>` ∥ `architecture-reviewer` ∥ `/code-review` ∥ `/security-review` → fix loop (`implementer fix: <plan path>` + findings) → `doc-writer` → `/pr-self-review` → PR.

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
