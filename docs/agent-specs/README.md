# docs/agent-specs

Agent specifications written by the `planner` agent (`.claude/agents/planner.md` → *Agent spec workflow*). A spec describes a new or changed project subagent: its responsibility, frontmatter, write scope, input gate, procedure, report format and verification. A human turns it into `.claude/agents/<name>.md` (and a hook, if the spec needs one). `.claude/**` stays human-owned.

- One file per agent, named per [Naming](#naming). The template lives in `planner.md` → *Agent spec template*.
- Lifecycle: `Status: draft` (planner may still rewrite it) → `approved` (set by a human; frozen, since the planner's write guard refuses non-draft files) → `done` (set by the human once `.claude/agents/<name>.md` exists and the spec's Verification passed).
- The planner can write here and in `docs/plans/` only (`.claude/hooks/planner-write-guard.sh`). This README is human-maintained.
- When creating the agent, apply the spec's *README & skills-table updates* section to `.claude/agents/README.md` and `.claude/skills/README.md`.

Flow: request → `planner` → `docs/agent-specs/<name>.md` (`draft`) → human review → `approved` → human writes `.claude/agents/<name>.md` (+ hook) → dry runs from the spec's Verification → `done`.

## Naming

Pattern: `<agent-name>.md`, where `<agent-name>` is the agent's future `name:` (e.g. `security-reviewer.md`). This is deliberately not the verb-phrase rule of `docs/plans/`: a spec documents one agent, and the file name must match the agent file.

- Lowercase ASCII letters, digits and hyphens only.
- Name the role, not the task: `security-reviewer`, not `review-security`.
- A spec for a change to an existing agent uses that agent's name. If a spec with that name already exists and is no longer `draft`, add a suffix that names the change: `architecture-reviewer-coupling-rules.md`.
