# Spec: Onboarding Tour

Spec ID: SPEC-02
Status: approved
Module: onboarding
Date: 2026-10-22
Supersedes: —

## Problem & user
A developer who joins a team (or a reviewer who opens an unfamiliar repo) has a repo connected to DevDigest but no guided way to learn it. The product already indexes the repo (symbols, import graph, PageRank file rank, repo map) but shows none of that to a newcomer.

Current state:
- The sidebar label "Onboarding Tour" exists (`client/messages/en/shell.json:19`) but no tour page exists. `client/src/app/repos/[repoId]` has `context`, `conventions` and `pulls` routes only.
- `client/src/app/onboarding/page.tsx` is the **add-repository** flow (`AddRepoView`). It is a different feature and must not be confused with the tour. `activeKeyFor` maps any path containing `/onboarding` to the `onboarding-tour` sidebar key (`client/src/components/app-shell/helpers.ts:29`), so the add-repo page lights up the tour tab.
- Unused groundwork: an `onboarding` table (repoId PK + json + generatedAt, `server/src/db/schema/context.ts:120`), the `Onboarding` contract with sections `{kind, title, body, diagram, links}` (`server/src/vendor/shared/contracts/knowledge.ts:28-47`), a prompt (`server/src/prompts/onboarding.system.md`) and the `onboarding` feature-model id (`server/src/vendor/shared/contracts/platform.ts:45`). The existing prompt's section set is driven by a `{{sections}}` placeholder, so the five sections of this spec are not fixed by it.
- `repoIntel` offers `getIndexState`, `getRepoMap`, `getTopFilesByRank` and `getCriticalPaths` ("onboarding reading-path", dependency chains from top-ranked files, `server/src/modules/repo-intel/service.ts:659-702`). `getIndexState` returns `status: degraded` / `reason: no_data` when nothing is indexed (`service.ts:189-205`). Degraded reasons are `flag_off | index_failed | index_partial | repo_too_large | no_data` (`server/src/modules/repo-intel/types.ts:27-32`).
- The index parses only `.ts .tsx .js .jsx .mjs .cjs` and stops at `MAX_INDEXED_FILES = 5000` (`server/src/modules/repo-intel/constants.ts:14,42`). Clones are shallow, so `hotness` is always 0 and rank equals PageRank (`server/src/modules/repo-intel/pipeline/rank.ts:5`, `full.ts:227`).

Designs: `specs/onboarding/designs/onboarding-tour.png` (the full tour) and `specs/onboarding/designs/onboarding-tour-empty.png` (the empty state for a repo with no tour). Both files are committed on disk and are the design source for this spec.

## Goals / Non-goals
- Goals:
  - Add an "Onboarding Tour" tab in the sidebar Workspace group, between "Pull Requests" and "Project Context", that opens a per-repo tour page.
  - Show five sections: architecture overview, critical paths, how to run locally, guided reading path, first tasks.
  - Build facts deterministically from the repo index and checkout; make one structured LLM call to write the sections.
  - When the index is degraded or the LLM call fails, show a deterministic skeleton with an honest status; never hide the failure or invent content.
  - Be explicit about partial coverage (repos above the 5,000-file cap, shallow clone, unsupported languages).
- Non-goals:
  - Changing the add-repository flow at `/onboarding` (only its wrongly lit sidebar tab is fixed).
  - Raising `MAX_INDEXED_FILES`, deepening the clone or computing git hotness.
  - Editing the generated tour by hand; per-user progress tracking.
  - A public (unauthenticated) share page or exporting to PDF/Markdown.
  - An in-app code viewer for "Open".
  - Using Project Context documents (SPEC-01) as tour input (Q4 → resolved: no).
  - A "Share link" button or any shareable/public link. The design shows one; it is intentionally dropped (Q2 → resolved: removed). In-app section anchors and deep links stay (AC-9, AC-48).
  - Cancelling a running generation (UX proposal 2 rejected).
  - Being a file browser: the tour is not a file browser, and "Show all" never lists more than 25 entries (AC-13, AC-53, AC-58).
  - Automatic regeneration on every index refresh (the tour only shows a stale notice).
  - Indexing non-JS/TS languages. Such repos get a reduced tour (AC-31).

## User stories
- US-1 — As a newcomer to a repo, I want a single page that explains its architecture, critical files, how to run it, what to read first and where to start, so that I become productive faster.
- US-2 — As a newcomer, I want every file and command shown to be real, so that I can trust the page.
- US-3 — As a user of a large or poorly indexed repo, I want the page to say honestly what it covers and why something is missing, so that I am not misled.
- US-4 — As a team member, I want to regenerate the tour and share a link to it, so that a colleague can see the same page.
- US-5 — As a security-conscious user, I want repo content to be treated as data and model output as text, so that a malicious README cannot hijack the page or the model.
- US-6 — As a workspace owner, I want paid generation to be explicit and bounded, so that cost stays predictable.

