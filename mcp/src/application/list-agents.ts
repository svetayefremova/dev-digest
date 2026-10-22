import type { DevDigestApi } from '../api/types.js';
import { ok, type Result } from '../domain/errors.js';
import type { Output } from './types.js';

export interface AgentRow {
  name: string;
  id: string;
  model: string;
  enabled: boolean;
  description: string;
}

export async function listAgents(
  api: DevDigestApi,
  opts: { includeDisabled: boolean },
): Promise<Result<Output<{ agents: AgentRow[] }>>> {
  const all = await api.listAgents();
  const agents = all
    .filter((a) => opts.includeDisabled || a.enabled)
    .map((a) => ({
      name: a.name,
      id: a.id,
      model: a.model,
      enabled: a.enabled,
      description: a.description.length > 160 ? `${a.description.slice(0, 159)}…` : a.description,
    }));
  if (agents.length === 0) {
    return ok({
      structured: { agents },
      text: 'No agents configured — create one in the DevDigest UI (Agents), then call list_agents again.',
    });
  }
  const lines = agents.map((a) => `- ${a.name} (${a.model})${a.enabled ? '' : ' [disabled]'}: ${a.description}`);
  return ok({ structured: { agents }, text: [`${agents.length} agent(s). Pass the name as \`agent\`:`, ...lines].join('\n') });
}
