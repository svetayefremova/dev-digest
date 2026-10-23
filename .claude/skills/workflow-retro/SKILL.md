---
name: workflow-retro
description: Retrospective on how a multi-agent workflow run went (usually /run-plan) — orchestration performance, not code lessons. Rebuilds the run's timeline, per-phase token use, handoffs and rework from the current conversation, turns them into concrete workflow recommendations, and writes a chat summary plus a per-run ledger file under docs/retro/ledger/. Base mode runs inline; --deep forks a subagent that extracts per-agent metrics from the transcripts on disk, because the parent's usage may not include nested subagents. Manual invocation only.
argument-hint: "[--deep] [--plan docs/plans/<name>.md] [--since <ISO time>]"
disable-model-invocation: true
---

# /workflow-retro — how well did the agents coordinate

Run it by hand, in the session that ran the workflow, after the run is finished. It answers "how did the orchestration go": tokens, order, parallelism, handoffs, rework. It does **not** answer "what did we learn about the code". That belongs to `engineering-insights` and a module's `INSIGHTS.md`, which this skill never touches.

**You follow these steps yourself, in this conversation.** Base mode must not be delegated. A non-fork subagent starts cold and has none of the Agent/SendMessage history this retro is built from. Only deep mode forks, and only for the transcript extraction (Step 2).

## Arguments

- `--deep` → also run Step 2 (forked transcript extraction). Without it, Step 2 is skipped.
- `--plan <path>` → the plan the run executed. Default: the plan named in the newest `.claude/sdd-runs/*.md` run ledger, else the plan path you passed to agents in this conversation, else `—`.
- `--since <ISO time>` → start of the run, when the session did unrelated work before it. Default: the first workflow Agent call in this conversation.

## Step 1 — rebuild the run from this conversation (base mode, inline)

Work only from what is already in your context. Read no transcripts.

1. **Timeline.** List every `Agent` and `SendMessage` call since the run started, in order. For each, record:
   - agent type and description;
   - whether it was foreground or background, and which calls went out in the same message (parallel);
   - the pipeline phase it belonged to (`/run-plan` P1–P5, or the plan step / workstream);
   - its outcome (status line: `PASS`, `FINDINGS`, `VERIFIED`, `BLOCKED`, `PARTIAL`, …).
2. **Usage per dispatch.** Take each completion notification's `<usage>` block: `subagent_tokens`, `tool_uses`, `duration_ms`. Missing for a call → write `—`. Never estimate. These numbers can cover only the agent itself, not agents it spawned. Say so wherever an agent is known to have spawned its own.
3. **Run ledger.** If `.claude/sdd-runs/<plan>.md` exists, read it: fix rounds per loop, findings by source, waivers, oscillation stops. It names the rework that the timeline shows as repeated dispatches.
4. **Handoffs.** For each dispatch, note what it received: paths, or pasted content (diffs, file bodies, long findings lists). Also note whether an agent had to rediscover something an earlier agent had already established.
5. **Your own overhead.** Count user questions and gates that paused the run, and any dispatch you had to redo because the prompt was wrong or incomplete.

## Step 2 — deep extraction (only with `--deep`, forked)

Raw subagent transcripts must never be `Read`, `cat`ed or tailed in this context. One JSONL file can overflow it. Delegate:

```
Agent(subagent_type: "fork", description: "workflow-retro deep extraction", prompt: "<below>")
```

Fork prompt (fill in the session id and `--since`):

> Run `python3 .claude/skills/workflow-retro/scripts/collect.py --deep --session <id> [--since <ISO>]` and return its markdown output unchanged, plus at most 10 lines of your own observations on it. Never Read, cat, head, tail or grep the `.jsonl` transcripts directly. If you need a field the script doesn't print, extract only that field with `jq` or `grep -c` and keep each command's output under 50 lines. If the transcript directory is missing, unreadable or permission is denied, return exactly `DEGRADED: <reason>` and stop.

- The fork returns a bounded digest. It has per-agent tokens (input / cache write / cache read / output), cache hit, peak context, tool calls by tool, durations, peak concurrency, parallelism factor, files read by several agents, re-reads, large tool results, and the session's own `cost-state` totals.
- `DEGRADED: …` → continue in base mode, and record `Mode: base (deep degraded: <reason>)` in the ledger entry.
- Where deep totals differ from the Step 1 `<usage>` numbers, report the gap. It usually means nested subagents that the parent's numbers left out.