## Acceptance criteria (EARS)

### Navigation and page frame
- AC-1 — The sidebar Workspace group shall list "Onboarding Tour" after "Pull Requests" and before "Project Context". — covers: US-1 — priority: must — verify: unit
- AC-2 — WHEN the user selects "Onboarding Tour", the app shall open the tour page of the currently selected repo and mark the tab active. — covers: US-1 — priority: must — verify: unit
- AC-3 — WHILE the user is on the add-repository page, the sidebar shall not mark "Onboarding Tour" active. — covers: US-1 — priority: must — verify: unit
- AC-4 — IF no repo is selected, THEN the tour page shall show a "Select a repository" prompt instead of the tour. — covers: US-1 — priority: should — verify: unit
- AC-5 — The tour page shall show the heading "Onboarding for {repoName}" with the repo name in the mono/accent style. — covers: US-1 — priority: must — verify: unit
- AC-6 — The tour page shall show the subline "Generated from index of {n} files · last refreshed {relative time}", where {n} is the number of files the index actually holds and the time is the tour's generation time, with the absolute time on hover. — covers: US-1, US-3 — priority: must — verify: unit
- AC-7 — WHILE the index status is `partial` or files were skipped, the subline shall read "Generated from index of {n} of {m} files" with a "Partial index" notice stating that sections cover indexed files only, where {m} is indexed plus skipped files from the index state. — covers: US-3 — priority: must — verify: unit
- AC-8 — The tour page shall present exactly five sections in this order: Architecture overview, Critical paths, How to run locally, Guided reading path, First tasks, in both the generated and the skeleton view. — covers: US-1 — priority: must — verify: unit
- AC-9 — WHILE the tour is displayed, the "ON THIS PAGE" list shall highlight the section currently in view. — covers: US-1 — priority: should — verify: unit
- AC-10 — Each section card shall be collapsible with a chevron button that exposes its expanded state to assistive technology; all sections shall be expanded on first load. — covers: US-1 — priority: should — verify: unit

### Deterministic facts and grounding
- AC-11 — The tour API shall derive stack, directory structure, routes/endpoints, package scripts and file ranking from the repo index and checkout without calling the model. — covers: US-1, US-2 — priority: must — verify: integration
- AC-12 — The tour API shall order the reading path and critical-path candidates by file rank, defined as PageRank × (1 + hotness), and WHILE hotness is unavailable it shall order by PageRank alone. — covers: US-1, US-3 — priority: must — verify: unit
- AC-13 — The tour shall contain at most 25 critical paths, at most 25 reading-path entries and at most 3 first tasks, each list ranked and grounded (AC-12, AC-14), with fewer only when the index holds fewer qualifying files or grounding drops entries (AC-14, AC-51). — covers: US-1 — priority: should — verify: unit
- AC-14 — The tour API shall drop every file path in a response (including model-supplied ones) that is not present in the index of the indexed commit. — covers: US-2 — priority: must — verify: integration
- AC-15 — The "How to run locally" section shall contain only commands derived from detected files (package scripts, `.env.example`, compose file); the tour API shall drop any model-supplied command not derivable from them. — covers: US-2 — priority: must — verify: unit
- AC-16 — Every number shown in a "why" line (for example "used by 14 routes") shall come from index facts, not from model text. — covers: US-2 — priority: must — verify: unit
- AC-17 — The tour API shall derive each first-task complexity badge (Low, Medium, High) from the number of files importing the task's file: up to 3 is Low, 4 to 10 Medium, above 10 High, and for a task whose path is a directory the badge shall always be Low. — covers: US-1 — priority: should — verify: unit — assumed default — confirm
- AC-18 — IF no run facts are found in the repo, THEN the "How to run locally" section shall show "No run instructions found in this repo" and no commands. — covers: US-2 — priority: must — verify: unit

### LLM generation
- AC-19 — WHEN a generation runs, the tour API shall make exactly one structured model call for the five sections. — covers: US-6 — priority: must — verify: integration
- AC-20 — The tour API shall pass README, comment and file excerpts to the model as delimited untrusted data, so that instructions inside them do not change the task or the output shape. — covers: US-5 — priority: must — verify: unit
- AC-21 — The tour API shall limit the model input to at most 4,000 characters per excerpt and shall include `.env.example` variable names without their values. — covers: US-5, US-6 — priority: must — verify: unit — assumed default — confirm
- AC-22 — IF the model output does not match the tour contract, THEN the tour API shall discard it, record the failure and serve the deterministic skeleton with the reason "AI output invalid". — covers: US-2, US-3 — priority: must — verify: integration
- AC-23 — IF the model call fails or exceeds 60 seconds, THEN the tour API shall serve the deterministic skeleton with the reason "AI summary unavailable" and the page shall show a Retry action. — covers: US-3 — priority: must — verify: integration — assumed default — confirm
- AC-24 — The tour page shall render model text as Markdown without executing raw HTML, scripts or `javascript:` links. — covers: US-5 — priority: must — verify: unit
- AC-25 — IF a model diagram is not valid, THEN the tour page shall omit the diagram and still show the section text. — covers: US-5 — priority: should — verify: unit

