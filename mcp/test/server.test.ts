import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';
import { FakeApi, agent, pull, repo } from './fake-api.js';
import { finding, makeDeps, reviewRec, runRow } from './helpers.js';

async function connect(api: FakeApi) {
  const d = makeDeps(api);
  const server = createServer({ api, config: d.config, sessionRuns: d.sessionRuns, sleep: d.sleep, now: d.now });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

describe('protocol smoke', () => {
  it('lists 5 tools with correct annotations and runs the target scenario', async () => {
    const api = new FakeApi();
    api.repos = [repo('acme/api', 'r1')];
    api.pulls['r1'] = [pull(3, 'p3')];
    api.agents = [agent('Security Reviewer', 'a1')];
    const runId = '22222222-2222-4222-8222-222222222222';
    api.startResponse = { runs: [{ run_id: runId, agent_id: 'a1', agent_name: 'Security Reviewer' }] };
    api.runs['p3'] = [runRow(runId, 'a1', 'done')];
    api.reviews['p3'] = [
      reviewRec(runId, 'a1', 'Security Reviewer', [finding(1, 'CRITICAL'), finding(2, 'WARNING'), finding(3, 'CRITICAL')]),
    ];
    const client = await connect(api);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['get_blast_radius', 'get_conventions', 'get_findings', 'list_agents', 'run_agent_on_pr'],
    );
    const run = tools.find((t) => t.name === 'run_agent_on_pr')!;
    expect(run.annotations?.readOnlyHint).toBe(false);
    expect(run.annotations?.openWorldHint).toBe(true);
    expect(run._meta?.['anthropic/requiresUserInteraction']).toBe(true);
    for (const t of tools.filter((x) => x.name !== 'run_agent_on_pr')) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t._meta?.['anthropic/requiresUserInteraction']).toBeUndefined();
    }
    const instr = client.getInstructions();
    expect(instr!.length).toBeLessThan(4096);

    const agents = await client.callTool({ name: 'list_agents', arguments: {} });
    expect((agents.structuredContent as any).agents[0].name).toBe('Security Reviewer');

    const ran = await client.callTool({ name: 'run_agent_on_pr', arguments: { pr: 3, agent: 'security reviewer' } });
    const rsc = ran.structuredContent as any;
    expect(rsc.run_id).toBe(runId);

    const found = await client.callTool({ name: 'get_findings', arguments: { run_id: runId, severity: 'CRITICAL' } });
    const fsc = found.structuredContent as any;
    expect(fsc.findings.every((f: any) => f.severity === 'CRITICAL')).toBe(true);
    expect(fsc.findings).toHaveLength(rsc.counts.CRITICAL);
    expect((found.content as any)[0].type).toBe('text');

    const plain = await client.callTool({ name: 'get_findings', arguments: { repo: 'acme/api', pr: 3 } });
    expect((plain.structuredContent as any).findings).toBeDefined();
    expect((plain.content as any)[0].type).toBe('text');

    // isError results must pass even though the tool declares an outputSchema
    const err = await client.callTool({ name: 'get_findings', arguments: { pr: 99 } });
    expect(err.isError).toBe(true);
    const stub = await client.callTool({ name: 'get_blast_radius', arguments: { pr: 3 } });
    expect(stub.isError).toBe(true);
  });
});
