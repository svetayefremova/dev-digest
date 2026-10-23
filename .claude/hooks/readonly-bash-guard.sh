#!/usr/bin/env bash
# PreToolUse(Bash) guard for the read-only subagents.
# Wired in the frontmatter of:
#   - architecture-reviewer.md, researcher.md, spec-creator.md  → --profile readonly
#   - plan-verifier.md, test-writer.md         → --profile verifier
#
# Allowlist, fails CLOSED (exit 2). The command is scanned quote-aware and split into segments on
# `&&`, `||`, `;`, `|` and newlines; every segment must pass.
#
# Shell-level denials (outside single quotes): `$(…)`, backticks, `<(…)`, `>(…)`, `$'…'`, heredoc /
# here-string `<<`, background `&`, leading `VAR=value`, and every output redirect except
# `2>&1`, `>&2`, `1>&2`, `>/dev/null`, `1>/dev/null`, `2>/dev/null`, `&>/dev/null`.
#
# profile readonly:
#   git {diff,log,show,grep,blame,merge-base,status,rev-parse,ls-files,cat-file} (no -c, --output, grep -O)
#   ls wc head tail cat pwd basename dirname realpath file stat cut tr nl diff echo printf test [ true jq cd
#   sort (no -o), uniq (no positional args), grep, rg (no --pre), find (no -delete/-exec*/-ok*/-fprint*/-fls)
# profile verifier = readonly plus:
#   npm test … | npm run test … | npm run typecheck … | npm run build …
#   npx vitest run …        (never -u / --update / --outputFile / --watch / -w)
#   docker info             (no args)
#   scripts/check.sh …      (./scripts/check.sh too; never -u / --update / --outputFile / --watch / -w)
# Everything else is denied by omission (rm, mv, cp, tee, sed, awk, node, curl, gh, installs, db:* …).
#
# Regression checks — run after any allowlist change, piped JSON per case:
#   printf '{"tool_input":{"command":"<cmd>"}}' | .claude/hooks/readonly-bash-guard.sh --profile <p>; echo $?
# Both profiles, denied (exit 2):
#   echo x > /tmp/x · rm -f README.md · git checkout -b x · git diff --output=/tmp/d
#   git -c core.pager=sh log · find . -name x -delete · cat a 2>/dev/null >b · ls $(echo .) · cat <<EOF · ""
# Both profiles, allowed (exit 0):
#   git diff --stat · ls · git status 2>&1 · ls >/dev/null · git log --oneline -5 | head -3
#   git grep -n "a\|b" -- .claude/agents | wc -l
# readonly: npm test → denied ("not allowed in profile readonly")
# verifier: cd reviewer-core && npm test · cd server && npx vitest run --exclude '**/*.it.test.ts' · docker info → allowed
#   scripts/check.sh server --unit · ./scripts/check.sh mcp --related mcp/src/x.ts → allowed
#   npm install · npm run db:migrate · npx vitest run -u · npm test -- --outputFile=x.json · npx drizzle-kit generate → denied
# No --profile / --profile foo → every command denied (fail closed).

# No `set -u`: macOS bash 3.2 treats "${empty_array[@]}" as unbound, which would abort with exit 1
# (a non-blocking hook error, i.e. fail OPEN). Every exit path below is explicit.
set -o pipefail

PROFILE=""
if [ "${1:-}" = "--profile" ]; then PROFILE="${2:-}"; fi

deny() {
  echo "readonly-bash-guard[${PROFILE:-none}]: $1" >&2
  exit 2
}

case "$PROFILE" in
  readonly|verifier) ;;
  *) deny "unknown profile '${PROFILE}'; every command is denied" ;;
esac

command -v jq >/dev/null 2>&1 || deny "jq not found; cannot verify the command"

CMD="$(jq -r '.tool_input.command // ""' 2>/dev/null)" || deny "cannot parse tool input"
[ -n "${CMD//[[:space:]]/}" ] || deny "empty command"

# ---------------------------------------------------------------------------
# 1. Quote-aware scan: split into segments, filter shell constructs and redirects.
# ---------------------------------------------------------------------------
SEGMENTS=()
seg=""
state="none" # none | single | double
len=${#CMD}
i=0

push_segment() {
  SEGMENTS+=("$seg")
  seg=""
}

# Reads a redirect starting at index $i (the `>`), with $1 = prefix already in the segment ("", "1", "2", "&").
# Sets REDIR (normalised form) and advances i past it.
read_redirect() {
  local prefix="$1" op=">" j=$((i + 1)) target=""
  local c="${CMD:j:1}"
  if [ "$c" = ">" ] || [ "$c" = "|" ]; then op=">$c"; j=$((j + 1)); fi
  if [ "${CMD:j:1}" = "&" ]; then op="$op&"; j=$((j + 1)); fi
  while [ "${CMD:j:1}" = " " ]; do j=$((j + 1)); done
  while [ $j -lt $len ]; do
    c="${CMD:j:1}"
    case "$c" in
      " "|";"|"|"|"&"|$'\n'|"<"|">") break ;;
      *) target="$target$c"; j=$((j + 1)) ;;
    esac
  done
  REDIR="$prefix$op$target"
  i=$j
}

