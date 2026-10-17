import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SmartDiff } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let seq = 0;

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    app = await buildApp({ config: config(), db: pg.handle.db });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function seedPr(files: { path: string; additions: number; deletions: number }[]) {
    const db = pg.handle.db;
    const n = seq++;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `smart-${n}`, fullName: `acme/smart-${n}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: n + 1,
        title: 'Smart diff PR',
        author: 'alice',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        additions: 0,
        deletions: 0,
        filesCount: files.length,
        status: 'needs_review',
      })
      .returning();
    for (const f of files) await db.insert(t.prFiles).values({ prId: pr!.id, ...f });
    return pr!;
  }

  async function seedAgent(name: string) {
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'review' })
      .returning();
    return agent!;
  }

  async function seedReview(
    prId: string,
    agentId: string,
    createdAt: Date,
    lines: { file: string; line: number }[],
  ) {
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, agentId, kind: 'review', createdAt })
      .returning();
    for (const l of lines) {
      await pg.handle.db.insert(t.findings).values({
        reviewId: review!.id,
        file: l.file,
        startLine: l.line,
        endLine: l.line,
        severity: 'WARNING',
        category: 'bug',
        title: 'Finding',
        rationale: 'because',
        confidence: 0.8,
      });
    }
  }

  const get = async (id: string) => app.inject({ method: 'GET', url: `/pulls/${id}/smart-diff` });

  it('groups files by role in fixed order, omits empty groups and keeps file order inside a group', async () => {
    const pr = await seedPr([
      { path: 'package-lock.json', additions: 10, deletions: 2 },
      { path: 'README.md', additions: 1, deletions: 1 },
      { path: 'src/b.ts', additions: 4, deletions: 0 },
      { path: 'tsconfig.json', additions: 1, deletions: 0 },
      { path: 'src/a.test.ts', additions: 3, deletions: 0 },
      { path: 'src/a.ts', additions: 5, deletions: 1 },
    ]);

    const res = await get(pr.id);
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());
    expect(body.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(body.groups[0]!.files.map((f) => f.path)).toEqual(['src/b.ts', 'src/a.ts']);

    const small = await seedPr([{ path: 'src/only.ts', additions: 1, deletions: 0 }]);
    const smallBody = SmartDiff.parse((await get(small.id)).json());
    expect(smallBody.groups.map((g) => g.role)).toEqual(['core']);
  });

  it('uses only the newest review per agent for finding_lines, deduped and sorted', async () => {
    const pr = await seedPr([
      { path: 'src/a.ts', additions: 5, deletions: 0 },
      { path: 'src/b.ts', additions: 2, deletions: 0 },
    ]);
    const agentA = await seedAgent('agent-a');
    const agentB = await seedAgent('agent-b');
    await seedReview(pr.id, agentA.id, new Date('2026-01-01T00:00:00Z'), [{ file: 'src/a.ts', line: 3 }]);
    await seedReview(pr.id, agentA.id, new Date('2026-01-02T00:00:00Z'), [
      { file: 'src/a.ts', line: 7 },
      { file: 'src/a.ts', line: 7 },
      { file: 'src/a.ts', line: 5 },
    ]);
    await seedReview(pr.id, agentB.id, new Date('2025-12-01T00:00:00Z'), [
      { file: 'src/a.ts', line: 5 },
      { file: 'src/b.ts', line: 1 },
    ]);

    const res = await get(pr.id);
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());
    const byPath = Object.fromEntries(body.groups.flatMap((g) => g.files).map((f) => [f.path, f.finding_lines]));
    // the old agent-a review (line 3) is ignored; 7 appears once; sorted ascending
    expect(byPath['src/a.ts']).toEqual([5, 7]);
    expect(byPath['src/b.ts']).toEqual([1]);
  });

  it('returns groups with empty finding_lines and a neutral split suggestion before any review', async () => {
    const pr = await seedPr([
      { path: 'src/a.ts', additions: 5, deletions: 2 },
      { path: 'docs/guide.md', additions: 3, deletions: 0 },
    ]);

    const res = await get(pr.id);
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());
    expect(body.groups.map((g) => g.role)).toEqual(['core', 'docs']);
    for (const f of body.groups.flatMap((g) => g.files)) expect(f.finding_lines).toEqual([]);
    expect(body.split_suggestion).toEqual({ too_big: false, total_lines: 10, proposed_splits: [] });
  });

  it('returns 404 for an unknown PR id', async () => {
    const res = await get('00000000-0000-4000-8000-000000000000');
    expect(res.statusCode).toBe(404);
  });
});
