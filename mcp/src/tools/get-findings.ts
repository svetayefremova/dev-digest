import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getFindings, type GetFindingsArgs } from '../application/get-findings.js';
import { SEVERITIES } from '../domain/constants.js';
import type { Deps } from '../application/types.js';
import { findingsOutput } from '../schemas.js';
import { guard, toResult } from './errors.js';
import { formatArg, limitArg, repoArg } from './shared-args.js';

const inputSchema = {
  repo: repoArg,
  pr: z.number().int().positive().optional().describe('Pull request number, e.g. 3'),
  agent: z.string().min(1).optional().describe('Agent name or id from list_agents; omit for the newest review of every agent'),
  run_id: z
    .string()
    .uuid()
    .optional()
    .describe('run_id returned by run_agent_on_pr in this session; otherwise pass pr (+ repo)'),
  severity: z.enum(SEVERITIES).optional().describe('Only findings of this severity, e.g. CRITICAL'),
  limit: limitArg(20),
  response_format: formatArg.describe(
    'concise (default): severity, file:line, title, short message. detailed: adds rationale and suggestion',
  ),
};

type Args = Omit<GetFindingsArgs, 'format'> & { response_format: GetFindingsArgs['format'] };

export function handleGetFindings(deps: Deps, args: Args): Promise<CallToolResult> {
  const { response_format, ...rest } = args;
  return guard(deps.config.apiUrl, async () => toResult(await getFindings(deps, { ...rest, format: response_format })));
}

export function registerGetFindings(server: McpServer, deps: Deps): void {
  server.registerTool(
    'get_findings',
    {
      title: 'Get PR review findings',
      description:
        "Get PR review findings: verdict, score and findings from the latest finished DevDigest review of a PR (repo + pr, optional agent) or of a run_id from run_agent_on_pr. Read-only and never starts a review — if none exists, call run_agent_on_pr. Concise by default; response_format='detailed' adds rationale and suggestion.",
      inputSchema,
      outputSchema: findingsOutput,
      annotations: { title: 'Get PR review findings', readOnlyHint: true, openWorldHint: false },
    },
    (args) => handleGetFindings(deps, args),
  );
}
