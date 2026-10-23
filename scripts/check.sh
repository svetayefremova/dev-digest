#!/usr/bin/env bash
#
# Token-lean package checks for humans and agents (implementer, test-writer, plan-verifier).
# Prints one summary line per check; on failure, only the first failing lines — never full logs.
#
#   scripts/check.sh <client|server|reviewer-core|mcp> [mode] [--no-typecheck] [--related <file>...]
#
# Modes (default: --unit):
#   --unit   all unit tests (server: excludes *.it.test.ts)
#   --it     server integration tests (*.it.test.ts); skipped with a reason when `docker info` fails
#   --all    --unit, then --it (server only; same as --unit elsewhere)
#   --related <file>...  only the tests vitest maps to these source/test files (paths relative to
#            the repo root or to the package); integration tests are never included
#   --no-typecheck       skip `tsc --noEmit` (e.g. a second run after a test-only fix)
#
# Exit code: 0 when every check that ran passed (a skipped --it counts as passed and says so), 1 otherwise.
# Read-only apart from build/test caches: no installs, no snapshot updates, no db:*.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAX_LINES=30

usage() { sed -n '3,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2; }

PKG="${1:-}"
case "$PKG" in
  client|server|reviewer-core|mcp) shift ;;
  -h|--help|"") usage ;;
  *) echo "check: unknown package '$PKG' (client|server|reviewer-core|mcp)" >&2; exit 2 ;;
esac

MODE="unit"; TYPECHECK=1; RELATED=()
while [ $# -gt 0 ]; do
  case "$1" in
    --unit) MODE="unit" ;;
    --it) MODE="it" ;;
    --all) MODE="all" ;;
    --no-typecheck) TYPECHECK=0 ;;
    --related)
      MODE="related"; shift
      while [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; do
        RELATED+=("${1#"$PKG"/}"); shift
      done
      continue ;;
    *) echo "check: unknown argument '$1'" >&2; usage ;;
  esac
  shift
done

if [ "$MODE" = "it" ] || [ "$MODE" = "all" ]; then
  [ "$PKG" = "server" ] || { [ "$MODE" = "it" ] && { echo "check: --it is server-only" >&2; exit 2; }; MODE="unit"; }
fi
if [ "$MODE" = "related" ] && [ ${#RELATED[@]} -eq 0 ]; then
  echo "check: --related needs at least one file" >&2; exit 2
fi

cd "$ROOT/$PKG" || exit 2
[ -d node_modules ] || { echo "$PKG: node_modules missing — run npm install in $PKG/ first"; exit 1; }

TMP="$(mktemp -t devdigest-check.XXXXXX)"
trap 'rm -f "$TMP"' EXIT
STATUS=0

run_typecheck() {
  if npx tsc --noEmit -p tsconfig.json --pretty false >"$TMP" 2>&1; then
    echo "$PKG typecheck: ok"
  else
    STATUS=1
    echo "$PKG typecheck: FAIL — $(grep -c 'error TS' "$TMP") error(s)"
    grep 'error TS' "$TMP" | head -n "$MAX_LINES"
  fi
}

# $1 = label, rest = vitest args
run_vitest() {
  local label="$1"; shift
  npx vitest "$@" --reporter=dot --silent >"$TMP" 2>&1
  local code=$?
  # Vitest summary lines look like: " Test Files  8 passed (8)" / "      Tests  2 failed | 14 passed (16)".
  local files tests
  files="$(grep -E '^ *Test Files ' "$TMP" | tail -n 1 | sed -E 's/^ *Test Files +//')"
  tests="$(grep -E '^ *Tests ' "$TMP" | tail -n 1 | sed -E 's/^ *Tests +//')"
  if [ $code -eq 0 ]; then
    echo "$PKG $label: ok — tests ${tests:-none found} · files ${files:-0}"
  else
    STATUS=1
    echo "$PKG $label: FAIL (exit $code) — tests ${tests:-?} · files ${files:-?}"
    grep -E 'FAIL|×|✗|AssertionError|Error:|expected|Received|❯ .*:[0-9]+' "$TMP" \
      | grep -v '^ *$' | awk '!seen[$0]++' | head -n "$MAX_LINES"
  fi
}

run_it() {
  if ! docker info >/dev/null 2>&1; then
    echo "$PKG integration: skipped — docker info failed (Docker not running)"
    return
  fi
  run_vitest "integration" run .it.test
}

[ $TYPECHECK -eq 1 ] && run_typecheck

UNIT_EXCLUDE=()
[ "$PKG" = "server" ] && UNIT_EXCLUDE=(--exclude '**/*.it.test.ts')

case "$MODE" in
  unit)    run_vitest "unit" run ${UNIT_EXCLUDE[@]+"${UNIT_EXCLUDE[@]}"} --passWithNoTests ;;
  it)      run_it ;;
  all)     run_vitest "unit" run "${UNIT_EXCLUDE[@]}"; run_it ;;
  related) run_vitest "related" related --run --passWithNoTests --exclude '**/*.it.test.ts' "${RELATED[@]}" ;;
esac

exit $STATUS