### Degraded and special states
- AC-26 — WHILE the tour is a deterministic skeleton, the page shall show a status banner naming the reason and shall fill each section only from index facts: architecture lists stack and top-level directories without a diagram, critical paths and reading path list ranked files without model reasons, how-to-run lists detected commands, and first tasks shows "Available once the AI summary is generated". — covers: US-3 — priority: must — verify: unit
- AC-27 — IF the repo has no local checkout, THEN the page shall show "Repository not cloned yet" and no Regenerate action. — covers: US-3 — priority: must — verify: integration
- AC-28 — WHILE the index is being built, the page shall show an "Indexing in progress" state, poll the index state every 5 seconds, and start or enable generation only after it finishes. — covers: US-3 — priority: must — verify: unit — assumed default — confirm
- AC-29 — WHERE repo intelligence is disabled, the page shall show the skeleton with the reason "Repository index is turned off" and the tour API shall make no model call. — covers: US-3, US-6 — priority: must — verify: integration
- AC-30 — IF the index status is `failed`, THEN the page shall show the skeleton with the failure reason and a "Re-analyze" action that requests a re-index. — covers: US-3 — priority: must — verify: unit
- AC-31 — IF the index holds no supported source files, THEN the page shall show "No supported source files indexed (.ts, .tsx, .js, .jsx, .mjs, .cjs)" in place of the ranked sections and shall still show detected run commands. — covers: US-3 — priority: must — verify: integration
- AC-32 — WHILE a first generation is in progress (no persisted tour exists), the page shall show the deterministic skeleton as placeholder content, disable Regenerate and show elapsed time, with the placeholders replaced by the generated sections when the generation succeeds. — covers: US-4 — priority: should — verify: unit

### Regenerate, persistence and access
- AC-33 — WHEN the user clicks Regenerate, the page shall start one new generation from the current index and keep showing the previous tour, with Regenerate disabled and elapsed time shown, until the new one succeeds. — covers: US-4 — priority: must — verify: integration
- AC-34 — WHILE a generation for a repo is running, the tour API shall not start a second one from another request or tab and shall return the running generation instead. — covers: US-4, US-6 — priority: must — verify: integration
- AC-35 — IF a regeneration fails, THEN the page shall keep the previous successful tour and show the failure reason in a banner. — covers: US-3, US-4 — priority: must — verify: integration
- AC-36 — The tour API shall return the persisted tour of a repo only to members of the repo's workspace and shall respond 404 for a repo id of another workspace. — covers: US-5 — priority: must — verify: integration
- AC-37 — WHEN the repository's indexed commit differs from the commit the tour was generated from, the page shall show "The index changed since this tour was generated" with a Regenerate action. — covers: US-3 — priority: should — verify: unit
- AC-38 — WHEN a user reopens the page for a repo with a persisted tour, the page shall show it without making a model call. — covers: US-6 — priority: must — verify: integration
- AC-39 — WHEN the user opens the page for a repo with no persisted tour, the page shall show an empty state with an icon tile, the title "Generate onboarding tour", the body "DevDigest indexes the repo and writes a guided tour: architecture, critical paths, how to run, a reading order, and first tasks. Takes 30–60s and ~5,000 tokens." and one button labelled "Generate onboarding tour" with a plus icon, with no model call started until the user clicks it. — covers: US-6 — priority: must — verify: unit
- AC-40 — The tour API shall reject a new generation for a repo within 60 seconds of the previous one starting. — covers: US-6 — priority: should — verify: integration — assumed default — confirm

### Actions on content
- AC-41 (removed) — Share link dropped from scope in round 2 (Q2); see Non-goals.
- AC-42 — WHEN the user clicks "Open" on a path, the page shall open the file at the indexed commit on GitHub in a new tab with no opener access. — covers: US-1 — priority: should — verify: unit — assumed default — confirm
- AC-43 — WHEN the user clicks the copy button of a command, the page shall copy the command text without its trailing `# comment` and announce "Copied" to assistive technology. — covers: US-1 — priority: should — verify: unit — assumed default — confirm
- AC-44 — The tour API shall record for every generation its status, failure reason, duration, model token usage and run id, and shall not log excerpt or model text. — covers: US-6 — priority: should — verify: integration
- AC-45 — WHEN generation finishes or fails, the page shall announce the new state to assistive technology and keep focus on the Regenerate button. — covers: US-4 — priority: should — verify: unit

