---
description: Wrap up the session by capturing engineering insights into the touched module's INSIGHTS.md
---

Run the `engineering-insights` skill now as an explicit end-of-session wrap-up:

1. Review this session/task across all modules touched (`client/`, `server/`, `reviewer-core/`, `e2e/`).
2. For each module touched, identify anything non-obvious worth recording: what worked, what didn't, codebase patterns, tool/library quirks, recurring errors and fixes, open questions. Apply the quality bar from the skill — skip anything obvious from reading the code.
3. For each candidate, read the target module's `INSIGHTS.md` section first (mandatory dedup check). If it's already captured there and still true, drop the candidate.
4. Append only what survives steps 2–3 to the correct section(s) of that module's `INSIGHTS.md`, plus a dated `Session Notes` entry — but only if there's something beyond "worked on X" worth summarizing.
5. Running this command is mandatory; writing anything is not. If nothing survived steps 2–3 for a module, write nothing to its `INSIGHTS.md`.
6. Report back either a short list of what was appended and where, or — just as validly — that nothing was written, and why (nothing substantial / everything already recorded).
