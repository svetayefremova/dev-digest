#!/usr/bin/env bash
# PreToolUse(Write|Edit) guard for the `implementer` subagent (wired in .claude/agents/implementer.md frontmatter).
#
# The implementer writes production code only; tests belong to `test-writer`. This hook denies exactly
# the test-writer allowlist (.claude/hooks/test-writer-write-guard.sh) — keep the two lists in sync:
#   - client/src/**/*.test.ts(x), client/src/test/**
#   - server/test/**, server/src/**/*.test.ts
#   - reviewer-core/test/**, reviewer-core/src/**/*.test.ts
#   - mcp/test/**
#   - plus any *.test.ts(x) / *.it.test.ts / *.spec.ts(x) anywhere (belt and braces)
#
# Everything else is allowed: the implementer's scope is enforced by its prompt (plan Files), not here.
# Fails CLOSED only when the input can't be parsed (exit 2); a parsed non-test path is allowed (exit 0).

set -uo pipefail

deny() {
  echo "implementer-write-guard: $1" >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || deny "jq not found; cannot verify the target path"

INPUT_JSON="$(cat)"
FILE_PATH="$(printf '%s' "$INPUT_JSON" | jq -r '.tool_input.file_path // ""' 2>/dev/null)"
[ -n "$FILE_PATH" ] || deny "no file_path in tool input"

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(printf '%s' "$INPUT_JSON" | jq -r '.cwd // ""')}"
[ -n "$PROJECT_DIR" ] || deny "cannot resolve project dir"
PROJECT_DIR="${PROJECT_DIR%/}"

case "$FILE_PATH" in
  /*) ABS="$FILE_PATH" ;;
  *)  ABS="$PROJECT_DIR/$FILE_PATH" ;;
esac

# Non-canonical paths could hide a test path (`server/src/../test/x.ts`).
case "$ABS" in
  *"/../"*|*"/.."|*"/./"*|*"/."|*"//"*) deny "path traversal / non-canonical path is not allowed: $FILE_PATH" ;;
esac

REL="${ABS#"$PROJECT_DIR"/}"

if [[ "$REL" =~ \.(test|it\.test|spec)\.tsx?$ ]] \
  || [[ "$REL" =~ ^client/src/test/ ]] \
  || [[ "$REL" =~ ^server/test/ ]] \
  || [[ "$REL" =~ ^reviewer-core/test/ ]] \
  || [[ "$REL" =~ ^mcp/test/ ]]; then
  deny "test files are written by the test-writer agent, not the implementer (got: $FILE_PATH). List a broken existing test under 'Failing existing tests' instead."
fi

exit 0