## Step 3 — signals and recommendations

A signal is an observation with a number from Step 1 or 2. A recommendation is a concrete change to a named file (agent `.md`, skill, `run-plan/SKILL.md`, the plan template) that the signal justifies. At most 5 recommendations, ordered by expected savings. Each cites its signal. No generic advice.

| Signal | Typical recommendation |
|---|---|
| The same file is read by ≥ 3 agents, or later agents rediscover what an earlier one established | Preload the shared file (agent `skills:` or a path in the dispatch prompt) |
| Pasted content in handoffs, an agent re-reading the same file, tool results ≥ 20k chars | Remove duplicated context: pass paths, read with offset/limit, use `scripts/check.sh` summaries |
| One agent ≥ 40% of the run's tokens, peak context near the model limit, or ≥ 80 tool calls | Split the overloaded role or narrow its scope per dispatch |
| API errors, or parallelism ≈ 1.0 despite parallel launches | Lower concurrency or stagger launches |
| Parallelism ≈ 1.0 where the plan had independent workstreams | Dispatch them in parallel (within `/run-plan`'s cap of 2) |
| A fix loop needed round 2, or the same finding type came back | Add the missing rule to the implementer's skills or the plan template |
| Low cache hit for many short agents | Stabilise the prompt prefix, or merge agents whose cold start costs more than their work |
| Dispatches redone because of a bad prompt, or gates waiting on the user | Fix the orchestration step in `run-plan/SKILL.md` that produced them |

## Step 4 — recurring recommendations

1. `ls docs/retro/ledger/` (sorted by name = by date). Missing directory → no history; skip.
2. From the **two most recent** entries, read only their `## Recommendations` section (e.g. `sed -n '/^## Recommendations/,/^## /p' <file>`), never the whole file.
3. Each new recommendation that matches an earlier one in substance (same change to the same file) gets the tag `RECURRING (Nth run)`. N counts consecutive entries carrying it, including this one. An earlier tag `RECURRING (2nd run)` makes this the 3rd.

## Step 5 — write the ledger entry

`Write` a new file `docs/retro/ledger/YYYY-MM-DD-<slug>.md`. The slug is the plan's file name without `.md`, or a short kebab-case name of the run. If that name exists, append `-2`, `-3`, …. Create the directory if needed. `Commit:` is `git rev-parse --short HEAD`, plus ` dirty` when `git status --porcelain` is non-empty. It ties a trend change to the workflow change that caused it. Never edit an earlier entry, and never create an index file. `ls` is the index.

```markdown
# Workflow retro — <plan path | run name>

Date: YYYY-MM-DD · Session: <first 8 chars> · Mode: <base | deep | base (deep degraded: …)>
Commit: <git rev-parse --short HEAD>[ dirty]
Wall clock: <t> · Dispatches: <n> (<types×count>) · Fix rounds: <arch r, verify r | —>

## Timeline
| # | Phase | Agent (type — description) | Parallel with | Outcome | Tokens | Tool uses | Duration |
|---|---|---|---|---|---|---|---|

## Tokens per phase
| Phase | Dispatches | Tokens | Share | Tool uses | Duration |
|---|---|---|---|---|---|

## Deep metrics
<the fork's digest tables, or "not run">

## Signals
- S1 — <observation with number and source>

## Recommendations
1. <change> — file: <path> — because: S<n> [— RECURRING (Nth run)]
```

## Step 6 — chat summary (short)

```
/workflow-retro — <plan | run> — <base | deep | base (deep degraded)>
Wall <t> · <n> dispatches · tokens <total> (top: <phase/agent — share>) · fix rounds <…>
Recommendations:
1. <change> — <file> [RECURRING (Nth run)]
…
Ledger: docs/retro/ledger/<file>
```

## Must not do

- No automatic mode: never run at session end, from a hook, from another skill, or without an explicit `/workflow-retro`. Don't add such a trigger.
- Never `Read`, `cat` or tail a `.jsonl` transcript in the main context. Deep mode goes through the fork only.
- Never delegate base mode to a non-fork subagent.
- Never write to any `INSIGHTS.md`, and never edit agent, skill or plan files. Recommend only; the user decides.
- Never rewrite earlier ledger entries or create a shared ledger or index file.
- Never invent a number. Missing data is `—`.
