/**
 * Cross-workspace isolation. The only `AuthProvider` today is
 * `LocalNoAuthProvider` (one hardcoded identity), so no real request can ever
 * carry a second workspace identity — this harness is the only thing
 * exercising the `WHERE workspaceId = ctx.workspaceId` guard every module's
 * queries assume. Uses `MockAuthProvider` (already exists for other tests) to
 * drive two apps as two different workspaces against the SAME Postgres, so a
 * future real multi-tenant AuthProvider inherits a guard that's actually
 * tested, not just assumed. Gated on Docker, matching the other integration
 * tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('cross-workspace isolation (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceAId: string;
  let workspaceBId: string;
  let repoAId: string;
  let prAId: string;

  beforeAll(async () => {
    pg = await startPg();
    const { workspaceId: wsA } = await seed(pg.handle.db);
    workspaceAId = wsA;

    const [wsB] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'workspace-b' })
      .returning();
    workspaceBId = wsB!.id;

    const [repoA] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: workspaceAId, owner: 'acme', name: 'private-a', fullName: 'acme/private-a' })
      .returning();
    repoAId = repoA!.id;

    const [prA] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: workspaceAId,
        repoId: repoAId,
        number: 1,
        title: 'Workspace A secret PR',
        author: 'alice',
        branch: 'feat/x',
        base: 'main',
        headSha: 'cafef00d',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'open',
      })
      .returning();
    prAId = prA!.id;
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
      },
    });
  }

  it("workspace B cannot read workspace A's PR by id", async () => {
    const appB = await appAs(workspaceBId);
    const res = await appB.inject({ method: 'GET', url: `/pulls/${prAId}` });
    expect(res.statusCode).toBe(404);
    await appB.close();
  });

  it("workspace A CAN read its own PR by id (control)", async () => {
    const appA = await appAs(workspaceAId);
    const res = await appA.inject({ method: 'GET', url: `/pulls/${prAId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe('Workspace A secret PR');
    await appA.close();
  });

  it("workspace B cannot delete workspace A's repo", async () => {
    const appB = await appAs(workspaceBId);
    const res = await appB.inject({ method: 'DELETE', url: `/repos/${repoAId}` });
    expect(res.statusCode).toBe(404);
    await appB.close();

    // Control: the repo is still there for workspace A.
    const appA = await appAs(workspaceAId);
    const stillThere = await appA.inject({ method: 'GET', url: '/repos' });
    expect(stillThere.json().some((r: { id: string }) => r.id === repoAId)).toBe(true);
    await appA.close();
  });

  it("workspace B's repo list never includes workspace A's repo", async () => {
    const appB = await appAs(workspaceBId);
    const res = await appB.inject({ method: 'GET', url: '/repos' });
    const ids = (res.json() as { id: string }[]).map((r) => r.id);
    expect(ids).not.toContain(repoAId);
    await appB.close();
  });
});
