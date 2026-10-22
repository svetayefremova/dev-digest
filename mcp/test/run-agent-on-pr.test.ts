import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/api/errors.js';
import { handleRunAgentOnPr } from '../src/tools/run-agent-on-pr.js';
import { FakeApi, agent, pull, repo } from './fake-api.js';
import { finding, makeDeps, reviewRec, runRow, textOf } from './helpers.js';

function setup() {
  const api = new FakeApi();
  api.repos = [repo('acme/api', 'r1')];
  api.pulls['r1'] = [pull(3, 'p3')];
  api.agents = [agent('Security Reviewer', 'a1'), agent('Off', 'a2', false)];
  return api;
}

describe('run_agent_on_pr', () => {
  it('happy path: start, poll, summarize', async () => {
    const api = setup();
    const runId = 'run-p3-a1';
    api.runs['p3'] = [runRow(runId, 'a1', 'running')];
    api.onListRuns = (_p, call) => {
      if (call >= 3) api.runs['p3'] = [runRow(runId, 'a1', 'done')];
    };
    api.reviews['p3'] = [
      reviewRec(runId, 'a1', 'Security Reviewer', [
        finding(1, 'CRITICAL'), finding(2, 'CRITICAL'), finding(3, 'WARNING'), finding(4, 'WARNING'), finding(5, 'SUGGESTION'),
      ]),
    ];
    const res = await handleRunAgentOnPr(makeDeps(api), { pr: 3, agent: 'security reviewer' });
    expect(res.isError).toBeFalsy();
    const sc = res.structuredContent as any;
    expect(sc.status).toBe('done');
    expect(sc.run_id).toBe(runId);
    expect(sc.counts).toEqual({ CRITICAL: 2, WARNING: 2, SUGGESTION: 1 });
    expect(sc.top_findings).toHaveLength(3);
    expect(textOf(res)).toContain('get_findings');
    expect(api.count('startReview')).toBe(1);
  });

  it('attaches to an in-flight run and ignores the classifier row', async () => {
    const api = setup();
    api.active['p3'] = [
      { run_id: 'classifier', agent_id: null, agent_name: 'intent', ran_at: null },
      { run_id: 'live', agent_id: 'a1', agent_name: 'Security Reviewer', ran_at: null },
    ];
    api.runs['p3'] = [runRow('live', 'a1', 'done')];
    api.reviews['p3'] = [reviewRec('live', 'a1', 'Security Reviewer', [finding(1, 'WARNING')])];
    const res = await handleRunAgentOnPr(makeDeps(api), { pr: 3, agent: 'a1' });
    expect((res.structuredContent as any).run_id).toBe('live');
    expect(api.count('startReview')).toBe(0);
  });

  it('timeout is not an error and returns run_id', async () => {
    const api = setup();
    api.runs['p3'] = [runRow('run-p3-a1', 'a1', 'running')];
    const res = await handleRunAgentOnPr(makeDeps(api, { waitMs: 3000 }), { pr: 3, agent: 'Security Reviewer' });
    expect(res.isError).toBeFalsy();
    expect((res.structuredContent as any)).toMatchObject({ status: 'running', run_id: 'run-p3-a1' });
    expect(textOf(res)).toContain('get_findings');
  });

  it('failed run, rate limit and disabled agent lead onward', async () => {
    const api = setup();
    api.runs['p3'] = [runRow('run-p3-a1', 'a1', 'failed', 'quota')];
    const failed = await handleRunAgentOnPr(makeDeps(api), { pr: 3, agent: 'Security Reviewer' });
    expect(failed.isError).toBe(true);
    expect(textOf(failed)).toContain('quota');
    expect(textOf(failed)).toContain('run_agent_on_pr');

    const api2 = setup();
    api2.startError = new ApiError(429, 'rate_limited', 'Too many');
    const limited = await handleRunAgentOnPr(makeDeps(api2), { pr: 3, agent: 'Security Reviewer' });
    expect(limited.isError).toBe(true);
    expect(textOf(limited)).toContain('retry');

    const api3 = setup();
    const disabled = await handleRunAgentOnPr(makeDeps(api3), { pr: 3, agent: 'Off' });
    expect(disabled.isError).toBe(true);
    expect(textOf(disabled)).toContain('list_agents');
    expect(api3.count('startReview')).toBe(0);
  });
});
