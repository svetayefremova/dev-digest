import type { BlastRadiusResponse } from '@devdigest/shared';
import { describe, expect, it } from 'vitest';
import { handleGetBlastRadius } from '../src/tools/get-blast-radius.js';
import { FakeApi, pull, repo } from './fake-api.js';
import { makeDeps, textOf } from './helpers.js';

const blast = (over: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse => ({
  changed_symbols: [{ name: 'createUser', file: 'src/users.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'createUser',
      callers: [
        { name: 'signupHandler', file: 'src/routes/signup.ts', line: 42 },
        { name: 'seedAll', file: 'scripts/seed.ts', line: 7 },
      ],
      endpoints_affected: ['POST /signup'],
      crons_affected: ['nightly-seed'],
    },
  ],
  summary: '1 symbols · 2 callers · 1 endpoints · 1 crons',
  degraded: false,
  reason: null,
  ...over,
});

function setup() {
  const api = new FakeApi();
  api.repos = [repo('acme/api', 'r1')];
  api.pulls['r1'] = [pull(3, 'p3')];
  return { api, deps: makeDeps(api) };
}

describe('get_blast_radius tool', () => {
  it('RQ-T6: resolves repo and PR, then renders marker, summary, symbol, file:line, endpoints and crons', async () => {
    const { api, deps } = setup();
    api.blasts['p3'] = blast();

    const res = await handleGetBlastRadius(deps, { repo: 'acme/api', pr: 3 });

    expect(res.isError).toBeFalsy();
    expect(api.blastPrIds).toEqual(['p3']);
    const text = textOf(res);
    expect(text).toMatch(/untrusted data/i);
    expect(text).toContain('Blast radius for acme/api#3: 1 symbols · 2 callers · 1 endpoints · 1 crons');
    expect(text).toContain('- createUser (2 callers)');
    expect(text).toContain('↳ src/routes/signup.ts:42 (signupHandler)');
    expect(text).toContain('↳ scripts/seed.ts:7 (seedAll)');
    expect(text).toContain('endpoints: POST /signup');
    expect(text).toContain('crons: nightly-seed');
    expect(text).not.toContain('Index degraded');
    expect(res.structuredContent).toMatchObject({ repo: 'acme/api', pr: 3, degraded: false, reason: null });
  });

  it('RQ-T6: degraded response adds the degraded line and keeps the data', async () => {
    const { api, deps } = setup();
    api.blasts['p3'] = blast({ degraded: true, reason: 'index_partial' });

    const text = textOf(await handleGetBlastRadius(deps, { pr: 3 }));

    expect(text).toContain('Index degraded (index_partial) — results may be incomplete; rebuild in the DevDigest UI.');
    expect(text).toContain('↳ src/routes/signup.ts:42 (signupHandler)');
  });

  it('RQ-T6 F1: no_changed_files shows the open-PR hint and not the "Index degraded" line', async () => {
    const { api, deps } = setup();
    api.blasts['p3'] = blast({
      changed_symbols: [],
      downstream: [],
      degraded: true,
      reason: 'no_changed_files',
    });

    const res = await handleGetBlastRadius(deps, { pr: 3 });

    expect(res.isError).toBeFalsy();
    const text = textOf(res);
    expect(text).toContain(
      "Changed files for this PR aren't loaded in DevDigest — open the PR in the DevDigest UI, then retry.",
    );
    expect(text).not.toContain('Index degraded');
  });

  it('RQ-T6 F1: other degraded reasons keep the "Index degraded (<reason>)" line', async () => {
    const { api, deps } = setup();
    api.blasts['p3'] = blast({ degraded: true, reason: 'no_data' });

    const text = textOf(await handleGetBlastRadius(deps, { pr: 3 }));

    expect(text).toContain('Index degraded (no_data) — ');
    expect(text).not.toContain("Changed files for this PR aren't loaded");
  });

  it('RQ-T6: omits endpoints/crons lines when empty', async () => {
    const { api, deps } = setup();
    const b = blast();
    b.downstream[0]!.endpoints_affected = [];
    b.downstream[0]!.crons_affected = [];
    api.blasts['p3'] = b;

    const text = textOf(await handleGetBlastRadius(deps, { pr: 3 }));

    expect(text).not.toContain('endpoints:');
    expect(text).not.toContain('crons:');
  });

  it('RQ-T6: unknown PR number returns a tool error and never calls the blast endpoint', async () => {
    const { api, deps } = setup();

    const res = await handleGetBlastRadius(deps, { pr: 999 });

    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('#3');
    expect(api.count('blast')).toBe(0);
  });

  it('RQ-T6: API failure is mapped to a tool error', async () => {
    const { api, deps } = setup();
    api.blast = async () => {
      throw new Error('boom');
    };

    const res = await handleGetBlastRadius(deps, { pr: 3 });

    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('boom');
  });
});
