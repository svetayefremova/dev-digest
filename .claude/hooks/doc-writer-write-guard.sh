#!/usr/bin/env bash
# PreToolUse(Write|Edit) guard for the `doc-writer` subagent (wired in .claude/agents/doc-writer.md frontmatter).
#
# The doc-writer may only write documentation markdown in these places:
#   - docs/features/<name>.md          (feature docs; NOT docs/features/README.md = human-maintained index)
#   - README.md                        (root; prompt rule: only when architecture changes)
#   - <client|server|reviewer-core|e2e>/README.md
#   - <client|server|reviewer-core|e2e>/docs/**/*.md
#   - server/src/modules/<module>/README.md   (exactly one level deep)
#
# Deliberately NOT allowed (denied by omission):
#   - docs/agent-prompts/, docs/skills/   originals of reviewer prompts / review skills (product content)
#   - docs/plans/                         planner-owned
#   - .claude/**                          agent / skill / hook config
#   - reviewer-core/specs/                pre-implementation specs
#   - TESTING.md                          human-owned cross-package testing policy
#   - every CLAUDE.md / INSIGHTS.md       human / engineering-insights owned
#   - client/src/vendor/ui/README.md      vendored
#   - server/src/prompts/*.md             LLM prompt templates (= code)
#   - e2e/specs/                          JSON flow fixtures
#   - all non-.md files
#
# Fails CLOSED: anything that can't be positively verified is denied (exit 2).
# Symlinks are not resolved (same limitation as planner-write-guard.sh).

set -uo pipefail

deny() {
  echo "doc-writer-write-guard: $1" >&2
  exit 2
}

ALLOWED="docs/features/<name>.md, README.md, <client|server|reviewer-core|e2e>/README.md, <client|server|reviewer-core|e2e>/docs/**/*.md, server/src/modules/<module>/README.md"

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

# 2. Must be inside the project dir.
case "$ABS" in
  "$PROJECT_DIR"/*) ;;
  *) deny "path is outside the project: $FILE_PATH" ;;
esac
REL="${ABS#"$PROJECT_DIR"/}"

# 3. The index is human-maintained.
[ "$REL" = "docs/features/README.md" ] && deny "docs/features/README.md is the human-maintained index"

# 4. Allowlist.
if [[ "$REL" =~ ^docs/features/.+\.md$ ]] \
  || [[ "$REL" =~ ^README\.md$ ]] \
  || [[ "$REL" =~ ^(client|server|reviewer-core|e2e)/README\.md$ ]] \
  || [[ "$REL" =~ ^(client|server|reviewer-core|e2e)/docs/.+\.md$ ]] \
  || [[ "$REL" =~ ^server/src/modules/[^/]+/README\.md$ ]]; then
  # Never touch dependencies or vendored code even if a pattern matched.
  if [[ "$REL" =~ (^|/)(node_modules|vendor)/ ]]; then
    deny "node_modules/vendor paths are not allowed (got: $FILE_PATH)"
  fi
  case "$REL" in
    */CLAUDE.md|*/INSIGHTS.md) deny "CLAUDE.md / INSIGHTS.md are not doc-writer's to edit (got: $FILE_PATH)" ;;
  esac
  exit 0
fi

# 5. Everything else.
deny "doc-writer may only write: $ALLOWED (got: $FILE_PATH)"