while [ $i -lt $len ]; do
  c="${CMD:i:1}"
  n="${CMD:i+1:1}"
  case "$state" in
    single)
      seg="$seg$c"
      [ "$c" = "'" ] && state="none"
      i=$((i + 1)); continue ;;
    double)
      case "$c" in
        '\') seg="$seg$c$n"; i=$((i + 2)); continue ;;
        '"') state="none" ;;
        '`') deny "backtick command substitution is not allowed (segment: $seg$c)" ;;
        '$') [ "$n" = "(" ] && deny "command substitution \$(…) is not allowed; run the inner command separately" ;;
      esac
      seg="$seg$c"; i=$((i + 1)); continue ;;
  esac

  # state == none
  case "$c" in
    '\') seg="$seg$c$n"; i=$((i + 2)); continue ;;
    "'") state="single"; seg="$seg$c" ;;
    '"') state="double"; seg="$seg$c" ;;
    '`') deny "backtick command substitution is not allowed" ;;
    '$')
      [ "$n" = "(" ] && deny "command substitution \$(…) is not allowed; run the inner command separately"
      [ "$n" = "'" ] && deny "ANSI-C quoting \$'…' is not allowed"
      seg="$seg$c" ;;
    ';'|$'\n') push_segment ;;
    '|')
      [ "$n" = "&" ] && deny "'|&' is not allowed"
      [ "$n" = "|" ] && i=$((i + 1))
      push_segment ;;
    '&')
      if [ "$n" = "&" ]; then i=$((i + 1)); push_segment
      elif [ "$n" = ">" ]; then
        i=$((i + 1)); read_redirect "&"
        case "$REDIR" in "&>/dev/null") ;; *) deny "output redirection to a file is not allowed ($REDIR)" ;; esac
        continue
      else deny "background '&' is not allowed"
      fi ;;
    '<')
      [ "$n" = "<" ] && deny "heredoc / here-string '<<' is not allowed"
      [ "$n" = "(" ] && deny "process substitution <(…) is not allowed"
      seg="$seg$c" ;;
    '>')
      [ "$n" = "(" ] && deny "process substitution >(…) is not allowed"
      prefix=""
      last="${seg: -1}"
      before="${seg: -2:1}"
      if { [ "$last" = "1" ] || [ "$last" = "2" ]; } && { [ -z "$before" ] || [ "$before" = " " ]; }; then
        prefix="$last"; seg="${seg%?}"
      fi
      read_redirect "$prefix"
      case "$REDIR" in
        "2>&1"|">&2"|"1>&2"|">/dev/null"|"1>/dev/null"|"2>/dev/null") ;;
        *) deny "output redirection to a file is not allowed ($REDIR)" ;;
      esac
      continue ;;
    *) seg="$seg$c" ;;
  esac
  i=$((i + 1))
done
[ "$state" = "none" ] || deny "unbalanced quote"
push_segment

# ---------------------------------------------------------------------------
# 2. Per segment: split into words (quotes stripped) and check the allowlist.
# ---------------------------------------------------------------------------
split_words() {
  WORDS=()
  local s="$1" w="" st="none" k=0 ch have=0
  while [ $k -lt ${#s} ]; do
    ch="${s:k:1}"
    case "$st" in
      single) if [ "$ch" = "'" ]; then st="none"; else w="$w$ch"; fi ;;
      double)
        if [ "$ch" = '"' ]; then st="none"
        elif [ "$ch" = '\' ]; then k=$((k + 1)); w="$w${s:k:1}"
        else w="$w$ch"; fi ;;
      none)
        case "$ch" in
          " "|$'\t') if [ $have -eq 1 ]; then WORDS+=("$w"); w=""; have=0; fi ;;
          "'") st="single"; have=1 ;;
          '"') st="double"; have=1 ;;
          '\') k=$((k + 1)); w="$w${s:k:1}"; have=1 ;;
          *) w="$w$ch"; have=1 ;;
        esac ;;
    esac
    k=$((k + 1))
  done
  [ $have -eq 1 ] && WORDS+=("$w")
  return 0
}

STATE_MSG="writes files / changes state"

check_test_flags() { # $@ = args; deny snapshot updates, output files and watch mode
  local a
  for a in "$@"; do
    case "$a" in
      -u|--update|--update=*|--outputFile|--outputFile=*|--outputFile.*|--watch|--watch=*|-w)
        deny "'$a' is not allowed (writes snapshots/files or never exits)" ;;
    esac
  done
}

