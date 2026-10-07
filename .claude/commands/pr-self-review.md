---
description: Review the current branch's diff against main before opening a PR, and block merging if any CRITICAL finding is found
---

Run the `pr-self-review` skill now.

Arguments: `$ARGUMENTS`

- If `$ARGUMENTS` contains `--override "<reason>"`, pass that reason through to the skill's Step 6 override handling — the review still runs in full and still reports every finding, the override only changes whether the PreToolUse hook lets a BLOCKED verdict through.
- If `$ARGUMENTS` contains `--force`, ignore any cached verdict for the current diff hash and re-run the full review.
- With no arguments, run the normal cache-aware flow.

Follow the skill's steps exactly — diff/cache check, domain mapping, always-on checks, time-budgeted domain-skill passes, severity normalization, verdict, cache write, and the human-readable report ending in the `🚫 BLOCKED` / `✅ Ready for PR` / `⚠️ Review incomplete` line. This command is also what the PreToolUse hook invokes headlessly before `gh pr create` / `gh pr merge` / `git push` — the skill's "Headless / machine-readable output contract" section applies whenever this command is run non-interactively.
