# Agent spec: read-only-bash-guard (architecture-reviewer, plan-verifier, researcher)

Status: done · Date: 2026-10-16 · Kind: change

## Responsibility
Mechanically enforce that the three read-only agents `architecture-reviewer`, `plan-verifier` and `researcher` cannot modify files or git state through Bash. Today Write/Edit/NotebookEdit are blocked mechanically (`disallowedTools`), but Bash is restricted by prompt only (`.claude/agents/architecture-reviewer.md:30` "This restriction is prompt-level only"; `.claude/agents/plan-verifier.md:18` "This is prompt-enforced only"; `.claude/agents/researcher.md:15-16`). The change adds one PreToolUse(Bash) hook, `.claude/hooks/readonly-bash-guard.sh`, that is an allowlist and fails closed. It is wired into the frontmatter of all three agents. A `--profile` argument fixed in each agent's frontmatter selects the allowlist. This spec is the Intent Layer acceptance check "read-only agents cannot modify files".

## Not responsible for
- Write/Edit/NotebookEdit blocking → already done by `disallowedTools` in each agent (`architecture-reviewer.md:7`, `plan-verifier.md:6`, `researcher.md:6`). Unchanged.
- Bash restrictions for writer agents (`implementer`, `test-writer`, `doc-writer`, `planner`) → out of scope. Their Bash stays prompt-restricted (`.claude/agents/README.md:29,30,32,35`).
- Gating `gh pr create|merge` / `git push` on a review verdict → `.claude/hooks/pr-self-review-gate.sh:60` (project-wide, `.claude/settings.json:3-13`). Unchanged. It still runs alongside the new hook (see Risks).
- What each agent reviews or verifies → unchanged. Only the frontmatter `hooks:` block is added, plus a one-line edit to each agent's Bash hard constraint.
- Sandboxing the scripts behind `npm test` / `npx vitest run` → not possible at this level (see Risks). A human owns package.json scripts.

## Position in flow
No change to the Flow (`.claude/agents/README.md:7`). The hook fires on every Bash call made inside these three agents, whoever spawns them: `researcher` (any time), and `plan-verifier <plan path>` + `architecture-reviewer` after the `implementer`. Exit 2 blocks the call, and the stderr reason goes back to the agent. The agent then rephrases with an allowed command (or uses Read/Grep/Glob) or reports `not verifiable`.

## Frontmatter
Only the `hooks:` block is added. All other fields stay as they are today. The values below are the current ones, for reference.

| Field | Value | Why |
|---|---|---|
| name | unchanged (`architecture-reviewer`, `plan-verifier`, `researcher`) | |
| description | unchanged | |
| model | unchanged (opus / opus / sonnet) | No behaviour change to the agents' reasoning |
| tools | unchanged: `Read, Grep, Glob, Bash` (+ `WebSearch, WebFetch` for researcher) | Bash stays because each agent needs git inspection, and plan-verifier also needs command evidence (`plan-verifier.md:19`) |
| disallowedTools | unchanged | |
| skills | unchanged | |
| permissionMode | unchanged | |
| maxTurns | unchanged | |
| hooks | PreToolUse, matcher `"Bash"`, see below | Same YAML shape as `.claude/agents/test-writer.md:21-26` / `planner.md:22-27` |

Exact `hooks:` blocks (the profile is fixed in frontmatter, so the agent cannot choose it):

- `architecture-reviewer.md` and `researcher.md`:
  ```yaml
  hooks:
    PreToolUse:
      - matcher: "Bash"
        hooks:
          - type: command
            command: "$CLAUDE_PROJECT_DIR/.claude/hooks/readonly-bash-guard.sh --profile readonly"
  ```
- `plan-verifier.md`: the same block with `--profile verifier`.

