---
name: flaky-tests
description: Use on every PR that adds or changes tests. Flag tests whose result depends on timing, real time, randomness, test order, shared state, or the network.
type: rubric
---

# Flaky tests

Inspect each test the diff adds or changes for a source of nondeterminism. Report a
test when any of these is true:

- **Real waiting.** `setTimeout`, `sleep`, or a fixed delay used to wait for
  something, instead of awaiting the condition or using fake timers.
- **Real clock.** `Date.now()`, `new Date()`, or a timezone- or locale-dependent
  value compared against a fixed expectation without a controlled clock.
- **Randomness.** `Math.random()`, random ids, or generated data that the
  assertions depend on, with no fixed seed.
- **Unawaited async.** A promise that is not awaited or returned, an assertion
  inside a callback the test does not wait for, a missing `await` on an async
  matcher.
- **Shared state.** Module-level variables, singletons, a shared database row, or a
  file that one test writes and another reads, with no reset between tests.
- **Order dependence.** A test that passes only when another test ran first.
- **Unordered data.** Asserting on the order of results that the code does not sort
  (object keys, `Set`/`Map` iteration, a query with no `ORDER BY`).
- **Real network or environment.** A real HTTP call, a dependency on a machine-local
  path, port, or environment variable.
- **Timing assertions.** Asserting that something finished within a wall-clock budget.

Severity: WARNING by default; CRITICAL when the test will fail intermittently in CI
as written (a race on unawaited work, or a real-clock comparison).

In each finding cite the line that introduces the nondeterminism, name the source,
and give the deterministic alternative.
