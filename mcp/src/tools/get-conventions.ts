import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getConventions } from '../application/get-conventions.js';
import type { Deps } from '../application/types.js';
import { conventionsOutput } from '../schemas.js';
import { guard, toResult } from './errors.js';
import { formatArg, limitArg, repoArg } from './shared-args.js';

const inputSchema = {
  repo: repoArg,
  status: z.enum(['accepted', 'pending', 'all']).default('accepted').describe('accepted (default), pending, or all'),
  limit: limitArg(30),
  response_format: formatArg.describe('concise (default): category, rule, file:line. detailed: adds evidence snippet and confidence'),
};

type Args = {
  repo?: string | undefined;
  status: 'accepted' | 'pending' | 'all';
  limit: number;
  response_format: 'concise' | 'detailed';
};

export function handleGetConventions(deps: Deps, args: Args): Promise<CallToolResult> {
  return guard(deps.config.apiUrl, async () =>
    toResult(
      await getConventions(deps.api, { repo: args.repo, status: args.status, limit: args.limit, format: args.response_format }),
    ),
  );
}

export function registerGetConventions(server: McpServer, deps: Deps): void {
  server.registerTool(
    'get_conventions',
    {
      title: 'Get repo coding conventions',
      description:
        "Get repo coding conventions: house rules DevDigest extracted for a connected repo (naming, structure, error handling, testing), each with file:line evidence. Use before writing or reviewing code in that repo. Returns accepted rules by default; status='pending' shows unreviewed candidates. Read-only.",
      inputSchema,
      outputSchema: conventionsOutput,
      annotations: { title: 'Get repo coding conventions', readOnlyHint: true, openWorldHint: false },
    },
    (args) => handleGetConventions(deps, args),
  );
}
