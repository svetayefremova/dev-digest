# @devdigest/mcp

Local stdio [MCP](https://modelcontextprotocol.io) server that lets Claude Code run DevDigest reviewer agents on a PR and read findings and repo conventions. It talks to the running DevDigest API over HTTP only (contracts are consumed as types via the `@devdigest/shared` path alias). Requires the API (`./scripts/dev.sh`, `:3001`).

## Tools

`repo` is `owner/name` and optional on every tool (omit it when only one repo is connected).

| Tool | Arguments | Purpose |
|---|---|---|
| `list_agents` | `include_disabled?` (default false) | List reviewer agents; get a valid `agent` value |
| `run_agent_on_pr` | `pr` (int), `agent` (name or id), `repo?` | Start (or reuse an in-flight) review, wait up to `DEVDIGEST_MCP_WAIT_MS`, return verdict, counts, top 3 findings, `run_id`. Paid LLM run |
| `get_findings` | `repo?`, `pr?`, `agent?`, `run_id?`, `severity?` (CRITICAL/WARNING/SUGGESTION), `limit?` (default 20), `response_format?` (concise/detailed) | Read the latest finished review or a given `run_id`; never starts a review |
| `get_conventions` | `repo?`, `status?` (accepted/pending/all, default accepted), `limit?` (default 30), `response_format?` | Repo coding conventions with `file:line` evidence |
| `get_blast_radius` | `repo?`, `pr` | Read-only. Changed symbols, callers (`file:line`), affected endpoints and crons for a PR, from `GET /pulls/:id/blast`; see [blast radius](../docs/features/add-blast-radius.md) |

## Environment

| Variable | Default | Notes |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Must be a loopback host (localhost, 127.0.0.1, ::1) |
| `DEVDIGEST_MCP_WAIT_MS` | `240000` | Max wait for a run (0–600000) |
| `DEVDIGEST_MCP_POLL_MS` | `3000` | Poll interval (min 1000) |

Invalid values print an error to stderr and exit 1.

## Connect

```sh
cd mcp && npm install
```

The repo-root [`.mcp.json`](../.mcp.json) launches `mcp/node_modules/.bin/tsx mcp/src/index.ts` from the repo root. Open Claude Code in the repo root, approve the `devdigest` server, and check `/mcp` shows it connected.

## Verify

- Inspector (API running): `npx @modelcontextprotocol/inspector mcp/node_modules/.bin/tsx mcp/src/index.ts` — 5 tools listed.
- Claude Code: `/mcp` shows `devdigest` connected; `/context` shows only tool names and instructions as startup cost.
- Tests: `npm run typecheck && npm test` (no Docker, no API).
