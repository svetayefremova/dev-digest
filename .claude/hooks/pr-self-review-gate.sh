#!/usr/bin/env bash
# PreToolUse gate for the pr-self-review skill.
#
# KNOWN RISK: the headless invocation of `claude -p "/pr-self-review"` below and the
# exact shape of its final text output are NOT verified against documented Claude Code
# behavior (headless slash-command invocation is undocumented). Before relying on this
# gate, run it manually once against a branch with a deliberate CRITICAL violation and
# confirm the json-verdict fence is actually present in $RAW_OUTPUT — adjust the
# extraction below if the real output shape differs.
#
# Fails open (allows the command) on any ambiguity: can't find jq, can't resolve a
# base branch, can't parse a verdict, or the review times out. The only thing that
# denies the command is a positively-parsed BLOCKED verdict without an override.

set -uo pipefail

# Portable bounded-run helper: stock macOS has no `timeout` (GNU coreutils only;
# `brew install coreutils` would give `gtimeout`). Prefer a real timeout binary if
# present, otherwise fall back to a background-process + watcher-kill implementation.
TIMEOUT_BIN=""
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_BIN="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_BIN="gtimeout"
fi

# Runs "$@" with stdout+stderr redirected to $outfile, bounded to $secs seconds.
# Echoes the exit status to stdout (the caller captures it via $(...)).
run_bounded() {
  local secs="$1" outfile="$2"
  shift 2
  if [ -n "$TIMEOUT_BIN" ]; then
    "$TIMEOUT_BIN" "$secs" "$@" > "$outfile" 2>/dev/null
    echo $?
    return
  fi
  "$@" > "$outfile" 2>/dev/null &
  local pid=$!
  # stdout/stderr MUST be /dev/null here, not inherited: if left inherited, killing
  # this subshell still leaves its forked `sleep` child orphaned holding the parent's
  # stdout pipe open, so a caller doing status=$(run_bounded ...) hangs until that
  # orphaned sleep naturally finishes — even though the real job already finished.
  ( sleep "$secs" && kill -TERM "$pid" ) >/dev/null 2>&1 &
  local watcher=$!
  wait "$pid" 2>/dev/null
  local status=$?
  kill "$watcher" 2>/dev/null
  wait "$watcher" 2>/dev/null
  echo "$status"
}

INPUT_JSON="$(cat)"

command -v jq >/dev/null 2>&1 || exit 0

COMMAND="$(printf '%s' "$INPUT_JSON" | jq -r '.tool_input.command // ""' 2>/dev/null)"
CWD="$(printf '%s' "$INPUT_JSON" | jq -r '.cwd // "."' 2>/dev/null)"

# Only gate PR-opening / merge / push commands; everything else is allowed silently.
if ! printf '%s' "$COMMAND" | grep -Eq '^[[:space:]]*(gh[[:space:]]+pr[[:space:]]+create|gh[[:space:]]+pr[[:space:]]+merge|git[[:space:]]+push)\b'; then
  exit 0
fi

cd "$CWD" 2>/dev/null || exit 0

git rev-parse --verify main >/dev/null 2>&1 || exit 0
BASE="$(git merge-base main HEAD 2>/dev/null)" || exit 0
[ -n "$BASE" ] || exit 0

DIFF_CONTENT="$(git diff "$BASE" 2>/dev/null)"
if [ -z "$DIFF_CONTENT" ]; then
  exit 0
fi
DIFF_HASH="$(printf '%s' "$DIFF_CONTENT" | shasum -a 256 | cut -d' ' -f1)"

CACHE_DIR=".claude/pr-review-history"
CACHE_FILE="$CACHE_DIR/${DIFF_HASH}.json"
mkdir -p "$CACHE_DIR" 2>/dev/null || exit 0

if [ ! -s "$CACHE_FILE" ]; then
  # Cache miss: run the skill headlessly, bounded well under the hook's own timeout
  # so this script controls the fail-open path instead of Claude Code silently
  # discarding an in-flight run.
  # Narrow allowlist, not --permission-mode bypassPermissions: this headless run is
  # read-only review (diff inspection + sub-skill invocation), never edits anything,
  # so it gets exactly the tools it needs and nothing more.
  RAW_OUTPUT_FILE="$(mktemp)"
  RUN_STATUS="$(run_bounded 170 "$RAW_OUTPUT_FILE" claude -p "/pr-self-review" \
    --allowedTools "Bash(git *) Bash(gh *) Read Grep Glob Skill Agent")"
  VERDICT_JSON="$(sed -n '/```json-verdict/,/```/p' "$RAW_OUTPUT_FILE" | sed '1d;$d')"
  rm -f "$RAW_OUTPUT_FILE"

  if [ "$RUN_STATUS" -ne 0 ] || [ -z "$VERDICT_JSON" ] || ! printf '%s' "$VERDICT_JSON" | jq -e . >/dev/null 2>&1; then
    # Timed out, crashed, or produced no parseable verdict — fail open, record incomplete.
    jq -n --arg hash "$DIFF_HASH" --arg now "$(date -u +%FT%TZ)" \
      '{diffHash: $hash, verdict: "OK", incomplete: true, overridden: false, findings: [], checkedAt: $now}' \
      > "$CACHE_FILE" 2>/dev/null
    exit 0
  fi

  printf '%s' "$VERDICT_JSON" | jq --arg hash "$DIFF_HASH" --arg now "$(date -u +%FT%TZ)" \
    '. + {diffHash: $hash, checkedAt: $now}' > "$CACHE_FILE" 2>/dev/null || exit 0
fi

VERDICT="$(jq -r '.verdict // "OK"' "$CACHE_FILE" 2>/dev/null)"
OVERRIDDEN="$(jq -r '.overridden // false' "$CACHE_FILE" 2>/dev/null)"

if [ "$VERDICT" = "BLOCKED" ] && [ "$OVERRIDDEN" != "true" ]; then
  REASON_LINES="$(jq -r '
    (.findings // []) | map(select(.severity == "CRITICAL")) |
    if length > 0 then map("- " + (.file // "?") + ": " + (.summary // "critical finding")) | join("\n")
    else "pr-self-review verdict is BLOCKED (see .claude/pr-review-history/'"$DIFF_HASH"'.json for details)."
    end
  ' "$CACHE_FILE" 2>/dev/null)"

  jq -n --arg reason "pr-self-review BLOCKED this change:
$REASON_LINES

Fix the critical findings, then retry. If this is a deliberate, audited exception, run:
/pr-self-review --override \"<reason>\"
and retry this command." \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  exit 0
fi

exit 0
