# e2e — CLAUDE.md

`@devdigest/e2e` — deterministic browser e2e for the client web app, driven by Vercel agent-browser (CDP, no LLM).

## Stack

TypeScript 5.7 (ESM, run via `tsx`), Vercel agent-browser (CDP).

## Commands

```
npm test                 # tsx run.ts
npm run e2e:hermetic      # ../scripts/e2e.sh (boots client+server, then runs)
npm run typecheck           # tsc --noEmit -p tsconfig.json
```

## Map

- `run.ts` — test runner entrypoint
- `lib/` — runner helpers
- `specs/` — flow fixtures (`NN-name.flow.json`), not prose specs (see Gotchas)

## Gotchas

- `specs/*.flow.json` are JSON test-flow fixtures consumed by `run.ts`. There's deliberately no separate prose specs folder here — the name `specs/` is already taken by the flow fixtures. Prose feature specs for this module live in `docs/` instead.
- No LLM in the loop — flows are deterministic CDP scripts, not agent-driven.
- `npm run e2e:hermetic` expects `client` and `server` to be runnable; see `../scripts/e2e.sh`.

## Read when

- `README.md` — when you need the flow format and coverage table.
- `docs/` — when you need prior design-decision context, or a prose feature spec, for this module.
- `INSIGHTS.md` — read FIRST, before any work in this module, every session. Mandatory, not just for nontrivial tasks.
- `../TESTING.md` — when touching tests.
