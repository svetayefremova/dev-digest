/**
 * GET /workspace — workspace info + cloneDir + cloned-repos summary. Gated on
 * Docker (needs Postgres to resolve the repos list), matching the other
 * integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('GET /workspace (Testcontainers pg)', () => {
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

  it('returns workspaceId, cloneDir, and the workspace repos summary', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'workspace-summary',
        fullName: 'acme/workspace-summary',
        clonePath: '/clones/acme-workspace-summary',
      })
      .returning();

    const res = await app.inject({ method: 'GET', url: '/workspace' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.workspaceId).toBe(workspaceId);
    expect(typeof body.cloneDir).toBe('string');
    const entry = body.repos.find((r: { id: string }) => r.id === repo!.id);
    expect(entry).toMatchObject({
      id: repo!.id,
      full_name: 'acme/workspace-summary',
      clone_path: '/clones/acme-workspace-summary',
      cloned: true,
    });
    await app.close();
  });
});
