import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockAuthProvider, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const USERS_TS = [
  "import { db } from './db';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  return user;',
  '}',
].join('\n');
const REDIS_TS = "import Redis from 'ioredis';\n\nexport const redis = new Redis(config.redisUrl);\n";

const FILES = {
  'tsconfig.json': '{ "compilerOptions": { "strict": true } }',
  'src/api/users.ts': USERS_TS,
  'src/lib/redis.ts': REDIS_TS,
};

const candidate = (rule: string, file: string, line: number, quote: string, confidence: number) => ({
  category: 'general',
  rule,
  evidence: { file, line, end_line: null, quote },
  confidence,
});

const ASYNC = candidate('Always use async/await.', 'src/api/users.ts', 4, 'const user = await db.users.find(id);', 0.91);
const REDIS = candidate(
  'Redis access goes through the singleton.',
  'src/lib/redis.ts',
  3,
  'export const redis = new Redis(config.redisUrl);',
  0.85,
);
const EXTRACTION = {
  candidates: [
    ASYNC,
    REDIS,
    candidate('Ghost file rule.', 'src/ghost.ts', 1, 'const x = 1;', 0.99),
    candidate('Line out of range.', 'src/lib/redis.ts', 400, 'export const redis', 0.99),
    candidate('Invented code.', 'src/api/users.ts', 4, 'return fetchUser(id).then(render);', 0.99),
  ],
};

type Candidate = { id: string; rule: string; status: string; evidence_snippet: string; evidence_line: number };
type Scan = { sample_files: number; scanned_at: string | null; candidates: Candidate[] };

/**
 * Conventions module: a scan samples in code and makes one model call, keeps
 * only candidates whose evidence is in the files, and persists them; accept /
 * reject / edit; rejected rules never come back; the accepted ones become one
 * skill linked to agents; tenant isolation.
 */
