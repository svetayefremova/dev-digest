import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const INDEX_KIND = 'repo-intel-index';
const MIN = 60_000;

/**
 * Tour facts + the time-bounded "is the index being built" read, against real
 * Postgres tables (file_rank, file_edges, file_facts, symbols, jobs).
 */
d('repo-intel tour facts (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let intel: RepoIntel;
  let close: () => Promise<void>;
  let n = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const app = await buildApp({ config: config(), db: pg.handle.db });
    intel = app.container.repoIntel;
    close = () => app.close();
  });
  afterAll(async () => {
    await close?.();
    await pg?.stop();
  });

  async function newRepo(): Promise<string> {
    n += 1;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `facts-${n}`, fullName: `acme/facts-${n}` })
      .returning();
    return r!.id;
  }

  const rank = (repoId: string, filePath: string, pagerank: number) => ({
    repoId,
    filePath,
    pagerank,
    hotness: 0,
    rank: pagerank,
    percentile: 90,
  });

  it('SPEC-02 AC-11 / AC-16: importer counts, endpoint counts and indexed paths are derived from the seeded index', async () => {
    const repoId = await newRepo();
    await pg.handle.db.insert(t.fileRank).values([
      rank(repoId, 'src/a.ts', 0.5),
      rank(repoId, 'src/b.ts', 0.3),
      rank(repoId, 'src/c.ts', 0.2),
    ]);
    await pg.handle.db.insert(t.fileEdges).values([
      { repoId, fromFile: 'src/a.ts', toFile: 'src/c.ts' },
      { repoId, fromFile: 'src/b.ts', toFile: 'src/c.ts' },
      { repoId, fromFile: 'src/a.ts', toFile: 'src/b.ts' },
    ]);
    await pg.handle.db.insert(t.fileFacts).values({
      repoId,
      filePath: 'src/c.ts',
      endpoints: [
        { method: 'GET', path: '/x' },
        { method: 'POST', path: '/x' },
      ],
    });

    const facts = await intel.getTourFacts(repoId);
    expect(facts.importers['src/c.ts']).toBe(2);
    expect(facts.importers['src/b.ts']).toBe(1);
    expect(facts.importers['src/a.ts']).toBeUndefined();
    expect(facts.endpoints['src/c.ts']).toBe(2);
    expect([...facts.indexedPaths].sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(facts.ranked.map((r) => r.path).sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('SPEC-02 AC-11: with an empty file_rank the indexed paths are the symbol paths', async () => {
    const repoId = await newRepo();
    await pg.handle.db.insert(t.symbols).values([
      { repoId, path: 'src/only-symbols.ts', name: 'run', kind: 'function', line: 1 },
      { repoId, path: 'src/only-symbols.ts', name: 'stop', kind: 'function', line: 9 },
      { repoId, path: 'src/other.ts', name: 'go', kind: 'function', line: 1 },
    ]);
    const facts = await intel.getTourFacts(repoId);
    expect(facts.ranked).toEqual([]);
    expect([...facts.indexedPaths].sort()).toEqual(['src/only-symbols.ts', 'src/other.ts']);
  });

  it('RQ60: a queued index job scheduled now means indexing; a running one started 8 min ago does not; a done one does not', async () => {
    const repoId = await newRepo();
    expect(await intel.isIndexing(repoId)).toBe(false);

    const [queued] = await pg.handle.db
      .insert(t.jobs)
      .values({ workspaceId, kind: INDEX_KIND, payload: { repoId }, status: 'queued', scheduledAt: new Date() })
      .returning();
    expect(await intel.isIndexing(repoId)).toBe(true);

    await pg.handle.db
      .update(t.jobs)
      .set({ status: 'running', startedAt: new Date(Date.now() - 8 * MIN) })
      .where(eqId(queued!.id));
    expect(await intel.isIndexing(repoId)).toBe(false);

    await pg.handle.db
      .update(t.jobs)
      .set({ status: 'running', startedAt: new Date() })
      .where(eqId(queued!.id));
    expect(await intel.isIndexing(repoId)).toBe(true);

    await pg.handle.db
      .update(t.jobs)
      .set({ status: 'done', finishedAt: new Date() })
      .where(eqId(queued!.id));
    expect(await intel.isIndexing(repoId)).toBe(false);
  });

  it('RQ60: an index job of another repo does not make this repo indexing', async () => {
    const mine = await newRepo();
    const other = await newRepo();
    await pg.handle.db
      .insert(t.jobs)
      .values({ workspaceId, kind: INDEX_KIND, payload: { repoId: other }, status: 'queued', scheduledAt: new Date() });
    expect(await intel.isIndexing(other)).toBe(true);
    expect(await intel.isIndexing(mine)).toBe(false);
  });
});

function eqId(id: string) {
  return eq(t.jobs.id, id);
}
