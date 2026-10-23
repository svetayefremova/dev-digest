import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context] Docker not available — skipping integration tests.');
}

const baseEnv = () => ({ ...process.env, NODE_ENV: 'test' }) as NodeJS.ProcessEnv;
const config = (extra: Record<string, string> = {}) => loadConfig({ ...baseEnv(), ...extra });

/** Words-as-tokens counter: expected token counts come from the fixture text itself. */
const wordTokenizer = { count: (s: string) => s.split(/\s+/).filter(Boolean).length };

type ContextList = {
  cloned: boolean;
  docs: {
    path: string;
    category: string;
    tokens: number | null;
    size: number;
    previewable: boolean;
    used_by_agents: number;
  }[];
  truncated: boolean;
  total_tokens: number;
  scanned_at: string;
  search_roots?: string[];
};

d('SPEC-01 project context API (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceAId: string;
  let workspaceBId: string;
  let user: { id: string; email: string; name: string };
  const dirs: string[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceAId = ws!.id;
    const [seeded] = await pg.handle.db.select().from(t.users);
    user = { id: seeded!.id, email: seeded!.email, name: seeded!.name ?? 'You' };
    const [wsB] = await pg.handle.db.insert(t.workspaces).values({ name: 'ctx-workspace-b' }).returning();
    workspaceBId = wsB!.id;
  });
  afterAll(async () => {
    await pg?.stop();
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  const app = (extra: Record<string, string> = {}) =>
    buildApp({ config: config(extra), db: pg.handle.db, overrides: { tokenizer: wordTokenizer } });
  const appAsB = () =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        tokenizer: wordTokenizer,
        auth: new MockAuthProvider(user, { id: workspaceBId, name: 'ctx-workspace-b' }),
      },
    });

  function makeCheckout(files: Record<string, string | Buffer>): string {
    const root = mkdtempSync(join(tmpdir(), 'devdigest-ctx-'));
    dirs.push(root);
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, body);
    }
    return root;
  }

  let repoSeq = 0;
  async function createRepo(clonePath: string | null) {
    const name = `ctx-repo-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: workspaceAId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!;
  }

  async function createAgent(a: Awaited<ReturnType<typeof app>>, name: string) {
    const res = await a.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  async function createSkill(a: Awaited<ReturnType<typeof app>>, name: string) {
    const res = await a.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: `Use when ${name}.`, type: 'rubric', body: `Body of ${name}.` },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  const list = async (a: Awaited<ReturnType<typeof app>>, repoId: string) => {
    const res = await a.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    expect(res.statusCode).toBe(200);
    return res.json() as ContextList;
  };

  it('SPEC-01 AC-1 / AC-2 / AC-3: lists only specs|docs|insights markdown at any depth, sorted, with category and tokenizer counts', async () => {
    const root = makeCheckout({
      'specs/a.md': 'one two three',
      'docs/b.md': 'alpha beta',
      'server/docs/x.md': 'nested docs file here now',
      'insights/perf.md': 'fast',
      'docs/specs/deep.md': 'a b c d e f',
      'README.md': 'root readme must not be listed',
      'specs/c.txt': 'not markdown',
      'node_modules/docs/y.md': 'excluded',
      'vendor/docs/z.md': 'excluded',
      'server/node_modules/pkg/docs/w.md': 'excluded deep',
      '.git/docs/g.md': 'excluded',
    });
    const repo = await createRepo(root);
    const a = await app();

    const res = await list(a, repo.id);

    expect(res.cloned).toBe(true);
    expect(res.docs.map((x) => x.path)).toEqual([
      'docs/b.md',
      'docs/specs/deep.md',
      'insights/perf.md',
      'server/docs/x.md',
      'specs/a.md',
    ]);
    const byPath = Object.fromEntries(res.docs.map((x) => [x.path, x]));
    expect(byPath['specs/a.md']!.category).toBe('specs');
    expect(byPath['docs/b.md']!.category).toBe('docs');
    expect(byPath['insights/perf.md']!.category).toBe('insights');
    expect(byPath['server/docs/x.md']!.category).toBe('docs');
    // nearest matching folder wins
    expect(byPath['docs/specs/deep.md']!.category).toBe('specs');
    expect(byPath['specs/a.md']!.tokens).toBe(3);
    expect(byPath['docs/b.md']!.tokens).toBe(2);
    expect(byPath['server/docs/x.md']!.tokens).toBe(5);
    expect(res.total_tokens).toBe(3 + 2 + 5 + 1 + 6);
    expect(res.truncated).toBe(false);
    expect(res.search_roots).toEqual(expect.arrayContaining(['specs', 'docs', 'insights']));
    await a.close();
  });

  it('SPEC-01 AC-47: configured search globs replace the default; a match outside specs/docs/insights is category other', async () => {
    const root = makeCheckout({
      'notes/n.md': 'note text',
      'a/notes/deep.md': 'deep note',
      'specs/a.md': 'spec text',
      'docs/b.md': 'doc text',
    });
    const repo = await createRepo(root);
    const custom = await app({ CONTEXT_SEARCH_GLOBS: '**/notes/**/*.md' });

    const res = await list(custom, repo.id);

    expect(res.docs.map((x) => x.path)).toEqual(['a/notes/deep.md', 'notes/n.md']);
    expect(res.docs.every((x) => x.category === 'other')).toBe(true);
    await custom.close();

    // without configuration the default applies
    const plain = await app();
    expect((await list(plain, repo.id)).docs.map((x) => x.path)).toEqual(['docs/b.md', 'specs/a.md']);
    await plain.close();
  });

  it('SPEC-01 AC-11: a repo without a local checkout answers cloned:false with no docs', async () => {
    const a = await app();
    const noPath = await createRepo(null);
    const missingDir = await createRepo(join(tmpdir(), 'devdigest-ctx-does-not-exist-xyz'));

    for (const repo of [noPath, missingDir]) {
      const res = await list(a, repo.id);
      expect(res.cloned).toBe(false);
      expect(res.docs).toEqual([]);
    }
    await a.close();
  });

  it('SPEC-01 AC-12 / AC-14: every list request re-scans the disk (new file, new total)', async () => {
    const root = makeCheckout({ 'docs/a.md': 'one two' });
    const repo = await createRepo(root);
    const a = await app();

    const first = await list(a, repo.id);
    expect(first.docs.map((x) => x.path)).toEqual(['docs/a.md']);
    expect(first.total_tokens).toBe(2);

    writeFileSync(join(root, 'docs', 'new.md'), 'three four five');
    const second = await list(a, repo.id);

    expect(second.docs.map((x) => x.path)).toEqual(['docs/a.md', 'docs/new.md']);
    expect(second.total_tokens).toBe(5);
    expect(second.scanned_at >= first.scanned_at).toBe(true);
    await a.close();
  });

  it('SPEC-01 AC-16: a 300 KB file and a non-UTF-8 file are listed but not previewable', async () => {
    const root = makeCheckout({
      'docs/ok.md': '# Fine\n\ntext',
      'docs/big.md': 'word '.repeat(60_000),
      'docs/bin.md': Buffer.from([0xff, 0xfe, 0xfd, 0x80, 0x81, 0xc3, 0x28]),
    });
    const repo = await createRepo(root);
    const a = await app();

    const res = await list(a, repo.id);
    const byPath = Object.fromEntries(res.docs.map((x) => [x.path, x]));
    expect(Object.keys(byPath).sort()).toEqual(['docs/big.md', 'docs/bin.md', 'docs/ok.md']);
    expect(byPath['docs/ok.md']!.previewable).toBe(true);
    expect(byPath['docs/big.md']).toMatchObject({ previewable: false, tokens: null });
    expect(byPath['docs/bin.md']).toMatchObject({ previewable: false, tokens: null });

    const file = (path: string) =>
      a.inject({ method: 'GET', url: `/repos/${repo.id}/context/file?path=${encodeURIComponent(path)}` });
    const ok = await file('docs/ok.md');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ path: 'docs/ok.md', content: '# Fine\n\ntext', reason: null });
    const big = await file('docs/big.md');
    expect(big.statusCode).toBe(200);
    expect(big.json()).toMatchObject({ content: null, reason: 'too_large' });
    const bin = await file('docs/bin.md');
    expect(bin.statusCode).toBe(200);
    expect(bin.json()).toMatchObject({ content: null, reason: 'unreadable' });
    await a.close();
  });

  it('SPEC-01 AC-17: more than 500 markdown files → first 500 by path and truncated', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 600; i++) files[`docs/f${String(i).padStart(3, '0')}.md`] = `file ${i}`;
    const repo = await createRepo(makeCheckout(files));
    const a = await app();

    const res = await list(a, repo.id);

    expect(res.docs).toHaveLength(500);
    expect(res.truncated).toBe(true);
    expect(res.docs[0]!.path).toBe('docs/f000.md');
    expect(res.docs[499]!.path).toBe('docs/f499.md');
    await a.close();
  });

  it('SPEC-01 AC-18: traversal, absolute paths and symlinks leaving the checkout return an error and no content', async () => {
    const outside = makeCheckout({ 'secret.md': 'TOP-SECRET-SENTINEL' });
    const root = makeCheckout({ 'docs/ok.md': 'fine content' });
    symlinkSync(join(outside, 'secret.md'), join(root, 'docs', 'out.md'));
    symlinkSync(outside, join(root, 'docs', 'linkdir'));
    const repo = await createRepo(root);
    const a = await app();
    const file = (path: string) =>
      a.inject({ method: 'GET', url: `/repos/${repo.id}/context/file?path=${encodeURIComponent(path)}` });

    // setup: a legitimate read works
    const ok = await file('docs/ok.md');
    expect(ok.statusCode).toBe(200);
    expect(ok.json().content).toBe('fine content');

    for (const bad of [
      '../../etc/passwd',
      `../${outside.split('/').pop()}/secret.md`,
      join(outside, 'secret.md'),
      'docs/out.md',
      'docs/linkdir/secret.md',
    ]) {
      const res = await file(bad);
      expect(res.statusCode, bad).toBeGreaterThanOrEqual(400);
      expect(res.statusCode, bad).toBeLessThan(500);
      expect(res.body, bad).not.toContain('TOP-SECRET-SENTINEL');
    }
    await a.close();
  });

  it('SPEC-01 AC-19: another workspace gets 404 for the list, the file and the attachments of a foreign agent or skill', async () => {
    const root = makeCheckout({ 'docs/a.md': 'text' });
    const repo = await createRepo(root);
    const a = await app();
    const agent = await createAgent(a, 'iso-agent');
    const skill = await createSkill(a, 'iso-skill');
    expect((await list(a, repo.id)).docs).toHaveLength(1);
    expect(
      (await a.inject({ method: 'PUT', url: `/agents/${agent.id}/context`, payload: { paths: ['docs/a.md'] } })).statusCode,
    ).toBe(200);

    const b = await appAsB();
    const checks: [string, string, object | undefined][] = [
      ['GET', `/repos/${repo.id}/context`, undefined],
      ['GET', `/repos/${repo.id}/context/file?path=docs%2Fa.md`, undefined],
      ['GET', `/agents/${agent.id}/context`, undefined],
      ['PUT', `/agents/${agent.id}/context`, { paths: [] }],
      ['GET', `/skills/${skill.id}/context`, undefined],
      ['PUT', `/skills/${skill.id}/context`, { paths: [] }],
    ];
    for (const [method, url, payload] of checks) {
      const res = await b.inject({ method: method as 'GET' | 'PUT', url, payload });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    // the foreign attachment was not touched by B's PUT
    const still = await a.inject({ method: 'GET', url: `/agents/${agent.id}/context` });
    expect(still.json().map((x: { path: string }) => x.path)).toEqual(['docs/a.md']);
    await a.close();
    await b.close();
  });

  it('SPEC-01 AC-22: PUT replaces the agent attachment list and GET returns it', async () => {
    const a = await app();
    const agent = await createAgent(a, 'attach-agent');
    const put = (paths: string[]) =>
      a.inject({ method: 'PUT', url: `/agents/${agent.id}/context`, payload: { paths } });
    const get = async () =>
      (await a.inject({ method: 'GET', url: `/agents/${agent.id}/context` })).json() as { path: string }[];

    expect(await get()).toEqual([]);
    expect((await put(['docs/a.md', 'docs/b.md'])).statusCode).toBe(200);
    expect((await get()).map((x) => x.path)).toEqual(['docs/a.md', 'docs/b.md']);
    expect((await put(['docs/a.md'])).statusCode).toBe(200);
    expect((await get()).map((x) => x.path)).toEqual(['docs/a.md']);
    await a.close();
  });

  it('SPEC-01 AC-23: a reordered list is persisted in the new order, for agents and skills; bad paths are rejected', async () => {
    const a = await app();
    const skill = await createSkill(a, 'order-skill');
    const agent = await createAgent(a, 'order-agent');
    const putSkill = (paths: string[]) =>
      a.inject({ method: 'PUT', url: `/skills/${skill.id}/context`, payload: { paths } });

    const first = await putSkill(['docs/a.md', 'docs/b.md']);
    expect(first.statusCode).toBe(200);
    const swapped = await putSkill(['docs/b.md', 'docs/a.md']);
    expect(swapped.statusCode).toBe(200);

    // "reload": a brand-new app instance reads the persisted order
    const fresh = await app();
    const got = (await fresh.inject({ method: 'GET', url: `/skills/${skill.id}/context` })).json() as {
      path: string;
      order: number;
    }[];
    expect(got.map((x) => x.path)).toEqual(['docs/b.md', 'docs/a.md']);
    expect(got.map((x) => x.order)).toEqual([0, 1]);

    expect((await putSkill(['../x.md'])).statusCode).toBe(422);
    expect((await putSkill(['docs/a.md', 'docs/a.md'])).statusCode).toBe(422);
    const putAgent = await a.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context`,
      payload: { paths: ['docs/y.md', 'docs/x.md'] },
    });
    expect(putAgent.json().map((x: { path: string }) => x.path)).toEqual(['docs/y.md', 'docs/x.md']);
    // rejected writes left the stored order untouched
    const after = (await fresh.inject({ method: 'GET', url: `/skills/${skill.id}/context` })).json();
    expect(after.map((x: { path: string }) => x.path)).toEqual(['docs/b.md', 'docs/a.md']);
    await a.close();
    await fresh.close();
  });

  it('SPEC-01 AC-48: an attachment stores only the repo-relative path, never document text', async () => {
    const root = makeCheckout({ 'docs/a.md': 'UNIQUE-BODY-TEXT-123' });
    await createRepo(root);
    const a = await app();
    const agent = await createAgent(a, 'path-only-agent');

    const put = await a.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context`,
      payload: { paths: ['docs/a.md'] },
    });

    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual([{ path: 'docs/a.md', order: 0 }]);
    const rows = await pg.handle.db.select().from(t.agentContextDocs);
    const mine = rows.filter((r) => r.agentId === agent.id);
    expect(mine).toHaveLength(1);
    expect(JSON.stringify(mine[0])).not.toContain('UNIQUE-BODY-TEXT-123');
    await a.close();
  });

  it('SPEC-01 AC-31: attaching a document that is not on disk is accepted and stays attached, but is absent from the list', async () => {
    const root = makeCheckout({ 'docs/here.md': 'present' });
    const repo = await createRepo(root);
    const a = await app();
    const agent = await createAgent(a, 'missing-agent');

    const put = await a.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context`,
      payload: { paths: ['docs/here.md', 'docs/gone.md'] },
    });

    expect(put.statusCode).toBe(200);
    const attached = (await a.inject({ method: 'GET', url: `/agents/${agent.id}/context` })).json();
    expect(attached.map((x: { path: string }) => x.path)).toEqual(['docs/here.md', 'docs/gone.md']);
    expect((await list(a, repo.id)).docs.map((x) => x.path)).toEqual(['docs/here.md']);
    await a.close();
  });

  it('SPEC-01 AC-6 / Q10: used_by_agents counts distinct agents that receive the doc directly or through an enabled skill', async () => {
    const root = makeCheckout({ 'docs/shared.md': 'shared text', 'docs/solo.md': 'solo text' });
    const repo = await createRepo(root);
    const a = await app();
    const agentA = await createAgent(a, 'used-a');
    const agentB = await createAgent(a, 'used-b');
    const agentC = await createAgent(a, 'used-c');
    const skill = await createSkill(a, 'used-skill');
    const put = (url: string, payload: object) => a.inject({ method: 'PUT', url, payload });
    const post = (url: string, payload: object) => a.inject({ method: 'POST', url, payload });

    expect((await put(`/agents/${agentA.id}/context`, { paths: ['docs/shared.md'] })).statusCode).toBe(200);
    expect((await put(`/skills/${skill.id}/context`, { paths: ['docs/shared.md'] })).statusCode).toBe(200);
    // A's own attachment plus the skill is still ONE agent; B enabled, C disabled.
    expect(
      (await post(`/agents/${agentA.id}/skills`, { skills: [{ skill_id: skill.id, enabled: true }] })).statusCode,
    ).toBe(200);
    expect(
      (await post(`/agents/${agentB.id}/skills`, { skills: [{ skill_id: skill.id, enabled: true }] })).statusCode,
    ).toBe(200);
    expect(
      (await post(`/agents/${agentC.id}/skills`, { skills: [{ skill_id: skill.id, enabled: false }] })).statusCode,
    ).toBe(200);

    const res = await list(a, repo.id);
    const byPath = Object.fromEntries(res.docs.map((x) => [x.path, x]));
    // 'docs/shared.md' is unique to this test: A (direct + via skill, counted once) and B.
    expect(byPath['docs/shared.md']!.used_by_agents).toBe(2);
    expect(byPath['docs/solo.md']!.used_by_agents).toBe(0);

    // disabling the link for B leaves only A
    expect(
      (await post(`/agents/${agentB.id}/skills`, { skills: [{ skill_id: skill.id, enabled: false }] })).statusCode,
    ).toBe(200);
    const after = (await list(a, repo.id)).docs.find((x) => x.path === 'docs/shared.md')!;
    expect(after.used_by_agents).toBe(1);
    await a.close();
  });
});