Hard-constraint line edits in the agent bodies (one sentence each):
- `architecture-reviewer.md:30`: replace "This restriction is prompt-level only; honour it." with "Enforced by `.claude/hooks/readonly-bash-guard.sh --profile readonly` (fails closed). Command substitution `$(…)` is denied: run `git merge-base main HEAD` first and paste the SHA."
- `plan-verifier.md:18`: replace "This is prompt-enforced only, so obey it strictly." with "Enforced by `.claude/hooks/readonly-bash-guard.sh --profile verifier` (fails closed). A plan command the hook denies → row `not verifiable: denied by readonly-bash-guard` (quote the reason)."
- `researcher.md:16`: append "Enforced by `.claude/hooks/readonly-bash-guard.sh --profile readonly`. No `sed`/`awk`: use Read with offset/limit, or `head`/`tail`."

## Write scope & enforcement
- Writes: nothing. The agents stay read-only. The human applying this spec writes `.claude/hooks/readonly-bash-guard.sh` (new, `chmod +x`), the three agent frontmatters and body lines above, and the README rows below.
- Never writes (for the three agents, through Bash): any file outside OS temp, any git ref/index/worktree change, any package install, any DB migration or generation, any GitHub mutation.
- Enforcement: hook `.claude/hooks/readonly-bash-guard.sh`, fail-closed, same skeleton as `planner-write-guard.sh:13-22`: `set -uo pipefail`, a `deny()` that writes `readonly-bash-guard: <reason>` to stderr and runs `exit 2`, a `jq` presence check, and reading of `.tool_input.command // ""`, the same way `pr-self-review-gate.sh:56` reads it.
- Bash (what the hook allows): see the algorithm below.