### Added in round 2
- AC-46 — WHEN the user clicks Generate and the repo has a local checkout but no index, the tour API shall request an index build and start the model call only after the index finishes, and the page shall show "Indexing in progress" meanwhile. — covers: US-3, US-6 — priority: must — verify: integration
- AC-47 — WHEN the user clicks Generate or Regenerate and an index exists, the tour API shall generate from the current index without re-indexing, and the page shall offer "Re-analyze" when the index is stale. — covers: US-3 — priority: should — verify: integration
- AC-48 — WHEN the page is opened with a section anchor in its URL (the anchor is the section key, for example `#critical_paths`), the page shall scroll to that section and expand it. — covers: US-1 — priority: should — verify: unit
- AC-49 — The tour page shall show the breadcrumb "Workspace > Onboarding Tour" in the top bar, the same pattern as the other Workspace pages, with no "Share link" control. — covers: US-1 — priority: should — verify: unit
- AC-50 — WHEN the user activates an item in the "ON THIS PAGE" list by click or keyboard, the page shall scroll that section into view and, IF the section is collapsed, expand it. — covers: US-1 — priority: must — verify: unit
- AC-51 — WHEN a generation runs, the tour API shall take the first tasks from the same single model call as the other sections, as up to 3 newcomer-sized tasks each with a short title and one target path that is a file or a directory, and shall drop every task whose path is not an indexed file or does not contain at least one indexed file. — covers: US-1, US-2 — priority: must — verify: integration
- AC-52 — The "First tasks" cards shall be informational only, with no Open button and no click action. — covers: US-1 — priority: should — verify: unit
- AC-53 — WHILE the Critical paths or the Guided reading path section holds more than 8 entries, the section shall show its first 8 entries and a "Show all ({N})" control, and WHEN the user activates the control, the section shall expand the remaining entries in place and relabel the control "Show less". — covers: US-1 — priority: must — verify: unit
- AC-54 — WHEN the user activates "Show less" on an expanded list, the section shall collapse back to its first 8 entries and relabel the control "Show all ({N})". — covers: US-1 — priority: must — verify: unit
- AC-55 — WHILE the Critical paths or the Guided reading path section holds 8 or fewer entries, the section shall show no "Show all" or "Show less" control. — covers: US-1 — priority: should — verify: unit
- AC-56 — WHEN a generation runs, the tour API shall request model-written reasons only for the first 8 entries of each of the Critical paths and Guided reading path lists, and entries 9 to 25 shall show a deterministic index fact (for example "imported by 14 files") with no model text. — covers: US-1, US-2, US-6 — priority: must — verify: integration
- AC-57 — WHILE the tour is a deterministic skeleton, the Critical paths and Guided reading path sections shall apply the same 8-entry display and Show all / Show less rule as AC-53 to AC-55, with every entry showing index facts only. — covers: US-1, US-3 — priority: should — verify: unit
- AC-58 — WHILE the Critical paths or Guided reading path list is expanded and holds exactly 25 entries because the 25-entry cap cut it off (more qualifying files existed), the section (in the generated and the skeleton view) shall end the list with a muted note "Top 25 of {M} indexed files by import rank", where {M} is the number of files the index holds, the same count as {n} in the AC-6 header. — covers: US-1, US-3 — priority: should — verify: unit

## Edge cases
- Repo above the 5,000-file cap (design shows 12,450) → AC-6, AC-7
- Shallow clone, hotness always 0 → AC-12
- No clone yet → AC-27
- Index in progress → AC-28
- Generate clicked on an unindexed or stale index → AC-46, AC-47
- repo-intel flag off → AC-29
- Index failed / degraded / no_data → AC-26, AC-30
- Non-JS/TS repo or zero indexed files → AC-31
- No scripts, README or compose file → AC-18
- Model returns invalid JSON or invented paths/commands → AC-14, AC-15, AC-22
- Model provider down or slow → AC-23, AC-35
- Double click / two tabs / two users regenerating → AC-32, AC-34, AC-40
- Index refreshed while tour is old → AC-37
- Narrow viewport, long paths and dark mode → covered by the Accessibility NFR (no dedicated AC; paths truncate with the full path available on hover — assumed default)
- Add-repo page lighting up the tab → AC-3
- Tour page for a repo of another workspace (IDOR) → AC-36

