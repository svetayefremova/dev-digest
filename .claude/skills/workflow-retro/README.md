# workflow-retro — design rationale

A retrospective on how a multi-agent workflow run went: orchestration performance, not code lessons. It produces both a chat summary and a persisted ledger entry under `docs/retro/ledger/`.

## Why base mode is inline and only deep mode forks

Two harness constraints:

- **A subagent dispatch starts cold.** The Agent tool's documentation says a subagent without `fork` has no memory of the conversation that invoked it. This skill's main data source is the current conversation's own history: its `Agent`/`SendMessage` calls and their completion notifications. Each notification carries a `<usage>` block (`subagent_tokens`, `tool_uses`, `duration_ms`). That data doesn't exist inside a freshly dispatched subagent. So base mode can't be "runs in a subagent and returns a result". It has to be plain instructions the orchestrating agent follows in its own context, the same shape as [`../run-plan/SKILL.md`](../run-plan/SKILL.md), where the main session also orchestrates everything itself.
- **Raw subagent transcripts must never be read inline.** A JSONL transcript can overflow the calling context if it is `Read` or tailed. Deep mode's job is to read the transcripts more closely than the in-context timeline allows. So that work goes to a forked subagent. It runs [`scripts/collect.py`](scripts/collect.py), which extracts fields via Bash and prints a bounded digest of top-N lists, and returns that digest. The transcript is never `Read` whole.

Put together, the two modes fork for opposite reasons. Base mode stays inline because forking would lose its data source. Deep mode forks because staying inline would blow the budget its data source requires.

## Why per-run ledger files, not one append-only ledger

Compare this with `engineering-insights`, whose discipline was tempting to copy and deliberately wasn't:

`engineering-insights` treats `INSIGHTS.md` as one long-lived, shared file per module. Every session appends to the same document, so it is append-only and requires re-reading the target section fresh from disk right before every write ([`../engineering-insights/SKILL.md`](../engineering-insights/SKILL.md)). That discipline exists because a stray write to a shared file destroys every other session's entries.

A retro doesn't have that shape. Each retro is a self-contained document for one specific run: a timeline, a per-phase token table, signals and recommendations. Nothing else writes into the same file. So:

- `Write` carries no clobber risk here, because each ledger file has a unique, generated name (`YYYY-MM-DD-<slug>.md`, with `-2`, `-3` on collision). There's no shared anchor to get wrong.
- Folding every retro into one growing file would mean every future retro has to read the whole thing before writing its own. That is exactly the per-run token cost this skill exists to measure and reduce, which would be self-defeating.
- The one thing a single shared file gives cheaply, the cross-run trend, is recovered without one. Step 4 lists `docs/retro/ledger/`, reads only the `## Recommendations` section of the two most recent entries, and marks repeats `RECURRING (Nth run)`. Each entry also records the git commit it ran on, so a change in the trend can be traced to a change in agents or skills, which aren't versioned separately. There is no hand-maintained index file: `ls` is the index, and an index file is one more artifact that can silently drift from reality.

## Why manual-only

The product owner asked for this twice. There is no "run automatically at the end of a session" mode, and the skill's own "Must not do" section forbids adding one (no hook, no call from another skill). It is enforced with `disable-model-invocation: true`, the same as [`../run-plan/SKILL.md`](../run-plan/SKILL.md). `/run-plan`'s final summary only *mentions* the retro; it never runs it.

## Why this is distinct from engineering-insights

`engineering-insights` answers "what code or engineering lesson did we learn, and which module owns it". Its output goes to that module's `INSIGHTS.md`. `workflow-retro` answers "how well did the agents that did the work coordinate": tokens, order, handoffs, rework. It never touches an `INSIGHTS.md`. A session can produce both kinds of output, and neither replaces the other. A code lesson belongs where future code sessions will look for it. An orchestration lesson belongs where a future workflow run will look for it.

## Files

- `SKILL.md` — the procedure: rebuild the run inline → optional forked deep extraction → signals and recommendations → recurring check → ledger entry → chat summary, plus the "Must not do" list.
- `scripts/collect.py` — the deep-mode extractor (Python 3, standard library only). It reads the parent session's transcript at `~/.claude/projects/<repo-slug>/<session>.jsonl`, plus `<session>/subagents/agent-*.jsonl` and their `.meta.json` (`agentType`, `spawnDepth`, `parentAgentId`) at every nesting depth. It dedupes split API-call records by message id. Output: per-agent tokens (input / cache write / cache read / output), cache hit, peak context, tool calls, durations, peak concurrency, parallelism, shared and repeated file reads, large tool results, and the session's `cost-state` totals.
- `README.md` — this file.

## Not built yet / open questions

- **Unproven on a real run.** This skill hasn't yet been used on an actual multi-agent session. The shapes above are design, not measured behaviour. Treat the first several real invocations as validating the design as much as producing a retro. (`collect.py` alone has been run against past sessions, including one with nesting depth 2.)
- **Deep mode's transcript path is machine-local.** `~/.claude/projects/<repo-slug>/` isn't portable across machines and may prompt for permission. It is also Claude Code's internal format, not a public API, so an update can break `collect.py`. The skill degrades to base mode rather than fail (the fork returns `DEGRADED: <reason>`), but that degrade path is also untested.
- **The lookback depth of 2 entries is a guess**, not a measured number. It may need to be deeper once there's a real history of ledger entries to look back across.
- **In-context `<usage>` may exclude nested agents.** A subagent that spawns its own agents may report only its own tokens. Deep mode exists partly to close that gap, and the size of the gap in practice is unmeasured.
