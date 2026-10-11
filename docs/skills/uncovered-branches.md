---
name: uncovered-branches
description: Use on every PR that changes production code. Flag each new or changed branch (if/else, switch case, early return, catch, ternary, ?? / || fallback) that no test in the diff exercises.
type: rubric
---

# Uncovered branches

For every production file changed in the diff:

1. List the branches the diff adds or modifies: each `if` / `else`, `switch` case,
   early `return` or `throw`, `catch` block, ternary arm, and `??` / `||` / `?.`
   fallback.
2. For each branch, look for a test in the diff whose inputs drive execution down
   that branch AND whose assertions would fail if the branch were wrong.
3. Report every branch with no such test.

Rules:

- A test that only walks the happy path covers one branch. Do not credit it for the
  others.
- Error branches count. A new `throw`, a `catch`, or a 4xx/5xx response path with
  no test is a finding.
- Executing a branch without asserting on its outcome does not count as covering it.
- If the diff changes production code and adds or changes no tests at all, report
  that once, against the most important changed branch.

Severity: CRITICAL when the uncovered branch is an error, permission, or
data-loss path, or is the main behaviour the PR introduces; otherwise WARNING.

In each finding cite the production lines of the uncovered branch, state the
condition that reaches it, and describe the missing test in one sentence.
