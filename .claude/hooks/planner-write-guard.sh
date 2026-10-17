#!/usr/bin/env bash
# PreToolUse(Write) guard for the `planner` subagent (wired in .claude/agents/planner.md frontmatter).
#
# The planner may only write its own files:
#   - Development Plans:    docs/plans/<verb-phrase>.md
#   - Agent specifications: docs/agent-specs/<agent-name>.md
#   Directly in those folders, never their README.md (human-maintained).
#   - an existing file may be overwritten only while it is still `Status: draft`
#     (approved/done plans and specs are frozen — someone is executing them)
#
# Fails CLOSED: anything that can't be positively verified is denied (exit 2).

set -uo pipefail

deny() {
  echo "planner-write-guard: $1" >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || deny "jq not found; cannot verify the target path"

INPUT_JSON="$(cat)"
FILE_PATH="$(printf '%s' "$INPUT_JSON" | jq -r '.tool_input.file_path // ""' 2>/dev/null)"
[ -n "$FILE_PATH" ] || deny "no file_path in tool input"

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(printf '%s' "$INPUT_JSON" | jq -r '.cwd // ""')}"
[ -n "$PROJECT_DIR" ] || deny "cannot resolve project dir"
PLANS_DIR="$PROJECT_DIR/docs/plans"
SPECS_DIR="$PROJECT_DIR/docs/agent-specs"

# Normalise a relative path against the project dir; reject any `..` segment outright.
case "$FILE_PATH" in
  /*) ABS="$FILE_PATH" ;;
  *)  ABS="$PROJECT_DIR/$FILE_PATH" ;;
esac
case "$ABS" in
  *"/../"*|*"/..") deny "path traversal is not allowed: $FILE_PATH" ;;
esac

DIR="$(dirname "$ABS")"
BASE="$(basename "$ABS")"
[ "$DIR" = "$PLANS_DIR" ] || [ "$DIR" = "$SPECS_DIR" ] \
  || deny "planner may only write to docs/plans/ or docs/agent-specs/ (got: $FILE_PATH)"
case "$BASE" in
  README.md) deny "${DIR#"$PROJECT_DIR"/}/README.md is maintained by humans" ;;
  *.md) ;;
  *) deny "plan and spec files must be .md (got: $BASE)" ;;
esac

if [ -e "$ABS" ]; then
  grep -qE '^Status:[[:space:]]*draft' "$ABS" \
    || deny "$BASE exists and is no longer 'Status: draft' — create a new file instead"
fi

exit 0
