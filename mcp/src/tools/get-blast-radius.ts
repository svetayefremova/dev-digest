import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getBlastRadius } from '../application/get-blast-radius.js';
import type { Deps } from '../application/types.js';
import { blastOutput } from '../schemas.js';
import { guard, toResult } from './errors.js';
import { repoArg } from './shared-args.js';

const inputSchema = {
  repo: repoArg,
  pr: z.number().int().positive().describe('Pull request number, e.g. 3'),
};

export function handleGetBlastRadius(
  deps: Deps,
  args: { repo?: string | undefined; pr: number },
): Promise<CallToolResult> {
  return guard(deps.config.apiUrl, async () => toResult(await getBlastRadius(deps.api, args)));
}

export function registerGetBlastRadius(server: McpServer, deps: Deps): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'PR blast radius',
      description:
        "Get a PR's blast radius: which symbols the PR's changed files declare, who calls them (file:line), and which HTTP endpoints and cron jobs depend on them. Reads the precomputed repo index; no LLM. Read-only.",
      inputSchema,
      outputSchema: blastOutput,
      annotations: { title: 'PR blast radius', readOnlyHint: true, openWorldHint: false },
    },
    (args) => handleGetBlastRadius(deps, args),
  );
}
