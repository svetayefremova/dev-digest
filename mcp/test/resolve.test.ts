import { describe, expect, it } from 'vitest';
import { resolveAgent, resolvePull, resolveRepo } from '../src/application/resolve.js';
import { failureResult } from '../src/tools/errors.js';
import { FakeApi, agent, pull, repo } from './fake-api.js';

const text = (r: { ok: false; failure: Parameters<typeof failureResult>[0] }) => {
  const res = failureResult(r.failure);
  expect(res.isError).toBe(true);
  return (res.content[0] as { text: string }).text;
};

describe('resolvers', () => {
  it('resolves repos, PRs and agents with onward error messages', async () => {
    const api = new FakeApi();
    api.repos = [repo('owner/repo', 'r1')];
    api.pulls['r1'] = [pull(12, 'p12', 'Fix thing'), pull(13, null, 'Not imported')];
    api.agents = [agent('Security Reviewer', 'a1')];

    const r = await resolveRepo(api, 'Owner/Repo');
    expect(r.ok && r.value.id).toBe('r1');
    const single = await resolveRepo(api);
    expect(single.ok && single.value.id).toBe('r1');

    const unknown = await resolveRepo(api, 'x/y');
    expect(!unknown.ok && text(unknown)).toContain('owner/repo');

    const repoRow = (r as { ok: true; value: ReturnType<typeof repo> }).value;
    const pr = await resolvePull(api, repoRow, 999);
    expect(!pr.ok && text(pr)).toContain('#12');
    expect(api.count('listPulls:bypass')).toBe(1);
    const notImported = await resolvePull(api, repoRow, 13);
    expect(notImported.ok).toBe(false);
    const found = await resolvePull(api, repoRow, 12);
    expect(found.ok && found.value.prId).toBe('p12');

    const a = await resolveAgent(api, 'SECURITY reviewer');
    expect(a.ok && a.value.id).toBe('a1');
    const bad = await resolveAgent(api, 'nope');
    expect(!bad.ok && text(bad)).toContain('list_agents');

    api.repos = [repo('a/b'), repo('c/d')];
    const many = await resolveRepo(api);
    expect(!many.ok && text(many)).toMatch(/a\/b.*c\/d/);
  });
});
