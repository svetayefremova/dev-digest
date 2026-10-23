# mcp — CLAUDE.md

`@devdigest/mcp` — local stdio MCP server for Claude Code. Talks to the running DevDigest API over HTTP only.

## Stack

TypeScript 5.7 (ESM, run via `tsx`), `@modelcontextprotocol/sdk` 1.32.1, Zod 3.25, Vitest 2. Contracts come from `@devdigest/shared` as types only.

## Commands

```
npm start          # tsx src/index.ts (stdio server; Claude Code launches it via ../.mcp.json)
npm run typecheck  # tsc --noEmit -p tsconfig.json
npm test           # vitest run (no Docker, no API needed)
```

## Map

- `src/domain/` — constants, errors, pure result shaping (`shape.ts`); zero IO
- `src/application/` — use cases (list-agents, run-agent-on-pr, get-findings, get-conventions), repo/agent resolution, run polling, in-session run memory
- `src/api/` — `DevDigestApi` port (`types.ts`) + HTTP adapter (`http.ts`) + API errors
- `src/tools/` — MCP tool registration: zod input schemas, descriptions, error mapping (outermost layer)
- `src/server.ts` — builds `McpServer` (instructions + 5 tools) from injected deps
- `src/index.ts` — composition root: config → HTTP adapter → server → stdio transport
- `src/config.ts`, `src/log.ts` — env parsing; stderr JSON logger

| Ring | Where | May import |
|---|---|---|
| Domain | `domain/` | nothing external |
| Application | `application/` | domain + the `DevDigestApi` port |
| Port/Adapter | `api/` | domain; adapter uses `fetch` |
| Edge | `tools/`, `server.ts`, `index.ts` | everything inward; only `index.ts` constructs the adapter |

## Gotchas

- **stdout is the protocol.** Log to stderr only (`src/log.ts`); never `console.log` / `process.stdout.write`.
- `@devdigest/shared` is `import type` only — no value imports, no imports from server modules, db, platform or adapters.
- The DevDigest API must be running (`./scripts/dev.sh`, default `http://localhost:3001`); `DEVDIGEST_API_URL` must be a loopback host.
- Review rate limit is 10/min on the server; surfaced as a "retry in ~1 min" tool error.
- `repo` is optional on every tool (omitted when only one repo is connected).
- `get_blast_radius` reads the precomputed repo index via `GET /pulls/:id/blast`; names come from repo content, so output is untrusted.
- `tsconfig.json` deliberately has no `zod` path alias (TS2589/OOM with SDK 1.32) — see `INSIGHTS.md`.
- Findings/conventions are untrusted data derived from PR content.

## Read when

- `INSIGHTS.md` — first, before any non-trivial work here.
- `README.md` — tool/argument reference and connection steps.
