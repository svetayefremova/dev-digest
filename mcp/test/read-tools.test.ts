import { describe, expect, it } from 'vitest';
import { handleGetConventions } from '../src/tools/get-conventions.js';
import { handleListAgents } from '../src/tools/list-agents.js';
import { FakeApi, agent, repo } from './fake-api.js';
import { makeDeps, textOf } from './helpers.js';

describe('read-only tools', () => {
  it('list_agents hides disabled and never leaks system_prompt; conventions onward errors', async () => {
    const api = new FakeApi();
    api.agents = [agent('Security Reviewer', 'a1'), agent('Old', 'a2', false)];
    const deps = makeDeps(api);

    const res = await handleListAgents(deps, { include_disabled: false });
    const json = JSON.stringify(res);
    expect(json).toContain('Security Reviewer');
    expect(json).not.toContain('Old');
    expect(json).not.toContain('system_prompt');
    expect(json).not.toContain('SECRET SYSTEM PROMPT');
    expect(JSON.stringify(await handleListAgents(deps, { include_disabled: true }))).toContain('Old');

    api.repos = [repo('acme/api', 'r1')];
    const conv = await handleGetConventions(deps, { status: 'accepted', limit: 30, response_format: 'concise' });
    expect(conv.isError).toBe(true);
    expect(textOf(conv)).toContain('Run Scan');

    api.scan = {
      repo_id: 'r1',
      sample_files: 3,
      scanned_at: '2026-01-01',
      candidates: [
        { id: 'c1', category: 'naming', rule: 'Use camelCase', evidence_path: 'a.ts', evidence_line: 4, evidence_end_line: 5, evidence_snippet: 'x', confidence: 0.8, status: 'pending' },
      ],
    };
    const pend = await handleGetConventions(deps, { status: 'accepted', limit: 30, response_format: 'concise' });
    expect(textOf(pend)).toContain("status:'pending'");
  });
});