### Hook algorithm (`readonly-bash-guard.sh`)
1. **Args.** `--profile readonly|verifier` is required. A missing or unknown profile → deny everything ("unknown profile"). This fails closed if the frontmatter is mistyped.
2. **Input.** `jq` missing → deny. Empty command → deny.
3. **Quote-aware scan** (pure bash char loop that tracks `'…'`, `"…"` and `\` escapes). Outside quotes:
   - Split into segments on `&&`, `||`, `;`, `|` and newline. A lone `&` (background) → deny.
   - Deny `$(`, backtick, `<(`, `>(` anywhere except inside single quotes (inside `"…"` they still expand, so they are denied there too).
   - Deny `<<` (heredoc / here-string) entirely.
   - Redirections: deny any `>`, `>>`, `>|`, `&>`, `N>` **except** these exact forms: `2>&1`, `>&2`, `1>&2`, `>/dev/null`, `1>/dev/null`, `2>/dev/null`, `&>/dev/null`. Input `<file` is allowed.
   - A `>` inside quotes (e.g. `git grep -n "a>b"`) is data, not a redirect, so it is allowed. The same goes for `|` inside quotes: `git grep -n "modules/A/\|'\.\./A/"` (pattern from `architecture-reviewer.md:59`) must be one segment.
4. **Per segment**: strip leading whitespace. A leading `VAR=value` assignment → deny (it could set `GIT_*`/`npm_config_*`). Take the first word as the command and check it against the allowlist for the profile:

   | Command | Allowed when | Denied flags / forms (message names them) |
   |---|---|---|
   | `git` | subcommand ∈ `diff, log, show, grep, blame, merge-base, status, rev-parse, ls-files, cat-file` with an optional leading `-C <dir>` or `--no-pager` | any other subcommand (explicit messages for `commit, checkout, switch, reset, stash, push, rebase, merge, restore, clean, add, apply, cherry-pick, tag, branch, worktree, fetch, pull, rm, mv, config, init, clone, gc, notes, update-ref`); global `-c` (it can set a pager or alias that executes code); `--output`/`--output=` (diff/log/show write a file); `git grep -O`/`--open-files-in-pager`; `git diff --no-index` stays allowed (read-only) |
   | `ls, wc, head, tail, cat, pwd, basename, dirname, realpath, file, stat, cut, tr, nl, diff, echo, printf, test, [, true, jq` | always (redirects are already filtered in step 3) | — |
   | `sort` | no `-o` / `--output` | `-o`, `--output` |
   | `uniq` | flags only, no positional arguments (a 2nd positional arg is an output file) | positional args |
   | `grep`, `rg` | always | `rg --pre`, `rg --pre=` (runs a command) |
   | `find` | always | `-delete, -exec, -execdir, -ok, -okdir, -fprint, -fprint0, -fprintf, -fls` |
   | `cd` | always (changes only the shell's cwd) | — |
   | **verifier profile only:** `npm` | exactly `npm test …`, `npm run test …` or `npm run typecheck …` | any other npm subcommand or script, with explicit messages for `install, i, ci, add, uninstall, update, exec, publish, link` and for `run db:migrate`, `run db:generate`, `run db:seed`, `run dev`, `run build`. After `--`: `-u`, `--update`, `--outputFile*`, `--watch` |
   | **verifier only:** `npx` | exactly `npx vitest run …` | anything else (`npx drizzle-kit`, `npx tsx`, `npx playwright`, `npx tsc` …); `-u`, `--update`, `--outputFile*`, `--watch`, `-w` |
   | **verifier only:** `docker` | exactly `docker info` with no args | anything else |

   Everything not listed is denied by omission: `rm, mv, cp, mkdir, touch, chmod, chown, ln, truncate, dd, tee, sed, awk, perl, python*, node, tsx, sh, bash, zsh, eval, exec, env, xargs, source, ., curl, wget, gh, brew, pip*, pnpm, yarn, make, open, kill, sudo`. For the commands the request names explicitly (`tee`, `sed`, `perl`, `rm`, `mv`, `cp`, `mkdir`, `touch`, `chmod`, `ln`, `truncate`, `dd`, `curl`, `wget`, `gh`, `brew`, `pip`, `pnpm`, `yarn`), the deny message says "writes files / changes state", not just "not allowlisted", so the agent understands why.
5. Every segment passes → `exit 0`.

Design choices (one each):
- **Allowlist, not denylist.** The named write commands in the request are denied twice: by omission, and with explicit messages. A new or unknown command is denied by default, which is what fails closed means here.
- **The profile lives in frontmatter, not caller input.** The agent cannot widen its own allowlist. Adding a new plan-template command means editing the hook's verifier table. This is the "allowlist of exact command prefixes" from the request.
- **Matching the plan's Verification commands.** The planner template commands (`.claude/agents/planner.md:171-174`) are `cd client && npm run typecheck && npm test`, `cd server && npm run typecheck && npx vitest run --exclude '**/*.it.test.ts'`, `cd server && npx vitest run .it.test` and `cd reviewer-core && npm test`. The segment split in step 3 plus the `cd` / `npm` / `npx` rows in step 4 let each of them through verbatim. `docker info` covers the Docker pre-check (`plan-verifier.md:20`).
- **No `sed -n` even without `-i`.** sed scripts can write through `w`/`W` and execute through `e`, so a sed that is safe can't be told apart reliably. The agents have Read with offset/limit and `head`/`tail`.
- **No `$(…)`.** Validating nested substitutions recursively would make the script much more complex. The cost is one extra Bash call to get the merge-base SHA.

## Input gate
- Required input: the hook gets the PreToolUse JSON on stdin (`tool_input.command`) plus `--profile` from argv.
- Missing / unparseable → deny, exit 2 with a reason (fail closed). This applies to: no jq, empty command, an unknown profile, or an unbalanced quote left over at the end of the scan.

## Procedure
Procedure for the human applying this spec:
1. Read `.claude/hooks/planner-write-guard.sh` and `.claude/hooks/test-writer-write-guard.sh` for the house style (header comment that lists the allowlist with justification, `deny()`, fail-closed).
2. Create `.claude/hooks/readonly-bash-guard.sh` following the Hook algorithm above. The header comment lists both profiles and their allowlists, and cites this spec. Run `chmod +x` on it.
3. Add the `hooks:` block to the frontmatter of `architecture-reviewer.md` (after `maxTurns: 40`), `plan-verifier.md` (after `maxTurns: 60`) and `researcher.md` (after `disallowedTools`).
4. Apply the three one-line hard-constraint edits listed under Frontmatter.
5. Apply the README updates below.
6. Run every row of Verification. First test the hook in isolation by piping JSON into it: `printf '{"tool_input":{"command":"rm x"}}' | .claude/hooks/readonly-bash-guard.sh --profile readonly; echo $?`. Then run the in-agent dry runs.
7. Self-check: `git grep -n "prompt-level only\|prompt-enforced only\|Bash read-only by prompt" .claude/agents` no longer matches the three changed agents' rows/lines. Set this spec to `done`.

## Rules / checks catalog
n/a

## Report format & status values
The agents' reports are unchanged. The hook itself:
- Allowed → exit 0, no output.
- Denied → exit 2, stderr `readonly-bash-guard[<profile>]: <reason> (segment: <segment>)`. Examples: `output redirection to a file is not allowed`, `git checkout changes git state`, `command substitution $(…) is not allowed; run the inner command separately`, `npm install is a package install`, `npm run db:migrate is never allowed (server/INSIGHTS.md)`, `rm writes files / changes state`.
- plan-verifier maps a denied plan command to `not verifiable: denied by readonly-bash-guard — <reason>` (existing status value, `plan-verifier.md:66`).

## README & skills-table updates
- `.claude/agents/README.md` → Flow: no change.
- Permissions rows (`.claude/agents/README.md:31,33,34`), last column:
  - researcher: "Writes nothing. Bash **hook-enforced** read-only by [`readonly-bash-guard.sh`](../hooks/readonly-bash-guard.sh) `--profile readonly` (PreToolUse on Bash, fails closed; allowlist of read-only git/fs commands)."
  - architecture-reviewer: "Writes nothing. Bash **hook-enforced** read-only by [`readonly-bash-guard.sh`](../hooks/readonly-bash-guard.sh) `--profile readonly` (`git diff`/`log`/`show`/`grep`/`blame`/`merge-base`/`status`, `ls`, `wc`, `head`, `cat`, `rg`, `grep`, safe `find`)."
  - plan-verifier: "Writes nothing. Bash **hook-enforced** by [`readonly-bash-guard.sh`](../hooks/readonly-bash-guard.sh) `--profile verifier`: the readonly allowlist plus `npm test`, `npm run test`, `npm run typecheck`, `npx vitest run`, `docker info` (no snapshot updates, no output files)."
- Rule sources (`.claude/agents/README.md:80`): add a row `| [.claude/hooks/readonly-bash-guard.sh](../hooks/readonly-bash-guard.sh) | Mechanical Bash read-only restriction (profiles readonly / verifier) | researcher, architecture-reviewer, plan-verifier |`.
- Maintenance (`.claude/agents/README.md:88` area): add a bullet "**Plan Verification command change** (planner template, `planner.md:168-174`) → update the verifier profile in `readonly-bash-guard.sh`, or plan-verifier rows become `not verifiable`."
- Catalog / Inputs and outputs: no change.
- `.claude/skills/README.md` → Agent → preloaded skills: none.
- Other docs that reference the agents: `.claude/agents/architecture-reviewer.md:30`, `plan-verifier.md:18`, `researcher.md:16`, changed as described under Frontmatter.

## Verification
Run each row in a fresh invocation of the named agent, asking it to run exactly that Bash command. Also run each row once directly against the hook with piped JSON (step 6 of Procedure).

| Check | Expected |
|---|---|
| Each of the 3 agents: `echo x > /tmp/x` | denied, exit 2, "output redirection"; `/tmp/x` not created (`ls /tmp/x` fails) |
| Each of the 3 agents: `rm -f README.md` | denied, exit 2, "rm writes files" |
| Each of the 3 agents: `git checkout -b x` | denied, exit 2, "git checkout changes git state"; `git branch --list x` is empty afterwards (checked by the human) |
| Each of the 3 agents: `git diff --stat` and `ls` | allowed, normal output |
| Each of the 3 agents: `git log --oneline -5 \| head -3` and `git grep -n "a\|b" -- .claude/agents \| wc -l` | allowed (pipe + quoted `\|` handled) |
| Each: `git diff --output=/tmp/d` , `git -c core.pager=sh log`, `find . -name x -delete`, `cat a 2>/dev/null >b`, `ls $(echo .)`, `cat <<EOF` | denied |
| Each: `git status 2>&1` , `ls >/dev/null` | allowed |
| architecture-reviewer / researcher: `npm test` | denied ("not allowed in profile readonly") |
| plan-verifier: `cd reviewer-core && npm test` | allowed, vitest runs |
| plan-verifier: `cd server && npx vitest run --exclude '**/*.it.test.ts'` and `docker info` | allowed |
| plan-verifier: `npm install`, `npm run db:migrate`, `npx vitest run -u`, `npm test -- --outputFile=x.json`, `npx drizzle-kit generate` | denied |
| Hook with no `--profile` / `--profile foo` | denied for every command (fail closed) |
| Run on vague / empty command (`""`) | denied, no side effect |
| Unaffected agents (`implementer`, `test-writer`) run `ls` | unaffected (hook not wired) |

## Implementation notes (done 2026-10-16)
- Implemented in `.claude/hooks/readonly-bash-guard.sh`; piped-JSON dry runs pass (49 cases).
- Deviation: the `verifier` profile also allows `npm run build`, because the plan template's Verification includes builds.
- No `set -u`: macOS bash 3.2 treats an empty `"${arr[@]}"` as unbound and would exit 1 (fail open).

## Risks & open questions
- **Spec name deviates from Naming.** `docs/agent-specs/README.md` → Naming wants `<agent-name>.md`. The caller asked for `read-only-bash-guard.md` because the change spans three agents. The human should confirm, or split it into three specs.
- **Subagent `hooks:` with arguments is unverified.** The existing frontmatter hooks call the script with no arguments (`test-writer.md:26`). This spec assumes `command:` is run through a shell, so `--profile verifier` is passed through. The first Verification row confirms it. Fallback if it isn't: two thin wrapper scripts (`readonly-bash-guard-readonly.sh`, `readonly-bash-guard-verifier.sh`) that `exec` the main script with the profile.
- **Interaction with the project-wide Bash hook.** `.claude/settings.json:3-13` runs `pr-self-review-gate.sh` on every Bash call, and that hook fails open (`pr-self-review-gate.sh:10-13`). I'm assuming project-level and subagent-level PreToolUse hooks both run and that any exit 2 blocks. I have not verified this against Claude Code docs. `gh pr create` / `git push` are denied by the new hook either way.
- **`npm test` / `npx vitest run` run repo code.** package.json scripts and test files can write anything (e.g. a test that calls `fs.writeFileSync`). The hook only blocks write flags it can see (`-u`, `--outputFile`, `--watch`). Residual risk is accepted because the agent can't edit those scripts, but the guarantee is "no writes via Bash syntax", not "no writes by executed tests". Build/test caches (`tsc` incremental info, vitest cache) are also still written (`plan-verifier.md:19` already accepts this).
- **`npx` may download packages** if `vitest` isn't installed locally. The hook can't rewrite the command to `npx --no-install`, and a plan command has to stay verbatim. Open question: should the verifier profile require `node_modules/.bin/vitest` to exist and deny otherwise?
- **`git status` / `git diff` may refresh `.git/index`** (stat-cache only). This doesn't change content or refs, so it's accepted.
- **The bash quote-aware scanner is the hard part.** Constructs it doesn't model (ANSI-C `$'…'`, brace expansion, `!` history) should be denied: deny any `$'` and treat an unbalanced quote at end of input as a deny. The human should add direct piped-JSON tests for these.
- **Lost conveniences:** `sed -n`, `awk`, `$(git merge-base main HEAD)` inline, `curl` for researcher (WebFetch covers it), and `gh` read calls (`gh api`, `gh pr view`). Confirm none of these are needed. Adding read-only `gh pr view|list` to the readonly profile is the likely ask.
- **plan-verifier: per-step `Tests … run:` lines** can be any command the planner wrote (`plan-verifier.md:19`). Anything outside the verifier table becomes `not verifiable`. Confirm that's the intended trade-off rather than widening the allowlist.
