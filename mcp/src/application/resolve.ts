import type { Agent, PrMeta, Repo } from '@devdigest/shared';
import type { DevDigestApi } from '../api/types.js';
import { REPO_RE } from '../domain/constants.js';
import { fail, ok, type Result } from '../domain/errors.js';

const LIST_MAX = 10;

function listNames(items: string[]): string {
  if (items.length <= LIST_MAX) return items.join(', ');
  return `${items.slice(0, LIST_MAX).join(', ')} …and ${items.length - LIST_MAX} more`;
}

export async function resolveRepo(api: DevDigestApi, repo?: string): Promise<Result<Repo>> {
  const repos = await api.listRepos();
  const names = repos.map((r) => r.full_name);
  if (repo === undefined || repo === '') {
    if (repos.length === 1) return ok(repos[0]!);
    if (repos.length === 0) {
      return fail('no_repos', 'No repos are connected in DevDigest', 'Add one in the DevDigest UI (Repos), then retry.');
    }
    return fail(
      'repo_required',
      `Several repos are connected: ${listNames(names)}`,
      'Pass repo as owner/name.',
    );
  }
  if (!REPO_RE.test(repo)) {
    return fail('bad_repo', `Invalid repo '${repo}'`, `Pass repo as owner/name. Connected repos: ${listNames(names) || 'none'}.`);
  }
  const found = repos.find((r) => r.full_name.toLowerCase() === repo.toLowerCase());
  if (!found) {
    return fail(
      'repo_not_connected',
      `Repo '${repo}' is not connected in DevDigest`,
      `Add it in the DevDigest UI (Repos). Connected repos: ${listNames(names) || 'none'}.`,
    );
  }
  return ok(found);
}

export interface ResolvedPull {
  prId: string;
  meta: PrMeta;
}

export async function resolvePull(api: DevDigestApi, repo: Repo, pr: number): Promise<Result<ResolvedPull>> {
  const find = (rows: PrMeta[]) => rows.find((p) => p.number === pr && p.id);
  let rows = await api.listPulls(repo.id);
  let hit = find(rows);
  if (!hit) {
    rows = await api.listPulls(repo.id, { bypassCache: true });
    hit = find(rows);
  }
  if (hit?.id) return ok({ prId: hit.id, meta: hit });
  const open = rows
    .filter((p) => p.id && (p.status === 'open' || p.status === 'needs_review'))
    .map((p) => `#${p.number} ${p.title.slice(0, 60)}`);
  return fail(
    'pr_not_found',
    `PR #${pr} not found in ${repo.full_name}`,
    open.length ? `Known open PRs: ${listNames(open)}.` : 'No open PRs are imported — import the PR in the DevDigest UI.',
  );
}

export async function resolveAgent(api: DevDigestApi, agent: string): Promise<Result<Agent>> {
  const agents = await api.listAgents();
  const byId = agents.find((a) => a.id === agent);
  if (byId) return ok(byId);
  const lower = agent.trim().toLowerCase();
  const byName = agents.filter((a) => a.name.toLowerCase() === lower);
  if (byName.length === 1) return ok(byName[0]!);
  if (byName.length > 1) {
    return fail(
      'agent_ambiguous',
      `Several agents are named '${agent}': ${byName.map((a) => `${a.name} (${a.id})`).join(', ')}`,
      'Pass the agent id instead.',
    );
  }
  return fail(
    'agent_not_found',
    `Agent '${agent}' not found`,
    `Call list_agents to get a valid agent name. Available: ${listNames(agents.map((a) => a.name)) || 'none'}.`,
  );
}
