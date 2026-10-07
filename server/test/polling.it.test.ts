/**
 * POST /repos/:id/poll — manual PR-list sync from GitHub. Gated on Docker
 * (needs Postgres to resolve/update the repo + pull_requests rows), matching
 * the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('POST /repos/:id/poll (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('syncs the PR list from GitHub and bumps last_polled_at', async () => {
    const gh = new MockGitHubClient();
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'poll-me', fullName: 'acme/poll-me' })
      .returning();

    const res = await app.inject({ method: 'POST', url: `/repos/${repo!.id}/poll` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ synced: 1, reviewTriggered: false });

    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repo!.id));
    expect(pr).toBeDefined();
    expect(pr!.number).toBe(482); // MockGitHubClient's default fixture PR
    expect(pr!.status).toBe('open');

    const [updatedRepo] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.id, repo!.id));
    expect(updatedRepo!.lastPolledAt).not.toBeNull();
    await app.close();
  });

  it('a second poll is idempotent (upserts, does not duplicate)', async () => {
    const gh = new MockGitHubClient();
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'poll-twice', fullName: 'acme/poll-twice' })
      .returning();

    await app.inject({ method: 'POST', url: `/repos/${repo!.id}/poll` });
    const res = await app.inject({ method: 'POST', url: `/repos/${repo!.id}/poll` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ synced: 1, reviewTriggered: false });

    const rows = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repo!.id));
    expect(rows).toHaveLength(1);
    await app.close();
  });

  it('returns 404 for a repo that does not exist', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient() },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/repos/00000000-0000-0000-0000-000000000000/poll',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
