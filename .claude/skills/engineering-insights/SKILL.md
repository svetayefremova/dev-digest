---
name: engineering-insights
description: Reads and writes the touched module's INSIGHTS.md — its accumulated engineering knowledge. Use at the START of any session or task, before doing any work in a module, to read that module's INSIGHTS.md first — this is mandatory, not optional, regardless of task size. Also use PROACTIVELY the moment you discover something non-obvious (a bug fix, a convention, a library gotcha, a dead end) to append it, and at session end via /engineering-insights or when asked to wrap up or capture learnings — but only write something if it's substantial and not already recorded; otherwise write nothing.
---

# Engineering Insights

Two halves of one loop: read the touched module's INSIGHTS.md before starting work in it, and append durable, high-signal discoveries to it as the session produces them. The next session in that module reads INSIGHTS.md first and gets the discovery for free instead of rediscovering it.

## Read first — mandatory

Before doing any work in a module (writing code, answering a question about it, investigating a bug in it), **read that module's INSIGHTS.md in full first.** This applies every session, not just "nontrivial" ones — triviality is a filter for *writing*, never for *reading*.

- Figure out which module(s) the request concerns from the file paths involved, the module named, or where the first edit will land.
- If the request isn't module-specific yet (a general question, scope still unclear), defer the read until a module becomes clear, then read it before the first action in that module.
- If a task touches more than one module, read each module's INSIGHTS.md before touching that module's files.
- No need to narrate the read unless asked — but let its content actually inform decisions (don't recommend something the file already flagged as a dead end).

## Where it writes

One file per module, no exceptions: `client/INSIGHTS.md`, `server/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`, `e2e/INSIGHTS.md`.

- Pick the file by which module's files the insight is actually about — not which module you happened to start in.
- An insight spanning multiple modules (CI, `scripts/`, `docker-compose.yml`, cross-package contracts) goes into the single module most responsible for it. Don't create a root INSIGHTS.md and don't duplicate the entry across files.

## The quality bar

**Test before writing anything: "would this be obvious to anyone reading the code?" If yes, don't write it.**

Bad (vague, no payoff):
- "Promises can be tricky"
- "be careful with async"

Good (concrete, actionable cold, cites evidence):
- "`Promise.all()` on the ingest pipeline times out after 30 items — use `Promise.allSettled()` batched by 10 (`server/src/adapters/ingest.ts:42`)"
- "checkout state is always via Zustand (`cartStore.ts`), never component-local state, because 3 components share the cart"

Every entry: **date + concrete fact + `file:line` where applicable.** No file:line for pure decisions/conventions — those still need a one-clause "why".

**"What Doesn't Work" is the highest-value section and the one people skip.** A dead end you hit and didn't record is a dead end the next session hits again.

## Before writing: mandatory dedup check

**Never write an entry without first reading the target section fresh from disk — right before the write, not from memory of having read it earlier.** A file you read at session start may have changed since (your own earlier appends this session, or another process). Re-reading costs little; an overwrite is unrecoverable.

- Equivalent entry already exists and is still true → write nothing. This is the expected, common outcome — not a failure to find something to say.
- Same area, now outdated or contradicted → append a new dated entry noting the correction. **Never edit or delete an existing entry to "fix" it** — INSIGHTS.md is append-only, so the history of what was believed when stays intact.
- Genuinely new → append it, in the right section.

## How to append without erasing anything

**Never use a full-file write (overwrite) on an existing INSIGHTS.md. All four already exist — you are always appending to a file, never creating one.**

- Edit in place with a small, targeted insertion: the anchor (`old_string`) is the exact heading of the target section or the last existing line under it; the replacement (`new_string`) is that anchor plus the new entry, nothing else. Every other line in the file passes through untouched.
- **Never retype or reconstruct the full file content from memory** to "add" an entry — if the file is long, or this session's context has been compacted, your memory of it may be incomplete or stale, and reproducing it risks silently dropping entries you didn't fully load. If you haven't just read the exact current content of the section you're editing, read it again first.
- If an edit would touch anything outside the one new entry being added — reformatting, reordering, rewording an existing line — stop. That's a restructuring, not a capture, and it's out of scope for this skill; flag it to the user instead of doing it unprompted.
- After writing, the entry you added should be the only diff. If you're not confident of that, re-read the file to confirm before moving on.

## File structure

Each module's INSIGHTS.md has seven fixed sections — always append to the matching one, never invent new sections:

| Section | What goes here |
|---|---|
| What Works | An approach/solution that worked, and why |
| What Doesn't Work | A dead end or antipattern, and why it fails |
| Codebase Patterns | A convention or architectural decision specific to this module |
| Tool & Library Notes | A dependency quirk, version gotcha, config surprise |
| Recurring Errors & Fixes | Error signature → root cause → fix |
| Session Notes | Dated free-text summary of a session's work (`### YYYY-MM-DD`) |
| Open Questions | Something unresolved worth flagging for a human |

## When to capture — and when not to

- **As you go** (primary mode): the instant you hit something non-obvious — a confusing bug's real cause, a library behaving unexpectedly, a convention you had to infer rather than read — append it right then (after the dedup check above). Don't batch it up and risk forgetting.
- **End of task/session** (via `/engineering-insights` or when asked to wrap up) is **mandatory to run**, but writing anything is conditional: review what was done, and append only if something substantial surfaced that (a) meets the quality bar above and (b) isn't already in INSIGHTS.md per the dedup check. A dated Session Notes entry is only worth adding if there's something worth summarizing beyond "worked on X."
- **If nothing substantial and new came out of the session — write nothing.** Silence is the correct, expected outcome for small or routine sessions (typo fixes, a session that only confirmed what INSIGHTS.md already said, no new discovery). Do not pad the file just to have produced output.

## Known limitation

Proactive triggering depends on the agent noticing and choosing to invoke this skill — it is not guaranteed to fire every time something insight-worthy happens. `/engineering-insights` exists as the reliable fallback for end-of-session capture. A fully deterministic capture (session-end hook) is a later, separate piece of work — this skill intentionally does not install one.

## Pruning

Not this skill's job to run automatically, but flag it: once a section passes roughly 150–200 entries, signal-to-noise drops. Recommend a quarterly human review to remove entries for deleted/refactored code, consolidate duplicates, and resolve stale Open Questions — don't do this unprompted mid-task.
