import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { listAgents } from '../application/list-agents.js';
import type { Deps } from '../application/types.js';
import { agentsOutput } from '../schemas.js';
import { guard, toResult } from './errors.js';

const inputSchema = {
  include_disabled: z
    .boolean()
    .default(false)
    .describe('Also list agents disabled in DevDigest (they cannot be run).'),
};

export function handleListAgents(deps: Deps, args: { include_disabled: boolean }): Promise<CallToolResult> {
  return guard(deps.config.apiUrl, async () => {
    return toResult(await listAgents(deps.api, { includeDisabled: args.include_disabled }));
  });
}

export function registerListAgents(server: McpServer, deps: Deps): void {
  server.registerTool(
    'list_agents',
    {
      title: 'List DevDigest reviewer agents',
      description:
        'List DevDigest PR reviewer agents (name, model, enabled). Call this first to get a valid `agent` value for run_agent_on_pr or get_findings. Disabled agents are hidden unless include_disabled=true. Read-only.',
      inputSchema,
      outputSchema: agentsOutput,
      annotations: { title: 'List DevDigest reviewer agents', readOnlyHint: true, openWorldHint: false },
    },
    (args) => handleListAgents(deps, args),
  );
}