## Non-functional requirements
- Performance: WHEN a persisted tour exists, the page shall render its first section within 1 s of the API response; skeleton build for a 5,000-file index returns within 2 s → not testable → success signal (first-content time in browser metrics); AC-38 covers no-LLM reopen.
- Accessibility: collapsible sections and TOC are keyboard operable, state changes are announced, copy feedback is announced, contrast holds in light and dark mode → AC-10, AC-43, AC-45, AC-48.
- Security & privacy: workspace isolation → AC-36; untrusted repo text → AC-20, AC-21; rendering → AC-24, AC-25; no content in logs → AC-44; opener safety → AC-42.
- i18n: all new copy lives in `client/messages/en/`; relative times use the user's locale and show the absolute time on hover; long paths wrap or truncate with a hover title → AC-6 (relative time); the rest not testable → success signal (no hardcoded copy found in review).
- Observability: → AC-44.
- LLM cost & limits: one model call per generation, explicit trigger, one running generation per repo, 60 s cooldown, bounded input, model reasons for at most 8 entries per list → AC-19, AC-21, AC-34, AC-39, AC-40, AC-56.

## Success signals
- Share of repos with a persisted tour that were generated by explicit user action, from the generation records → AC-44.
- Rate of skeleton-only results by reason (invalid output, provider failure, flag off, failed index) → AC-44.

## Assumptions & dependencies
- Repo index and `GET /repos/:id/index-state` exist (`server/src/modules/repo-intel/routes.ts`); `POST /repos/:id/resync` exists for re-analyze.
- A configured LLM provider for the `onboarding` feature model.
- Repos are on GitHub (for the "Open" link). Non-GitHub repos are out of scope.
- The existing `Onboarding` contract and `onboarding` persistence are reused or extended by the plan; the contract exists twice (`server/src/vendor/shared` and `client/src/vendor/shared`).
- SPEC-01 (Project Context) is a sibling and is not a dependency.

## Inputs and provenance
| Input | Source | Trust | Notes |
|---|---|---|---|
| Index facts (ranks, edges, endpoints, symbols) | Postgres via `repoIntel` | trusted (derived from untrusted code) | `server/src/modules/repo-intel/types.ts` |
| Index state/status | Postgres via `getIndexState` | trusted | `types.ts:25-45` |
| Package scripts, README, `.env.example`, compose file | repo checkout | untrusted | excerpts bounded by AC-21 |
| Code comments and file excerpts | repo checkout | untrusted | prompt injection risk |
| Model output | LLM provider | untrusted | contract `knowledge.ts:44-47` |
| Repo/workspace ids in URL | user | untrusted | IDOR, AC-36 |

Spec sources: request (Onboarding Tour tab, five sections, deterministic facts + one LLM call + honest skeleton), designs: `specs/onboarding/designs/onboarding-tour.png` and `specs/onboarding/designs/onboarding-tour-empty.png`, code anchors: `client/src/components/app-shell/helpers.ts:29`, `client/messages/en/shell.json:19`, `server/src/modules/repo-intel/constants.ts:42`, `server/src/modules/repo-intel/service.ts:189,659`, `server/src/modules/repo-intel/types.ts:25-32`, `server/src/modules/repo-intel/pipeline/rank.ts:5`, `server/src/db/schema/context.ts:120`, `server/src/vendor/shared/contracts/knowledge.ts:28-47`, `server/src/prompts/onboarding.system.md`, research: none, mcp: none (devdigest MCP not needed; feature does not read review data)
INSIGHTS applied: client/INSIGHTS.md — client must use `import type` only from `@devdigest/shared` (value imports break the Next bundler), constrains the plan, not behaviour; server/INSIGHTS.md — contracts are duplicated in client and server and drift silently (new contract fields must land in both) → noted in Assumptions; `container.git.readFile` can fail for a checkout that is not this machine's clone → clone-missing behaviour AC-27 (read: client/INSIGHTS.md, server/INSIGHTS.md)

## Untrusted inputs
- README, comments, file excerpts sent to the model — risk: prompt injection — required handling → AC-20, AC-21
- Model output (body text, diagram, links, commands) — risk: XSS, invented paths/commands — required handling → AC-14, AC-15, AC-24, AC-25
- Repo id in the tour URL — risk: another workspace's data — required handling → AC-36
- Repeated Regenerate requests — risk: duplicate paid runs — required handling → AC-34, AC-40
- Huge READMEs and repos — risk: oversized model input — required handling → AC-21, AC-13

## Module interactions
| From → To | Contract / endpoint | Direction | Failure behaviour (user-visible) |
|---|---|---|---|
| client → server | new tour read / generate endpoints — to be designed by the plan | request/response | → AC-23, AC-35 |
| client → server | `GET /repos/:id/index-state` (`server/src/modules/repo-intel/routes.ts`) | poll | → AC-28, AC-30 |
| client → server | `POST /repos/:id/resync` | request | → AC-30, AC-46 |
| server → repo-intel facade | `repoIntel.getIndexState/getTopFilesByRank/getCriticalPaths` | read | → AC-26, AC-29, AC-31 |
| server → LLM provider | injected `LLMProvider`, `onboarding` feature model | request | → AC-22, AC-23 |
| server → Postgres | persisted tour per repo | read/write | → AC-38 |
| client → GitHub | "Open" link at indexed commit | navigation | → AC-42 |

