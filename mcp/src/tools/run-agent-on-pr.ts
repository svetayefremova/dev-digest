import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { runAgentOnPr } from '../application/run-agent-on-pr.js';
import type { Deps } from '../application/types.js';
import { runOutput } from '../schemas.js';
import { guard, toResult } from './errors.js';
import { repoArg } from './shared-args.js';

const inputSchema = {
  pr: z.number().int().positive().describe('Pull request number, e.g. 3'),
  agent: z.string().min(1).describe('Agent name or id from list_agents'),
  repo: repoArg,
};

export function handleRunAgentOnPr(
  deps: Deps,
  args: { pr: number; agent: string; repo?: string | undefined },
): Promise<CallToolResult> {
  return guard(deps.config.apiUrl, async () => toResult(await runAgentOnPr(deps, args)));
}

export function registerRunAgentOnPr(server: McpServer, deps: Deps): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      title: 'Run DevDigest agent review on a PR',
      description:
        'Run a DevDigest PR review: one reviewer agent on one pull request. Waits for completion (up to ~4 min) and returns the verdict, finding counts by severity, the top 3 findings and a run_id; call get_findings with that run_id for the full or filtered list (e.g. severity=CRITICAL). Starts a paid LLM run: if a finished review already exists, use get_findings instead. Reuses an in-flight run for the same PR and agent.',
      inputSchema,
      outputSchema: runOutput,
      annotations: {
        title: 'Run DevDigest agent review on a PR',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      // Claude Code asks for confirmation on every call (the run costs LLM tokens).
      _meta: { 'anthropic/requiresUserInteraction': true },
    },
    (args) => handleRunAgentOnPr(deps, args),
  );
}
