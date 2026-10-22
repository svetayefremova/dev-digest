import { describe, expect, it } from 'vitest';
import { handleGetFindings } from '../src/tools/get-findings.js';
import { FakeApi, agent, pull, repo } from './fake-api.js';
import { RUN_UUID, finding, makeDeps, reviewRec, runRow, textOf } from './helpers.js';

const base = { limit: 20, response_format: 'concise' as const };

function setup() {
  const api = new FakeApi();
  api.repos = [repo('acme/api', 'r1')];
  api.pulls['r1'] = [pull(3, 'p3')];
  api.agents = [agent('Security Reviewer', 'a1'), agent('Style', 'a2')];
  return api;
}

describe('get_findings', () => {
  it('picks the newest review of exactly the requested agent', async () => {
    const api = setup();
    api.reviews['p3'] = [
      reviewRec('old', 'a1', 'Security Reviewer', [finding(1, 'WARNING')], '2026-01-01T00:00:00Z'),
      reviewRec('new', 'a1', 'Security Reviewer', [finding(2, 'CRITICAL')], '2026-02-01T00:00:00Z'),
      reviewRec('other', 'a2', 'Style', [finding(9, 'SUGGESTION')], '2026-03-01T00:00:00Z'),
    ];
    const res = await handleGetFindings(makeDeps(api), { ...base, pr: 3, agent: 'Security Reviewer' });
    const sc = res.structuredContent as any;
    expect(sc.run_id).toBe('new');
    expect(sc.findings).toHaveLength(1);
    expect(sc.findings[0].title).toBe('Title 2');
    expect(api.count('startReview')).toBe(0);

    const both = await handleGetFindings(makeDeps(api), { ...base, pr: 3 });
    expect((both.structuredContent as any).reviews).toHaveLength(2);
  });

  it('run_id states: running, unknown, severity filter with limit', async () => {
    const api = setup();
    const deps = makeDeps(api);
    deps.sessionRuns.remember(RUN_UUID, { prId: 'p3', repo: 'acme/api', pr: 3, agentId: 'a1', agentName: 'Security Reviewer' });
    api.runs['p3'] = [runRow(RUN_UUID, 'a1', 'running')];
    const running = await handleGetFindings(deps, { ...base, run_id: RUN_UUID });
    expect((running.structuredContent as any).status).toBe('running');

    const unknown = await handleGetFindings(makeDeps(api), { ...base, run_id: RUN_UUID });
    expect(unknown.isError).toBe(true);
    expect(textOf(unknown)).toContain('repo + pr');

    api.runs['p3'] = [runRow(RUN_UUID, 'a1', 'done')];
    api.reviews['p3'] = [
      reviewRec(RUN_UUID, 'a1', 'Security Reviewer', [finding(1, 'WARNING'), finding(2, 'WARNING'), finding(3, 'WARNING'), finding(4, 'CRITICAL')]),
    ];
    const filtered = await handleGetFindings(deps, { ...base, run_id: RUN_UUID, severity: 'WARNING', limit: 1 });
    const sc = filtered.structuredContent as any;
    expect(sc.shown).toBe(1);
    expect(sc.total).toBe(3);
    expect(textOf(filtered)).toContain('Showing 1 of 3');
  });

  it('no review leads to run_agent_on_pr', async () => {
    const api = setup();
    const res = await handleGetFindings(makeDeps(api), { ...base, pr: 3 });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('run_agent_on_pr');
  });
});