## Traceability
| AC | Covers | Source | Verify | Verification hint |
|---|---|---|---|---|
| AC-1 | US-1 | request "under Pull Requests and above Project Context" | unit | Render sidebar → order is Pull Requests, Onboarding Tour, Project Context |
| AC-2 | US-1 | request; design sidebar | unit | Click tab with repo selected → tour route for that repo, tab active |
| AC-3 | US-1 | `helpers.ts:29` | unit | `activeKeyFor("/onboarding")` does not return the tour key |
| AC-4 | US-1 | design gap | unit | No repo selected → "Select a repository" prompt |
| AC-5 | US-1 | design header | unit | Repo `payments-api` → heading "Onboarding for payments-api", name in mono |
| AC-6 | US-1, US-3 | design subline | unit | Tour with 4,800 indexed files → "Generated from index of 4,800 files · last refreshed …"; hover shows absolute time |
| AC-7 | US-3 | Q3 → resolved; `constants.ts:42` | unit | Index partial, 5,000 indexed + 7,450 skipped → "index of 5,000 of 12,450 files" and Partial index notice |
| AC-8 | US-1 | design sections | unit | Render generated and skeleton view → same five titles in order |
| AC-9 | US-1 | design TOC | unit | Scroll the page until "First tasks" is in view → its item in the TOC is highlighted and the previous item is not (click-to-scroll is AC-50) |
| AC-10 | US-1 | design chevrons | unit | Chevron button has aria-expanded; toggles section |
| AC-11 | US-1, US-2 | request "facts deterministically" | integration | Build facts with LLM provider stubbed to throw → stack, endpoints, scripts present |
| AC-12 | US-1, US-3 | request "PageRank × (1 + hotness)"; `rank.ts:5` | unit | Files with hotness 0 → order equals PageRank order; with hotness set → product order |
| AC-13 | US-1 | list-length decision (25 per list); first-tasks decision | unit | Index with 60 ranked files → 25 critical paths, 25 reading entries, 3 tasks; model returns 3 tasks with 1 ungrounded → 2 shown |
| AC-14 | US-2 | request "every path must exist" | integration | Model returns a path not in index → absent from response |
| AC-15 | US-2 | request "don't invent" | unit | Model returns `npm run fake` with no such script → dropped |
| AC-16 | US-2 | design "used by 14 routes" | unit | Why-line counts equal index counts regardless of model wording |
| AC-17 | US-1 | assumed default; design badges | unit | File imported by 2 / 7 / 15 files → Low / Medium / High; directory path `specs/` → Low |
| AC-18 | US-2 | request "when no scripts/README" | unit | Repo without scripts → "No run instructions found in this repo" |
| AC-19 | US-6 | request "ONE structured LLM call" | integration | Generate with stub provider → exactly 1 call |
| AC-20 | US-5 | request untrusted input | unit | README with "ignore previous instructions" → wrapped as delimited untrusted data in the prompt |
| AC-21 | US-5, US-6 | assumed default | unit | 20,000-char README → truncated to 4,000; `.env.example` values absent |
| AC-22 | US-2, US-3 | request "don't hide failure" | integration | Stub returns invalid JSON → skeleton with "AI output invalid", failure recorded |
| AC-23 | US-3 | request "LLM call fails" | integration | Stub throws / hangs past 60 s → skeleton with "AI summary unavailable" and Retry |
| AC-24 | US-5 | ears LLM patterns | unit | Body containing `<script>` and `javascript:` link → rendered as text, no script element |
| AC-25 | US-5 | `onboarding.system.md` ("invalid diagrams are dropped") | unit | Malformed diagram → section text shown, no diagram |
| AC-26 | US-3 | request "deterministic skeleton" | unit | Skeleton state → banner with reason, five sections from facts, first tasks placeholder |
| AC-27 | US-3 | topic 3 "no clone"; SPEC-01/AC-11 precedent | integration | Repo without checkout → "Repository not cloned yet", no Regenerate |
| AC-28 | US-3 | topic 3 "indexing in progress" | unit | Index state running → "Indexing in progress"; polls every 5 s; generate enabled when done |
| AC-29 | US-3, US-6 | topic 3 `repoIntelEnabled` | integration | Flag off → skeleton "Repository index is turned off", zero model calls |
| AC-30 | US-3 | `types.ts:25` failed status | unit | Status failed → skeleton with reason and Re-analyze button |
| AC-31 | US-3 | `constants.ts:14` supported ext | integration | Python-only repo → "No supported source files indexed" and detected commands |
| AC-32 | US-4 | accepted UX proposal 1 | unit | First generation (no persisted tour) → skeleton content, Regenerate disabled, elapsed shown; on success sections replaced |
| AC-33 | US-4 | design Regenerate | integration | Persisted tour, click Regenerate → new run started; previous tour still shown with Regenerate disabled and elapsed time until success |
| AC-34 | US-4, US-6 | corner case | integration | Two POSTs within 1 s → second returns the running generation, one model call |
| AC-35 | US-3, US-4 | corner case | integration | Regenerate with failing provider → previous tour still served, failure reason shown |
| AC-36 | US-5 | threat checklist IDOR | integration | GET with another workspace's repo id → 404 |
| AC-37 | US-3 | topic staleness | unit | Tour generated at commit abc; index re-run at the same commit abc (timestamp moved) → no notice; index at commit def → notice with Regenerate |
| AC-38 | US-6 | `context.ts:120` persistence | integration | Persisted tour, GET twice → same body, zero model calls |
| AC-39 | US-6 | Q1 → resolved; design onboarding-tour-empty.png | unit | No tour persisted → empty state with title, body and a button labelled "Generate onboarding tour" with a plus icon (label text has no "+"); no call until click |
| AC-40 | US-6 | assumed default | integration | Second generate 10 s after first → rejected |
| AC-41 | — | (removed) Q2 | — | — |
| AC-42 | US-1 | design Open; assumed default | unit | Click Open → anchor to GitHub blob at indexed SHA, `target=_blank`, `rel=noopener` |
| AC-43 | US-1 | design copy button | unit | Command `pnpm dev # http://localhost:3000` → clipboard `pnpm dev`; "Copied" announced |
| AC-44 | US-6 | NFR observability | integration | Generation (ok and failed) → record with status, reason, duration, tokens, run id; no text content |
| AC-45 | US-4 | NFR accessibility | unit | Generation completes → live-region announcement, focus on Regenerate |
| AC-46 | US-3, US-6 | round-2 decision; `service.ts:189-205` (no_data) | integration | Repo with checkout and no index, POST generate → index requested, model not called until index state is full/partial |
| AC-47 | US-3 | round-2 decision | integration | Index exists but stale, Regenerate → no re-index, model called on current index; Re-analyze offered |
| AC-48 | US-1 | accepted UX proposal 3 | unit | Open URL with `#critical_paths` anchor (section key, underscore) → section scrolled into view and expanded |
| AC-49 | US-1 | Q2; design top bar of onboarding-tour-empty.png | unit | Page has no Share link control; breadcrumb "Workspace > Onboarding Tour" (same pattern as Project Context and Pull Requests) |
| AC-50 | US-1 | user amendment (TOC click); design "ON THIS PAGE" list; consistent with AC-9, AC-48 | unit | Collapse "First tasks", click or press Enter on its TOC item → section scrolled into view and expanded |
| AC-51 | US-1, US-2 | first-tasks decision; design "First tasks" cards; AC-14 grounding | integration | Stub returns 4 tasks incl. a nonexistent path and a directory `specs/` with indexed files → only grounded tasks (max 3) returned; one model call |
| AC-52 | US-1 | first-tasks decision; design cards (no Open button) | unit | Render First tasks → no Open button; clicking a card changes nothing |
| AC-53 | US-1 | long-list decision | unit | 20 critical paths → 8 rows and "Show all (20)"; activate → 20 rows, control reads "Show less" |
| AC-54 | US-1 | long-list decision | unit | Expanded list, activate "Show less" → 8 rows, "Show all (20)" |
| AC-55 | US-1 | long-list decision | unit | 8 reading entries → no toggle control |
| AC-56 | US-1, US-2, US-6 | long-list decision; AC-16 (facts from index); NFR LLM cost | integration | 25 ranked entries, stub model → prompt asks reasons for 8 per list; entries 9–25 return "imported by N files" text from the index, none from the model |
| AC-57 | US-1, US-3 | long-list decision; AC-26 | unit | Skeleton with 25 ranked files → 8 shown, "Show all (25)", all rows index facts only |
| AC-58 | US-1, US-3 | truncation-note decision; AC-6 count source | unit | Index of 4,800 files, list expanded → 25 rows then "Top 25 of 4,800 indexed files by import rank"; same in skeleton; index of 30 files whose list holds only 18 entries after grounding/filtering → no note; list with exactly 25 entries and no cut-off → no note |

