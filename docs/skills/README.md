# Review skills

Skills are reusable blocks of review instructions — a name, a directive
description, a type and a markdown body. They are text only: a skill has no tools
and nothing in it is executed. In DevDigest they are created, edited and imported
on the **Skills** page, stored in the database (the source of truth at run time),
and linked to agents on the agent editor's **Skills** tab, where their order sets
the order of the blocks in the assembled prompt.

The files here are the human-readable originals of the skills written for the
[Test Quality Reviewer](../agent-prompts/test-quality-reviewer.md):

| Skill | How to add it |
|---|---|
| [`uncovered-branches.md`](./uncovered-branches.md) | Create in the UI, or import the file |
| [`edge-case-checklist.md`](./edge-case-checklist.md) | Create in the UI, or import the file |
| [`over-mocking.md`](./over-mocking.md) | Create in the UI, or import the file |
| [`flaky-tests.zip`](./flaky-tests.zip) | Import the archive |

`flaky-tests.zip` is built from [`flaky-tests/`](./flaky-tests) and deliberately
carries `scripts/check.sh` next to its `SKILL.md`. The import reads only
`SKILL.md`; the script shows up in the preview as skipped and is never unpacked or
run. Rebuild the archive after editing the folder:

```sh
cd docs/skills && rm -f flaky-tests.zip && zip -qr flaky-tests.zip flaky-tests
```

An imported skill is saved switched off and linked to no agent. Someone else's
skill is someone else's instructions in your agent's prompt — read it in the
preview, then select it on the agent's Skills tab. Selecting a skill for an
agent is what puts it in that agent's prompt.
