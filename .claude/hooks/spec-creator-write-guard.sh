#!/usr/bin/env bash
# PreToolUse(Write) guard for the `spec-creator` subagent
# (wired in .claude/agents/spec-creator.md frontmatter).
#
# The spec-creator may only write feature specifications:
#   - specs/<module>/SPEC-NN-<slug>.md
#     <module>: lowercase kebab-case, exactly one level below specs/ (a new module folder is allowed)
#     never specs/README.md or any README.md (human-maintained)
#   - the content must declare the same `Spec ID: SPEC-NN` as the file name and `Status: draft`
#   - Spec IDs are global: no other specs/*/SPEC-NN-*.md may carry the same number
#   - an existing file may be overwritten only while it is still `Status: draft`
#     (approved/implemented specs are frozen — plans and code are built on them)
#
# Fails CLOSED: anything that can't be positively verified is denied (exit 2).
# Symlinks are not resolved (same limitation as implementation-planner-write-guard.sh).

set -uo pipefail

deny() {
  echo "spec-creator-write-guard: $1" >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || deny "jq not found; cannot verify the target path"

INPUT_JSON="$(cat)"
FILE_PATH="$(printf '%s' "$INPUT_JSON" | jq -r '.tool_input.file_path // ""' 2>/dev/null)"
[ -n "$FILE_PATH" ] || deny "no file_path in tool input"
CONTENT="$(printf '%s' "$INPUT_JSON" | jq -r '.tool_input.content // ""' 2>/dev/null)"
[ -n "$CONTENT" ] || deny "no content in tool input"

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(printf '%s' "$INPUT_JSON" | jq -r '.cwd // ""')}"
[ -n "$PROJECT_DIR" ] || deny "cannot resolve project dir"
SPECS_DIR="$PROJECT_DIR/specs"

# Normalise a relative path against the project dir; reject any `..` segment outright.
case "$FILE_PATH" in
  /*) ABS="$FILE_PATH" ;;
  *)  ABS="$PROJECT_DIR/$FILE_PATH" ;;
esac
case "$ABS" in
  *"/../"*|*"/.."|*"/./"*) deny "path traversal is not allowed: $FILE_PATH" ;;
esac

DIR="$(dirname "$ABS")"
BASE="$(basename "$ABS")"
MODULE_DIR="$(dirname "$DIR")"
MODULE="$(basename "$DIR")"

[ "$MODULE_DIR" = "$SPECS_DIR" ] \
  || deny "spec-creator may only write to specs/<module>/ (got: $FILE_PATH)"
[[ "$MODULE" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] \
  || deny "module folder must be lowercase kebab-case (got: $MODULE)"
[ "$BASE" = "README.md" ] && deny "README.md files are maintained by humans"
[[ "$BASE" =~ ^SPEC-([0-9]{2,})-[a-z0-9]+(-[a-z0-9]+)*\.md$ ]] \
  || deny "spec file must be named SPEC-NN-<kebab-slug>.md (got: $BASE)"
FILE_ID="SPEC-${BASH_REMATCH[1]}"
FILE_NUM=$((10#${BASH_REMATCH[1]}))

# Content must match the file name and stay a draft.
printf '%s\n' "$CONTENT" | grep -qE "^Spec ID:[[:space:]]*${FILE_ID}[[:space:]]*$" \
  || deny "content must contain 'Spec ID: $FILE_ID' matching the file name"
printf '%s\n' "$CONTENT" | grep -qE '^Status:[[:space:]]*draft[[:space:]]*$' \
  || deny "spec-creator may only write 'Status: draft' specs; humans promote them"

# Spec IDs are global across all modules.
shopt -s nullglob
for other in "$SPECS_DIR"/*/SPEC-*.md; do
  [ "$other" = "$ABS" ] && continue
  other_base="$(basename "$other")"
  [[ "$other_base" =~ ^SPEC-([0-9]+)- ]] || continue
  [ $((10#${BASH_REMATCH[1]})) -eq "$FILE_NUM" ] \
    && deny "$FILE_ID is already used by ${other#"$PROJECT_DIR"/}; take the next free ID"
done

if [ -e "$ABS" ]; then
  grep -qE '^Status:[[:space:]]*draft' "$ABS" \
    || deny "$BASE exists and is no longer 'Status: draft' — write a new spec with 'Supersedes:' instead"
fi

exit 0