Coverage:
- Edge cases: cap → AC-6, AC-7; hotness → AC-12; no clone → AC-27; indexing → AC-28; flag off → AC-29; failed index → AC-26, AC-30; non-JS → AC-31; no run facts → AC-18; invalid model output → AC-14, AC-15, AC-22; provider down → AC-23, AC-35; concurrency → AC-32, AC-34, AC-40; stale → AC-37; add-repo confusion → AC-3; IDOR → AC-36; narrow/dark/long paths → Accessibility NFR
- Untrusted inputs: README/excerpts → AC-20, AC-21; model output → AC-14, AC-15, AC-24, AC-25; repo id → AC-36; repeated runs → AC-34, AC-40; oversized → AC-13, AC-21
- Module interactions: tour endpoints → AC-23, AC-35; index-state → AC-28, AC-30, AC-46; resync → AC-30, AC-46, AC-47; repo-intel → AC-26, AC-29, AC-31; LLM → AC-22, AC-23; Postgres → AC-38; GitHub → AC-42
- NFRs: Performance → success signal; Accessibility → AC-10, AC-43, AC-45, AC-50; Security → AC-20, AC-21, AC-24, AC-36, AC-42, AC-44; i18n → AC-6; Observability → AC-44; LLM cost → AC-19, AC-21, AC-34, AC-39, AC-40, AC-56

