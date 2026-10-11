---
name: over-mocking
description: Use on every PR that adds or changes mocks, stubs, or spies in tests. Flag tests that mock the unit under test, assert only on mock calls, or mock so much that no real behaviour runs.
type: rubric
---

# Over-mocking

Inspect every `vi.mock`, `vi.fn`, `vi.spyOn`, stub, and hand-written fake the diff
adds or changes. Report a test when any of these is true:

- **The unit under test is mocked.** The module or function the test is named after
  is itself replaced, so the test exercises the mock.
- **Mock-only assertions.** Every assertion is `toHaveBeenCalled*` on a mock, with
  nothing checked about a returned value, rendered output, or stored state.
- **The mock returns the expected value.** The test asserts on a value the mock was
  told to return, passed through unchanged.
- **Internal collaborators are mocked.** Pure helpers or modules of the same package
  are mocked where the real ones would run fast and deterministically. Mocks belong
  at the boundary: network, LLM, GitHub, git, clock, randomness.
- **The mock contradicts the real contract.** The mocked shape, error, or async
  behaviour differs from what the real dependency does.
- **More setup than behaviour.** Mock wiring dominates the test and the remaining
  real code path is trivial.

Do not flag mocks of real external boundaries when the test still asserts on
observable behaviour of the code under test.

Severity: CRITICAL when the test would still pass with the production code deleted
or broken; otherwise WARNING.

In each finding cite the mock's line, say which rule it breaks, and say what should
run for real instead.
