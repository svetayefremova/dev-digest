---
name: run-app
description: Launch the DevDigest studio (client :3000 + server :3001 + Postgres) and check a UI change in headless Chrome with targeted assertions and clipped screenshots, using the seeded demo PR #482 (files with patches in every Smart Diff role, plus seeded findings). Use when asked to run, open, screenshot or verify the app in a browser, to confirm a UI change works in the real app, or to record a demo. Not for unit/integration tests (see TESTING.md).
---

# Run and check the app

The verified way to see a change in the real app. It costs few tokens because it asserts specific things and screenshots only the region under test.

## 1. Make sure the stack is up

```bash
lsof -iTCP -sTCP:LISTEN -P | grep -E ':3000|:3001|:5432'   # client, server, postgres
curl -s localhost:3001/health                                # → {"status":"ok"}
```

- Postgres runs in Docker (`devdigest-postgres`). If it is down, start the container. Never run `db:migrate` against it (`server/INSIGHTS.md`).
- If a dev server is missing, start it in the background: `cd server && npm run dev`, `cd client && npm run dev`. Both watch files, so they serve the **currently checked-out branch**. Switching branches changes what you see.
- The first page load after a restart can fail while Next compiles. Retry once before debugging.

## 2. Use the seeded demo PR

`npm run db:seed` (in `server/`) is idempotent. It creates `acme/payments-api` PR #482, or backfills it:
- 9 files with real patches, at least one per Smart Diff role (core, tests, wiring, docs, boilerplate with `package-lock.json`);
- a seeded review whose findings sit on rendered lines (`src/config.ts:12` CRITICAL, `src/api/users.ts:45` WARNING).

The data comes from `server/src/db/seed-demo-pr.ts`. Use this PR instead of running a live review (it costs money and may find nothing) or hand-inserting rows.

```bash
REPO=$(curl -s localhost:3001/repos | python3 -c "import json,sys;print(next(r['id'] for r in json.load(sys.stdin) if r['full_name']=='acme/payments-api'))")
echo "http://localhost:3000/repos/$REPO/pulls/482?tab=diff"
```

Tabs are `?tab=overview|findings|diff`. The GitHub refresh for this fake repo fails and the API serves the persisted data, which is intended.

## 3. Drive it

`gh` and the e2e driver (`agent-browser`) may not be installed. `playwright-core` with the system Chrome is enough. Install it once into a temp dir, outside the repo:

```bash
D="${TMPDIR:-/tmp}/devdigest-run"; mkdir -p "$D"
[ -d "$D/node_modules/playwright-core" ] || npm i --prefix "$D" playwright-core@1 --silent
cp .claude/skills/run-app/scripts/check.mjs "$D/" && cd "$D"
node check.mjs "<url>" '[{"see":"Core"},{"click":"Original order"},{"absent":"Boilerplate"},{"shot":"diff.png","clip":"section"}]'
```

The script prints one line per step (`PASS`/`FAIL`), then page errors and failed API calls. It exits with 1 on a failed assertion or a page error. Step syntax is in the header of `scripts/check.mjs`.

## Rules

- **Assert, don't dump.** Use `see`, `absent` and `count` steps. Never print `innerText` of the whole page: it pulls whole diffs into context.
- **Clip screenshots** to the component under test (`"clip": "<css selector>"`). Look at every screenshot you take; a blank frame means the page failed to load, not that the check passed.
- **No temporary DB rows.** If a scenario needs data the seed doesn't have, extend `seed-demo-pr.ts`. Don't hand-insert rows and forget to delete them.
- **Report outcomes plainly:** which steps passed, which failed, and what was not checked.