check_segment() {
  split_words "$1"
  [ ${#WORDS[@]} -eq 0 ] && return 0
  local cmd="${WORDS[0]}" a
  case "$cmd" in
    *=*) deny "leading variable assignment '$cmd' is not allowed" ;;
  esac
  local args=("${WORDS[@]:1}")

  case "$cmd" in
    git)
      local k=0 sub=""
      while [ $k -lt ${#args[@]} ]; do
        a="${args[$k]}"
        case "$a" in
          --no-pager) k=$((k + 1)) ;;
          -C) k=$((k + 2)) ;;
          -c|-c*|--config-env*|--exec-path*|--git-dir*|--work-tree*) deny "git global option '$a' is not allowed" ;;
          -*) deny "git global option '$a' is not allowed" ;;
          *) sub="$a"; break ;;
        esac
      done
      case "$sub" in
        diff|log|show|grep|blame|merge-base|status|rev-parse|ls-files|cat-file) ;;
        "") deny "bare 'git' is not allowed" ;;
        commit|checkout|switch|reset|stash|push|rebase|merge|restore|clean|add|apply|cherry-pick|tag|branch|worktree|fetch|pull|rm|mv|config|init|clone|gc|notes|update-ref)
          deny "git $sub changes git state" ;;
        *) deny "git $sub is not allowlisted" ;;
      esac
      for a in "${args[@]}"; do
        case "$a" in
          --output|--output=*) deny "git --output writes a file" ;;
          -O|-O*|--open-files-in-pager*) [ "$sub" = "grep" ] && deny "git grep $a runs a pager command" ;;
          --ext-diff|--textconv) deny "git $a can run external commands" ;;
        esac
      done ;;
    ls|wc|head|tail|cat|pwd|basename|dirname|realpath|file|stat|cut|tr|nl|diff|echo|printf|test|"["|true|jq|cd) ;;
    sort)
      for a in "${args[@]}"; do
        case "$a" in -o|-o*|--output|--output=*) deny "sort $a writes a file" ;; esac
      done ;;
    uniq)
      for a in "${args[@]}"; do
        case "$a" in -*) ;; *) deny "uniq with a positional argument may write a file" ;; esac
      done ;;
    grep) ;;
    rg)
      for a in "${args[@]}"; do
        case "$a" in --pre|--pre=*) deny "rg --pre runs a command" ;; esac
      done ;;
    find)
      for a in "${args[@]}"; do
        case "$a" in
          -delete|-exec|-execdir|-ok|-okdir|-fprint|-fprint0|-fprintf|-fls) deny "find $a writes or executes" ;;
        esac
      done ;;
    npm)
      [ "$PROFILE" = "verifier" ] || deny "npm is not allowed in profile $PROFILE"
      local s1="${args[0]:-}" s2="${args[1]:-}"
      case "$s1" in
        test|t) check_test_flags "${args[@]:1}" ;;
        run|run-script)
          case "$s2" in
            test|typecheck|build) check_test_flags "${args[@]:2}" ;;
            db:migrate|db:generate|db:seed) deny "npm run $s2 is never allowed (server/INSIGHTS.md)" ;;
            *) deny "npm run $s2 is not allowlisted" ;;
          esac ;;
        install|i|ci|add|uninstall|update|exec|publish|link) deny "npm $s1 is a package install / $STATE_MSG" ;;
        *) deny "npm $s1 is not allowlisted" ;;
      esac ;;
    npx)
      [ "$PROFILE" = "verifier" ] || deny "npx is not allowed in profile $PROFILE"
      [ "${args[0]:-}" = "vitest" ] && [ "${args[1]:-}" = "run" ] || deny "only 'npx vitest run …' is allowed"
      check_test_flags "${args[@]:2}" ;;
    scripts/check.sh|./scripts/check.sh)
      [ "$PROFILE" = "verifier" ] || deny "scripts/check.sh is not allowed in profile $PROFILE"
      check_test_flags "${args[@]}" ;;
    docker)
      [ "$PROFILE" = "verifier" ] || deny "docker is not allowed in profile $PROFILE"
      [ "${#args[@]}" -eq 1 ] && [ "${args[0]}" = "info" ] || deny "only 'docker info' is allowed" ;;
    tee|sed|perl|rm|mv|cp|mkdir|touch|chmod|chown|ln|truncate|dd|curl|wget|gh|brew|pip|pip3|pnpm|yarn)
      deny "$cmd $STATE_MSG" ;;
    *) deny "'$cmd' is not allowlisted" ;;
  esac
}

for s in "${SEGMENTS[@]}"; do
  check_segment "$s"
done

exit 0
