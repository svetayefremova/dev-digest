#!/usr/bin/env bash
# PreToolUse(Write|Edit) guard for the `test-writer` subagent (wired in .claude/agents/test-writer.md frontmatter).
#
# The test-writer may only write test files and test helpers. Allowlist (relative to project root),
# each justified by the package's vitest `include`:
#   - client/src/**/*.test.ts(x)          (client/vitest.config.ts)
#   - client/src/test/**/*.ts(x)          (shared setup/helpers)
#   - server/test/**/*.ts                 (*.test.ts, *.it.test.ts, helpers/*.ts)
#   - server/src/**/*.test.ts
#   - reviewer-core/test/**/*.ts
#   - reviewer-core/src/**/*.test.ts
#
# Deliberately excluded: e2e/ (flows are JSON fixtures, out of this agent's scope), package.json,
# vitest configs, vendored code, *.d.ts and all production .ts/.tsx (denied by omission).
#
# Fails CLOSED: anything that can't be positively verified is denied (exit 2).

set -uo pipefail

deny() {
  echo "test-writer-write-guard: $1" >&2
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

# 1. Reject `..` and `.` segments and empty segments (`//`).
case "$ABS" in
  *"/../"*|*"/.."|*"/./"*|*"/."|*"//"*) deny "path traversal / non-canonical path is not allowed: $FILE_PATH" ;;
esac

# 2. Must be inside the project.
case "$ABS" in
  "$PROJECT_DIR"/*) ;;
  *) deny "path is outside the project (got: $FILE_PATH)" ;;
esac
REL="${ABS#"$PROJECT_DIR"/}"

# 3. Never vendored, never declaration files.
if [[ "$REL" =~ (^|/)node_modules/ ]] || [[ "$REL" =~ (^|/)vendor/ ]] || [[ "$REL" =~ \.d\.ts$ ]]; then
  deny "node_modules, vendor and .d.ts files are not writable (got: $FILE_PATH)"
fi

# 4. Allowlist.
if [[ "$REL" =~ ^client/src/.+\.test\.tsx?$ ]] \
  || [[ "$REL" =~ ^client/src/test/.+\.tsx?$ ]] \
  || [[ "$REL" =~ ^server/test/.+\.ts$ ]] \
  || [[ "$REL" =~ ^server/src/.+\.test\.ts$ ]] \
  || [[ "$REL" =~ ^reviewer-core/test/.+\.ts$ ]] \
  || [[ "$REL" =~ ^reviewer-core/src/.+\.test\.ts$ ]]; then
  exit 0
fi

# 5. Everything else.
deny "test-writer may only write test files and test helpers (got: $FILE_PATH)"