## Design analysis
- Designs reviewed: `specs/onboarding/designs/onboarding-tour.png` and `specs/onboarding/designs/onboarding-tour-empty.png`, `client/src/components/app-shell/helpers.ts`, `client/src/app/onboarding/page.tsx`, `client/src/app/repos/[repoId]/`
- Gaps found:
  - No empty/loading/error/stale states in the design → AC-26 to AC-32, AC-35, AC-37
  - Sample "12,450 files" exceeds the 5,000 cap → AC-6, AC-7 (Q3)
  - Sample "used by 14 routes" needs a source; `file_facts` stores endpoints per file (request) → AC-16
  - The design shows a "Share link" button; it is intentionally dropped → AC-49, Non-goals (Q2)
  - "Open" target not defined → AC-42 (assumed default)
  - Empty-state copy says "DevDigest indexes the repo": Generate awaits an index build when none exists and does not re-index an existing one → AC-46, AC-47
  - Sample architecture diagram has a redis node; a diagram must come from grounded facts → AC-14, AC-25
  - Design has no cooldown or confirmation for paid Regenerate → AC-34, AC-39, AC-40
  - Add-repo route collides with the tour sidebar key → AC-3
- UX proposals:
  - Show the free deterministic skeleton while the model call runs, replacing sections as the result arrives — accepted → AC-32
  - Offer cancelling a running generation, keeping the previous tour — rejected: user decision, no cancel
  - Stale notice with one-click Regenerate — accepted → AC-37
  - Deep link scrolls to and expands the section named by the anchor (in-app only) — accepted → AC-48

## Open questions
Q6 is resolved. The decided values Q5 and Q7–Q13 are written into the ACs below and are confirmed by the user at the approval gate.
- Q1 → resolved: explicit "Generate onboarding tour" button (with a plus icon) on an empty state; no generation without the click → AC-39. Decision (not a question): Generate on an unindexed repo with a checkout awaits an index build first (AC-46); with an existing index it generates from it without re-indexing and offers Re-analyze when stale (AC-47).
- Q2 → resolved: Share link removed from scope → AC-41 (removed), Non-goals, AC-49
- Q3 → resolved: generate; header shows "indexed N of M files" (M = indexed + skipped) with a Partial index notice → AC-7
- Q4 → resolved: Project Context documents are not tour input → Non-goals
- Q5 [C1] — default used: "Open" opens the GitHub blob at the indexed commit in a new tab — assumed default — confirm → AC-42
- Q6 → resolved (decided by the user): up to 25 ranked, grounded entries per list for critical paths and reading path, 8 shown initially with Show all / Show less, model reasons for the top 8 only, up to 3 first tasks → AC-13, AC-53 to AC-57
- Q7 [C3] — default used: complexity derived from importer count (≤3 Low, 4–10 Medium, >10 High; a directory path is always Low, decided by the user's first-tasks rule) → AC-17 — assumed default — confirm
- Q8 [C5] — default used: model call timeout 60 s, no retry after invalid output → AC-23 — assumed default — confirm
- Q9 [C6] — default used: excerpt cap 4,000 characters, `.env.example` names only → AC-21 — assumed default — confirm
- Q10 [C5] — default used: 5 s index-state poll → AC-28 — assumed default — confirm
- Q11 [C5] — default used: 60 s cooldown between generations per repo → AC-40 — assumed default — confirm
- Q12 [C4] — default used: copy button omits trailing `# comment`; long paths truncate with full path on hover → AC-43 — assumed default — confirm
- Q13 [C2] — default used: any member of the repo's workspace may generate or regenerate (no roles exist in the code read) → AC-36 — assumed default — confirm
- Q14 → resolved: the two design PNGs (`specs/onboarding/designs/onboarding-tour.png`, `specs/onboarding/designs/onboarding-tour-empty.png`) are on disk and are the design source. Route path and persistence shape are plan decisions.
