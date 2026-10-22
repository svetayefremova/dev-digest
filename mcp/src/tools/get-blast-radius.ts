import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { toolError } from './errors.js';
import { repoArg } from './shared-args.js';

const inputSchema = {
  repo: repoArg,
  pr: z.number().int().positive().describe('Pull request number, e.g. 3'),
};

/** Placeholder: never calls the API, never computes anything. */
export function handleGetBlastRadius(): CallToolResult {
  return toolError(
    'get_blast_radius is NOT IMPLEMENTED YET in DevDigest — no data was computed. Do not infer impact from this tool; use get_findings or get_conventions instead.',
  );
}

export function registerGetBlastRadius(server: McpServer): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'PR blast radius (not implemented)',
      description:
        '[NOT IMPLEMENTED YET] PR blast radius (affected callers and dependents). Placeholder: always returns an error and computes nothing. Do not call it to judge PR impact; use get_findings or get_conventions instead.',
      inputSchema,
      annotations: { title: 'PR blast radius (not implemented)', readOnlyHint: true, openWorldHint: false },
    },
    () => handleGetBlastRadius(),
  );
}
