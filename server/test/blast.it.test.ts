import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { BlastRadiusResponse } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceAId: string;
  let workspaceBId: string;
  let repoId: string;
  let prId: string;
  const getBlastRadius = vi.fn();

  beforeAll(async () => {
    pg = await startPg();
    const { workspaceId } = await seed(pg.handle.db);
    workspaceAId = workspaceId;
    const [wsB] = await pg.handle.db.insert(t.workspaces).values({ name: 'workspace-b' }).returning();
    workspaceBId = wsB!.id;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: workspaceAId, owner: 'acme', name: 'blast', fullName: 'acme/blast' })
      .returning();
    repoId = repo!.id;
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: workspaceAId,
        repoId,
        number: 1,
        title: 'Blast PR',
        author: 'alice',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        additions: 0,
        deletions: 0,
        filesCount: 2,
        status: 'needs_review',
      })
      .returning();
    prId = pr!.id;
    for (const path of ['src/a.ts', 'src/b.ts']) {
      await pg.handle.db.insert(t.prFiles).values({ prId, path, additions: 1, deletions: 0 });
    }
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appAs(workspaceId: string) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        auth: new MockAuthProvider(
          { id: 'u-test', email: 'u@test', name: 'Test User' },
          { id: workspaceId, name: workspaceId },
        ),
        repoIntel: { getBlastRadius } as never,
      },
    });
  }

  it('RQ-T3: returns a contract-valid body and asks repo-intel once with the PR paths', async () => {
    getBlastRadius.mockReset();
    getBlastRadius.mockResolvedValue({
      changedSymbols: [{ file: 'src/a.ts', name: 'alpha', kind: 'function' }],
      callers: [{ file: 'src/x.ts', symbol: 'handleX', viaSymbol: 'alpha', line: 3, rank: 1 }],
      impactedEndpoints: ['GET /a'],
      factsByFile: { 'src/x.ts': { endpoints: ['GET /a'], crons: [] } },
      degraded: false,
    });
    const app = await appAs(workspaceAId);
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadiusResponse.parse(res.json());
    expect(body.degraded).toBe(false);
    expect(body.reason).toBeNull();
    expect(body.downstream).toEqual([
      {
        symbol: 'alpha',
        callers: [{ name: 'handleX', file: 'src/x.ts', line: 3 }],
        endpoints_affected: ['GET /a'],
        crons_affected: [],
      },
    ]);
    expect(getBlastRadius).toHaveBeenCalledTimes(1);
    const [calledRepoId, paths] = getBlastRadius.mock.calls[0]!;
    expect(calledRepoId).toBe(repoId);
    expect([...(paths as string[])].sort()).toEqual(['src/a.ts', 'src/b.ts']);
    await app.close();
  });

  it('F1: a PR with no persisted pr_files returns 200 degraded no_changed_files and never asks repo-intel', async () => {
    getBlastRadius.mockReset();
    const [emptyPr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: workspaceAId,
        repoId,
        number: 2,
        title: 'Empty PR',
        author: 'alice',
        branch: 'feat/empty',
        base: 'main',
        headSha: 'def456',
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'needs_review',
      })
      .returning();
    const app = await appAs(workspaceAId);
    const res = await app.inject({ method: 'GET', url: `/pulls/${emptyPr!.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadiusResponse.parse(res.json());
    expect(body.changed_symbols).toEqual([]);
    expect(body.downstream).toEqual([]);
    expect(body.degraded).toBe(true);
    expect(body.reason).toBe('no_changed_files');
    expect(getBlastRadius).not.toHaveBeenCalled();
    await app.close();
  });

  it('RQ-T3: unknown PR and another workspace\'s PR both return 404', async () => {
    getBlastRadius.mockReset();
    const appA = await appAs(workspaceAId);
    const unknown = await appA.inject({ method: 'GET', url: '/pulls/00000000-0000-4000-8000-000000000000/blast' });
    expect(unknown.statusCode).toBe(404);
    await appA.close();

    const appB = await appAs(workspaceBId);
    const denied = await appB.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(denied.statusCode).toBe(404);
    expect(getBlastRadius).not.toHaveBeenCalled();
    await appB.close();
  });
});
