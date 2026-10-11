import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * Skills module + the agent side of the link table: CRUD and body versioning,
 * the import path (preview saves nothing; a confirmed import is stored
 * disabled), the per-agent enabled/order set, version history + restore,
 * 30-day stats / list usage, and tenant isolation.
 */
d('skills (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceBId: string;
  let user: { id: string; email: string; name: string };

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    // A real user row: agents.created_by is a uuid FK, so the mock auth's
    // default user ('u1') cannot create an agent.
    const [seeded] = await pg.handle.db.select().from(t.users);
    user = { id: seeded!.id, email: seeded!.email, name: seeded!.name ?? 'You' };
    const [wsB] = await pg.handle.db.insert(t.workspaces).values({ name: 'workspace-b' }).returning();
    workspaceBId = wsB!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const app = () => buildApp({ config: config(), db: pg.handle.db });
  const appAs = (workspace: { id: string; name: string }) =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { auth: new MockAuthProvider(user, workspace) },
    });
  const appAsB = () => appAs({ id: workspaceBId, name: 'workspace-b' });

  const skillBody = (name: string) => ({
    name,
    description: `Use when reviewing ${name}.`,
    type: 'rubric' as const,
    body: `# ${name}\n\nRule body.`,
  });

  async function createSkill(a: Awaited<ReturnType<typeof app>>, name: string) {
    const res = await a.inject({ method: 'POST', url: '/skills', payload: skillBody(name) });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number; enabled: boolean };
  }

  async function createAgent(a: Awaited<ReturnType<typeof app>>, name: string) {
    const res = await a.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number };
  }

  it('CRUD: create → list → get → delete', async () => {
    const a = await app();
    const created = await createSkill(a, 'crud-skill');
    expect(created).toMatchObject({ version: 1, enabled: true, source: 'manual' });

    const list = (await a.inject({ method: 'GET', url: '/skills' })).json() as { id: string }[];
    expect(list.some((s) => s.id === created.id)).toBe(true);

    const got = await a.inject({ method: 'GET', url: `/skills/${created.id}` });
    expect(got.json().body).toBe('# crud-skill\n\nRule body.');

    expect((await a.inject({ method: 'DELETE', url: `/skills/${created.id}` })).statusCode).toBe(200);
    expect((await a.inject({ method: 'GET', url: `/skills/${created.id}` })).statusCode).toBe(404);
    await a.close();
  });

  it('a body edit creates a new version; metadata and enabled edits do not', async () => {
    const a = await app();
    const { id } = await createSkill(a, 'versioned-skill');
    const put = (payload: object) => a.inject({ method: 'PUT', url: `/skills/${id}`, payload });

    expect((await put({ enabled: false })).json()).toMatchObject({ version: 1, enabled: false });
    expect((await put({ description: 'Use always.' })).json().version).toBe(1);
    expect((await put({ body: 'New body.' })).json()).toMatchObject({ version: 2, body: 'New body.' });
    // Re-saving the same body is not a new version.
    expect((await put({ body: 'New body.' })).json().version).toBe(2);

    const versions = await pg.handle.db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, id));
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);
    await a.close();
  });

  it('rejects an empty name or body with 422', async () => {
    const a = await app();
    const res = await a.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...skillBody('x'), body: '   ' },
    });
    expect(res.statusCode).toBe(422);
    await a.close();
  });

  it('import: preview saves nothing; a confirmed import is stored disabled', async () => {
    const a = await app();
    const zip = zipSync({
      'imported/SKILL.md': strToU8('---\nname: imported-skill\ndescription: Use on tests.\n---\nBody.'),
      'imported/scripts/run.sh': strToU8('#!/bin/sh\necho pwned\n'),
    });
    const before = (await a.inject({ method: 'GET', url: '/skills' })).json().length;

    const preview = await a.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'imported.zip', content_base64: Buffer.from(zip).toString('base64') },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      name: 'imported-skill',
      description: 'Use on tests.',
      body: 'Body.',
      skipped_files: ['imported/scripts/run.sh'],
    });
    expect((await a.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);

    // Confirm: even asking for enabled=true, an imported skill lands disabled.
    const { name, description, type, body } = preview.json();
    const saved = await a.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description, type, body, source: 'imported_file', enabled: true },
    });
    expect(saved.statusCode).toBe(201);
    expect(saved.json()).toMatchObject({ source: 'imported_file', enabled: false });

    const bad = await a.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'run.sh', content_base64: Buffer.from('echo').toString('base64') },
    });
    expect(bad.statusCode).toBe(422);
    await a.close();
  });

  it('agent links keep order and the per-agent enabled flag; changing them versions the agent', async () => {
    const a = await app();
    const agent = await createAgent(a, 'Skill Linker');
    const s1 = await createSkill(a, 'link-one');
    const s2 = await createSkill(a, 'link-two');
    const s3 = await createSkill(a, 'link-three');

    const set = (skills: { skill_id: string; enabled: boolean }[]) =>
      a.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skills } });

    const res = await set([
      { skill_id: s2.id, enabled: true },
      { skill_id: s1.id, enabled: false },
      { skill_id: s3.id, enabled: true },
    ]);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { agent_id: agent.id, skill_id: s2.id, order: 0, enabled: true },
      { agent_id: agent.id, skill_id: s1.id, order: 1, enabled: false },
      { agent_id: agent.id, skill_id: s3.id, order: 2, enabled: true },
    ]);

    // skill_count counts enabled links; the change bumped the agent's version
    // and the snapshot records the enabled skills in prompt order.
    const got = (await a.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(got).toMatchObject({ skill_count: 2, version: 2 });
    const listed = (await a.inject({ method: 'GET', url: '/agents' })).json() as { id: string; skill_count: number }[];
    expect(listed.find((x) => x.id === agent.id)!.skill_count).toBe(2);
    const v2 = (await a.inject({ method: 'GET', url: `/agents/${agent.id}/versions/2` })).json();
    expect(v2.config.skills).toEqual([s2.id, s3.id]);

    // Re-sending the same set is not a new version.
    await set([
      { skill_id: s2.id, enabled: true },
      { skill_id: s1.id, enabled: false },
      { skill_id: s3.id, enabled: true },
    ]);
    expect((await a.inject({ method: 'GET', url: `/agents/${agent.id}` })).json().version).toBe(2);

    // A skill is reusable: the same one links to a second agent independently.
    const other = await createAgent(a, 'Second Linker');
    await a.inject({
      method: 'POST',
      url: `/agents/${other.id}/skills`,
      payload: { skills: [{ skill_id: s2.id, enabled: true }] },
    });
    expect((await a.inject({ method: 'GET', url: `/agents/${other.id}/skills` })).json()).toHaveLength(1);
    expect((await a.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json()).toHaveLength(3);

    // Deleting a skill unlinks it everywhere.
    await a.inject({ method: 'DELETE', url: `/skills/${s2.id}` });
    expect((await a.inject({ method: 'GET', url: `/agents/${other.id}/skills` })).json()).toEqual([]);

    // Duplicates and unknown ids are rejected.
    expect((await set([{ skill_id: s1.id, enabled: true }, { skill_id: s1.id, enabled: true }])).statusCode).toBe(422);
    expect(
      (await set([{ skill_id: '00000000-0000-4000-8000-000000000000', enabled: true }])).statusCode,
    ).toBe(422);
    await a.close();
  });

  it('a skill switched off in the workspace is left out of runs; the agent itself is unchanged', async () => {
    const a = await app();
    const kept = await createSkill(a, 'run-kept');
    const toggled = await createSkill(a, 'run-toggled');
    const agent = await createAgent(a, 'Run Gate');
    const linked = await a.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: kept.id, enabled: true }, { skill_id: toggled.id, enabled: true }] },
    });
    expect(linked.statusCode).toBe(200);
    const repo = new AgentsRepository(pg.handle.db);
    const forRun = async () => (await repo.enabledSkillsForRun(agent.id)).map((sk) => sk.id);
    const agentVersion = async () => (await a.inject({ method: 'GET', url: `/agents/${agent.id}` })).json().version;
    const setEnabled = (enabled: boolean) =>
      a.inject({ method: 'PUT', url: `/skills/${toggled.id}`, payload: { enabled } });

    expect(await forRun()).toEqual([kept.id, toggled.id]);
    const before = await agentVersion();

    expect((await setEnabled(false)).statusCode).toBe(200);
    expect(await forRun()).toEqual([kept.id]);
    // The agent's own selection and config version are untouched.
    expect((await a.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json()).toMatchObject([
      { skill_id: kept.id, enabled: true },
      { skill_id: toggled.id, enabled: true },
    ]);
    expect(await agentVersion()).toBe(before);

    expect((await setEnabled(true)).statusCode).toBe(200);
    expect(await forRun()).toEqual([kept.id, toggled.id]);
    await a.close();
  });

  it('versions carry a message: server defaults, or the caller\'s own', async () => {
    const a = await app();
    const { id } = await createSkill(a, 'messages-skill');
    const put = (payload: object) => a.inject({ method: 'PUT', url: `/skills/${id}`, payload });

    await put({ body: 'Second body.' });
    await put({ body: 'Third body.', message: '  Tighten the wording  ' });
    // A message without a body change creates no version — it has nowhere to go.
    expect((await put({ description: 'Use always.', message: 'ignored' })).json().version).toBe(3);

    const res = await a.inject({ method: 'GET', url: `/skills/${id}/versions` });
    expect(res.statusCode).toBe(200);
    const versions = res.json() as { version: number; created_at: string }[];
    expect(versions).toMatchObject([
      { version: 3, message: 'Tighten the wording', body: 'Third body.', current: true },
      { version: 2, message: 'Updated body', body: 'Second body.', current: false },
      { version: 1, message: 'Initial version', body: '# messages-skill\n\nRule body.', current: false },
    ]);
    expect(Number.isNaN(Date.parse(versions[0]!.created_at))).toBe(false);

    // An import names its source file; a caller-supplied message still wins.
    const imported = async (extra: object) => {
      const skill = (
        await a.inject({
          method: 'POST',
          url: '/skills',
          payload: { ...skillBody('imported-msg'), source: 'imported_file', ...extra },
        })
      ).json();
      return (await a.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json()[0].message;
    };
    expect(await imported({ source_file: 'flaky-tests.zip' })).toBe('Imported from flaky-tests.zip');
    expect(await imported({})).toBe('Imported from file');
    expect(await imported({ source_file: 'x.md', message: 'From the team wiki' })).toBe('From the team wiki');
    await a.close();
  });

  it('restore appends a new version with the old body; history is not rewritten', async () => {
    const a = await app();
    const { id } = await createSkill(a, 'restore-skill');
    await a.inject({ method: 'PUT', url: `/skills/${id}`, payload: { body: 'Second body.' } });

    const restored = await a.inject({ method: 'POST', url: `/skills/${id}/versions/1/restore` });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ id, version: 3, body: '# restore-skill\n\nRule body.' });
    expect(restored.json().body_tokens).toBeGreaterThan(0);

    const versions = (await a.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions).toMatchObject([
      { version: 3, message: 'Restored v1', body: '# restore-skill\n\nRule body.', current: true },
      { version: 2, message: 'Updated body', body: 'Second body.', current: false },
      { version: 1, message: 'Initial version', current: false },
    ]);

    expect((await a.inject({ method: 'POST', url: `/skills/${id}/versions/99/restore` })).statusCode).toBe(404);
    expect((await a.inject({ method: 'POST', url: `/skills/${id}/versions/abc/restore` })).statusCode).toBe(422);
    await a.close();
  });

  it('stats and list usage: pull / accept / categories over 30 days of completed runs', async () => {
    // A workspace of its own, so "all runs in the workspace" is exactly what this test seeds.
    const db = pg.handle.db;
    const [ws] = await db.insert(t.workspaces).values({ name: 'workspace-stats' }).returning();
    const c = await appAs({ id: ws!.id, name: 'workspace-stats' });
    const skill = await createSkill(c, 'stats-skill');
    const idle = await createSkill(c, 'idle-skill');
    const usesIt = await createAgent(c, 'Uses It');
    const off = await createAgent(c, 'Link Off');
    const link = (agentId: string, enabled: boolean) =>
      c.inject({
        method: 'POST',
        url: `/agents/${agentId}/skills`,
        payload: { skills: [{ skill_id: skill.id, enabled }] },
      });
    await link(usesIt.id, true);
    await link(off.id, false);

    const stats = async (id = skill.id) => (await c.inject({ method: 'GET', url: `/skills/${id}/stats` })).json();
    const usage = async () =>
      Object.fromEntries(
        ((await c.inject({ method: 'GET', url: '/skills' })).json() as { id: string; usage: object }[]).map((s) => [
          s.id,
          s.usage,
        ]),
      );

    const agentUsage = async () =>
      Object.fromEntries(
        ((await c.inject({ method: 'GET', url: '/agents' })).json() as { id: string; usage: object }[]).map((ag) => [
          ag.id,
          ag.usage,
        ]),
      );
    expect((await agentUsage())[usesIt.id]).toEqual({ runs: 0, accept_pct: null, avg_cost_usd: null });

    // No runs yet: percentages are null (not 0), but the agent link already counts.
    expect(await stats()).toEqual({
      used_by: 1,
      pull_pct: null,
      accept_pct: null,
      findings_30d: 0,
      agents: [{ id: usesIt.id, name: 'Uses It' }],
      by_category: ['bug', 'security', 'perf', 'style', 'test'].map((category) => ({ category, count: 0 })),
    });
    expect((await usage())[skill.id]).toEqual({ agents: 1, pull_pct: null, accept_pct: null });

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'stats', fullName: 'acme/stats' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws!.id,
        repoId: repo!.id,
        number: 1,
        title: 'Stats PR',
        author: 'someone',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        status: 'needs_review',
      })
      .returning();

    type Outcome = 'accepted' | 'dismissed' | 'open';
    /** Seed one run with its review + findings; `withSkill` records the skill in its prompt. */
    async function seedRun(opts: {
      withSkill: boolean;
      status?: string;
      daysAgo?: number;
      costUsd?: string;
      findings?: [category: string, outcome: Outcome][];
    }) {
      const ranAt = new Date(Date.now() - (opts.daysAgo ?? 1) * 24 * 60 * 60 * 1000);
      const [run] = await db
        .insert(t.agentRuns)
        .values({ workspaceId: ws!.id, agentId: usesIt.id, prId: pr!.id, status: opts.status ?? 'done', ranAt, costUsd: opts.costUsd })
        .returning();
      if (opts.withSkill) {
        await db.insert(t.agentRunSkills).values({
          runId: run!.id,
          skillId: skill.id,
          skillName: 'stats-skill',
          skillVersion: 1,
          tokens: 12,
          order: 0,
        });
      }
      const [review] = await db
        .insert(t.reviews)
        .values({ workspaceId: ws!.id, prId: pr!.id, agentId: usesIt.id, runId: run!.id, kind: 'review' })
        .returning();
      for (const [category, outcome] of opts.findings ?? []) {
        await db.insert(t.findings).values({
          reviewId: review!.id,
          file: 'src/a.ts',
          startLine: 1,
          endLine: 1,
          severity: 'WARNING',
          category,
          title: 't',
          rationale: 'r',
          confidence: 0.9,
          acceptedAt: outcome === 'accepted' ? new Date() : null,
          dismissedAt: outcome === 'dismissed' ? new Date() : null,
        });
      }
    }

    // In the window and completed: 4 runs, 2 of them carrying the skill.
    await seedRun({
      withSkill: true,
      costUsd: '0.04',
      findings: [['bug', 'accepted'], ['bug', 'dismissed'], ['security', 'accepted']],
    });
    await seedRun({ withSkill: true, costUsd: '0.06', findings: [['test', 'open']] });
    await seedRun({ withSkill: false, findings: [['style', 'accepted']] });
    await seedRun({ withSkill: false });
    // Not counted anywhere: a failed run, and a completed one older than 30 days.
    await seedRun({ withSkill: true, status: 'failed', costUsd: '9', findings: [['perf', 'dismissed']] });
    await seedRun({ withSkill: true, daysAgo: 45, costUsd: '9', findings: [['perf', 'dismissed']] });

    // Agent cards: the same window, per agent. 4 runs; 3 accepted / (3 + 1
    // dismissed); the average is over the two runs that carry a cost.
    const perAgent = await agentUsage();
    expect(perAgent[usesIt.id]).toEqual({ runs: 4, accept_pct: 75, avg_cost_usd: 0.05 });
    expect(perAgent[off.id]).toEqual({ runs: 0, accept_pct: null, avg_cost_usd: null });

    expect(await stats()).toEqual({
      used_by: 1,
      pull_pct: 50, // 2 of 4 runs
      accept_pct: 67, // 2 accepted / (2 accepted + 1 dismissed); the open finding is neither
      findings_30d: 4,
      agents: [{ id: usesIt.id, name: 'Uses It' }],
      by_category: [
        { category: 'bug', count: 2 },
        { category: 'security', count: 1 },
        { category: 'perf', count: 0 },
        { category: 'style', count: 0 },
        { category: 'test', count: 1 },
      ],
    });

    // The list carries the same roll-up per skill; a skill no run carried pulls 0%.
    const listed = await usage();
    expect(listed[skill.id]).toEqual({ agents: 1, pull_pct: 50, accept_pct: 67 });
    expect(listed[idle.id]).toEqual({ agents: 0, pull_pct: 0, accept_pct: null });
    expect(await stats(idle.id)).toMatchObject({ used_by: 0, pull_pct: 0, accept_pct: null, findings_30d: 0 });

    // GET /skills/:id carries the exact token count but no usage.
    const one = (await c.inject({ method: 'GET', url: `/skills/${skill.id}` })).json();
    expect(one.body_tokens).toBeGreaterThan(0);
    expect(one.usage).toBeUndefined();
    await c.close();
  });

  it('versions, restore and stats are workspace-scoped: another workspace gets 404', async () => {
    const a = await app();
    const b = await appAsB();
    const skill = await createSkill(a, 'history-private-to-a');

    expect((await b.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).statusCode).toBe(404);
    expect((await b.inject({ method: 'POST', url: `/skills/${skill.id}/versions/1/restore` })).statusCode).toBe(404);
    expect((await b.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).statusCode).toBe(404);

    // Nothing was restored on A's skill by B's attempt.
    expect((await a.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json()).toHaveLength(1);
    await a.close();
    await b.close();
  });

  it('skills are workspace-scoped: another workspace cannot read, edit, delete or link them', async () => {
    const a = await app();
    const b = await appAsB();
    const skill = await createSkill(a, 'private-to-a');

    expect((await b.inject({ method: 'GET', url: '/skills' })).json()).toEqual([]);
    expect((await b.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    expect(
      (await b.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'hijacked' } })).statusCode,
    ).toBe(404);
    expect((await b.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(404);

    const agentB = await createAgent(b, 'B Agent');
    const link = await b.inject({
      method: 'POST',
      url: `/agents/${agentB.id}/skills`,
      payload: { skills: [{ skill_id: skill.id, enabled: true }] },
    });
    expect(link.statusCode).toBe(422);

    expect((await a.inject({ method: 'GET', url: `/skills/${skill.id}` })).json().body).toContain('Rule body.');
    await a.close();
    await b.close();
  });
});
