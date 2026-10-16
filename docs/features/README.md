# docs/features

One page per implemented feature, written by the `doc-writer` agent ([`.claude/agents/doc-writer.md`](../../.claude/agents/doc-writer.md)) after the feature is implemented and verified.

- File name: `<slug>.md`, named like plans (see [Naming](../plans/README.md#naming)): lowercase, hyphens, imperative verb phrase naming the outcome, e.g. `add-review-retry-on-timeout.md`. The slug matches the plan slug when there is one.
- One [Diátaxis](https://diataxis.fr) type per page (tutorial, how-to, reference or explanation).
- The `doc-writer` cannot edit this README ([`.claude/hooks/doc-writer-write-guard.sh`](../../.claude/hooks/doc-writer-write-guard.sh)). It proposes an index line in its report; a human adds it.
- This README is human-maintained.

## Index

| Feature | Doc | Plan | Modules |
|---|---|---|---|
| No features documented yet. | | | |
