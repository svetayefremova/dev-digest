---
name: edge-case-checklist
description: Use whenever the diff adds or changes a function that takes input. Check the tests against a fixed list of boundary inputs and flag each relevant one that is untested.
type: rubric
---

# Edge-case checklist

For each function, route handler, or component the diff adds or changes, go through
this list. For every item that is relevant to the code's inputs, check that a test
in the diff uses that input. Report each relevant item that is missing.

- **Empty** — empty string, empty array, empty object, zero rows returned.
- **Absent** — `null`, `undefined`, a missing optional field, a missing key.
- **Boundaries** — 0, 1, -1, the exact limit, limit + 1, the first and last element.
- **Size** — a single item versus many; input longer than any limit the code applies.
- **Duplicates and order** — repeated values, already-sorted and reverse-sorted input.
- **Format** — whitespace-only, mixed case, unicode, invalid or malformed input.
- **Failure** — the dependency rejects, times out, or returns an unexpected shape.
- **Repeat calls** — calling twice, or concurrently, when the code holds state.

Rules:

- Skip items that cannot apply to the code (no numeric input → no numeric bounds).
  Do not report a missing case you cannot tie to a specific line.
- A comparison (`<`, `<=`, `>`, `>=`, `.length`, slice, pagination) always makes its
  boundary value relevant: the test must hit the exact boundary, not only values
  comfortably on either side.
- One finding per function, listing its missing cases together — not one finding
  per case.

Severity: WARNING by default; CRITICAL when the untested boundary sits on a
comparison, limit, or validation that this PR introduces.

In each finding cite the production line that makes the case relevant and name the
concrete input value the missing test should use.