d('conventions (Testcontainers pg)', () => {
  let pg: PgFixture;
  let cloneDir: string;
  let repoId: string;
  let workspaceBId: string;
  let user: { id: string; email: string; name: string };
  let llm: MockLLMProvider;
  let sampleCalls: number[];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [seeded] = await pg.handle.db.select().from(t.users);
    user = { id: seeded!.id, email: seeded!.email, name: seeded!.name ?? 'You' };
    // A real clone on disk: the scan reads sampled files from the repo's clonePath.
    cloneDir = await mkdtemp(join(tmpdir(), 'conventions-'));
    for (const [path, content] of Object.entries(FILES)) {
      await mkdir(dirname(join(cloneDir, path)), { recursive: true });
      await writeFile(join(cloneDir, path), content);
    }
    const [repo] = await pg.handle.db
      .update(t.repos)
      .set({ clonePath: cloneDir })
      .where(eq(t.repos.fullName, 'acme/payments-api'))
      .returning();
    repoId = repo!.id;
    const [wsB] = await pg.handle.db.insert(t.workspaces).values({ name: 'workspace-b' }).returning();
    workspaceBId = wsB!.id;
  });
  afterAll(async () => {
    await pg?.stop();
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await pg.handle.db.delete(t.conventions);
    await pg.handle.db.delete(t.conventionScans);
    llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: EXTRACTION } });
    sampleCalls = [];
  });

  const overrides = () => ({
    llm: { openai: llm, openrouter: llm, anthropic: llm },
    repoIntel: {
      getConventionSamples: async (_repoId: string, n: number) => {
        sampleCalls.push(n);
        return ['src/api/users.ts', 'src/lib/redis.ts'];
      },
    } as unknown as RepoIntel,
  });
  const app = () => buildApp({ config: config(), db: pg.handle.db, overrides: overrides() });
  const appAsB = () =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { ...overrides(), auth: new MockAuthProvider(user, { id: workspaceBId, name: 'workspace-b' }) },
    });
  type App = Awaited<ReturnType<typeof app>>;

  const extract = async (a: App) => {
    const res = await a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    return res.json() as Scan;
  };
  const list = async (a: App) =>
    (await a.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json() as Scan;
  const update = (a: App, id: string, payload: object) =>
    a.inject({ method: 'PUT', url: `/conventions/${id}`, payload });

  async function createAgent(a: App, name: string) {
    const res = await a.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number };
  }

  it('before any scan: no candidates and no scan date', async () => {
    const a = await app();
    expect(await list(a)).toMatchObject({ sample_files: 0, scanned_at: null, candidates: [] });
    await a.close();
  });

  it('extract: samples in code, calls the model once, keeps only evidenced candidates, persists', async () => {
    const a = await app();
    const scan = await extract(a);

    // Sampling asked repo-intel for the top 12 and used no model call.
    expect(sampleCalls).toEqual([12]);
    expect(llm.calls.map((c) => c.method)).toEqual(['completeStructured']);
    const prompt = JSON.stringify(llm.calls[0]!.req);
    expect(prompt).toContain('tsconfig.json');
    expect(prompt).toContain('src/lib/redis.ts');

    // The three candidates without real evidence are gone; strongest first.
    expect(scan.candidates.map((c) => c.rule)).toEqual([ASYNC.rule, REDIS.rule]);
    expect(scan.candidates[0]).toMatchObject({
      status: 'pending',
      evidence_line: 4,
      evidence_snippet: 'const user = await db.users.find(id);',
    });
    expect(scan.sample_files).toBe(3);
    expect(scan.scanned_at).not.toBeNull();
    await a.close();

    // A fresh app instance reads the same result back from Postgres.
    const b = await app();
    expect((await list(b)).candidates).toHaveLength(2);
    await b.close();
  });

  it('extract: 422 for a repo that is not cloned, 404 for an unknown repo', async () => {
    const a = await app();
    const [bare] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: (await pg.handle.db.select().from(t.repos))[0]!.workspaceId, owner: 'acme', name: 'bare', fullName: 'acme/bare' })
      .returning();
    expect((await a.inject({ method: 'POST', url: `/repos/${bare!.id}/conventions/extract` })).statusCode).toBe(422);
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect((await a.inject({ method: 'POST', url: `/repos/${unknown}/conventions/extract` })).statusCode).toBe(404);
    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, bare!.id));
    await a.close();
  });

  it('accept, edit and reject; a rejected rule stays gone after a re-scan', async () => {
    const a = await app();
    const [first, second] = (await extract(a)).candidates;

    expect((await update(a, first!.id, { status: 'accepted' })).json()).toMatchObject({ status: 'accepted' });
    expect((await update(a, first!.id, { rule: 'Prefer async/await.', category: 'structure' })).json()).toMatchObject({
      rule: 'Prefer async/await.',
      category: 'structure',
      status: 'accepted',
    });
    expect((await update(a, second!.id, { status: 'rejected' })).statusCode).toBe(200);
    expect((await list(a)).candidates.map((c) => c.id)).toEqual([first!.id]);

    // Re-scan: the model proposes both rules again. The rejected one does not
    // return, and the accepted (edited) one is kept rather than duplicated.
    const rescan = await extract(a);
    expect(rescan.candidates).toHaveLength(1);
    expect(rescan.candidates[0]).toMatchObject({ id: first!.id, rule: 'Prefer async/await.', status: 'accepted' });
    await a.close();
  });

  it('select all / deselect all leaves rejected candidates rejected', async () => {
    const a = await app();
    const [first, second] = (await extract(a)).candidates;
    await update(a, second!.id, { status: 'rejected' });
    const setAll = (status: string) =>
      a.inject({ method: 'PUT', url: `/repos/${repoId}/conventions/status`, payload: { status } });

    expect((await setAll('accepted')).json().candidates).toMatchObject([{ id: first!.id, status: 'accepted' }]);
    expect((await setAll('pending')).json().candidates).toMatchObject([{ id: first!.id, status: 'pending' }]);
    const [rejected] = await pg.handle.db.select().from(t.conventions).where(eq(t.conventions.id, second!.id));
    expect(rejected!.status).toBe('rejected');
    expect((await setAll('rejected')).statusCode).toBe(422);
    await a.close();
  });

  it('accepted candidates → one repo-conventions skill linked to the chosen agent', async () => {
    const a = await app();
    const [first, second] = (await extract(a)).candidates;
    const draftUrl = `/repos/${repoId}/conventions/skill-draft`;
    const skillUrl = `/repos/${repoId}/conventions/skill`;

    // Nothing accepted yet → no draft, no skill.
    expect((await a.inject({ method: 'GET', url: draftUrl })).statusCode).toBe(422);

    await update(a, first!.id, { status: 'accepted' });
    await update(a, second!.id, { status: 'rejected' });
    const draft = (await a.inject({ method: 'GET', url: draftUrl })).json();
    expect(draft).toMatchObject({ name: 'repo-conventions', type: 'convention', conventions: 1 });
    expect(draft.body).toContain(ASYNC.rule);
    expect(draft.body).not.toContain(REDIS.rule);
    expect(draft.body_tokens).toBeGreaterThan(0);

    const agent = await createAgent(a, 'conventions-agent');
    const payload = { name: draft.name, description: draft.description, type: draft.type, body: `${draft.body}\n\nEdited.` };

    // An agent is required, and it must exist in the workspace.
    expect((await a.inject({ method: 'POST', url: skillUrl, payload: { ...payload, agent_ids: [] } })).statusCode).toBe(422);
    const ghost = '00000000-0000-4000-8000-000000000000';
    expect((await a.inject({ method: 'POST', url: skillUrl, payload: { ...payload, agent_ids: [ghost] } })).statusCode).toBe(422);
    expect(await pg.handle.db.select().from(t.skills).where(eq(t.skills.name, 'repo-conventions'))).toHaveLength(0);

    const res = await a.inject({ method: 'POST', url: skillUrl, payload: { ...payload, agent_ids: [agent.id] } });
    expect(res.statusCode).toBe(201);
    const created = res.json() as { skill_id: string; agent_ids: string[] };
    expect(created.agent_ids).toEqual([agent.id]);

    const [skill] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, created.skill_id));
    expect(skill).toMatchObject({
      name: 'repo-conventions',
      type: 'convention',
      source: 'extracted',
      enabled: true,
      version: 1,
      evidenceFiles: ['src/api/users.ts'],
    });
    expect(skill!.body).toContain('Edited.');

    const links = (await a.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    expect(links).toMatchObject([{ skill_id: created.skill_id, enabled: true }]);
    const [agentRow] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, agent.id));
    expect(agentRow!.version).toBe(agent.version + 1);

    // Listed with every other skill.
    const skills = (await a.inject({ method: 'GET', url: '/skills' })).json() as { id: string }[];
    expect(skills.some((s) => s.id === created.skill_id)).toBe(true);
    await a.close();
  });

  it('is workspace-scoped', async () => {
    const a = await app();
    const [first] = (await extract(a)).candidates;
    const b = await appAsB();
    expect((await b.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).statusCode).toBe(404);
    expect((await b.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })).statusCode).toBe(404);
    expect((await update(b, first!.id, { status: 'rejected' })).statusCode).toBe(404);
    expect((await list(a)).candidates).toHaveLength(2);
    await a.close();
    await b.close();
  });
});
