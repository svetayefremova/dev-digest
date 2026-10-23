import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import { ExternalServiceError } from '../src/platform/errors.js';
import { runGeneration } from '../src/modules/onboarding/generation.js';
import { OnboardingRepository } from '../src/modules/onboarding/repository.js';
import type { RepoIntel, TourIndexFacts } from '../src/modules/repo-intel/types.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const MIN = 60_000;

// ---------------------------------------------------------------- fixtures --

const CHECKOUT_FILES: Record<string, string> = {
  'package.json': JSON.stringify({
    scripts: { dev: 'tsx watch src/server.ts', test: 'vitest run' },
    dependencies: { fastify: '^5.0.0' },
    devDependencies: { typescript: '^5.7.0', vitest: '^2.0.0' },
  }),
  '.env.example': 'API_KEY=secret\nPORT=3000\n',
  'README.md': '# Payments API\n\nSECRET-README-LINE: how to run it.\n',
  'tsconfig.json': '{ "compilerOptions": { "strict": true } }',
  'src/server.ts': 'export {};\n',
  'docs/guide.md': '# guide\n',
  'specs/tooling/gen.ts': 'export {};\n',
};

const FILES = [
  'src/server.ts',
  'src/routes/users.ts',
  'src/lib/db.ts',
  'src/lib/auth.ts',
  'src/util.ts',
  'specs/tooling/gen.ts',
];

function facts(paths: string[] = FILES, over: Partial<TourIndexFacts> = {}): TourIndexFacts {
  const ranked = paths.map((path, i) => ({ path, pagerank: 1 - i * 0.02, hotness: 0 }));
  return {
    ranked,
    indexedPaths: paths,
    importers: Object.fromEntries(paths.map((p) => [p, 1])),
    endpoints: paths.includes('src/routes/users.ts') ? { 'src/routes/users.ts': 4 } : {},
    criticalPathFiles: paths.slice(0, 2),
    ...over,
  };
}

const OK_OUTPUT = {
  architecture: { summary: 'First summary of the API.', diagram: null },
  criticalPathReasons: [{ path: 'src/routes/users.ts', reason: 'Handles the user requests.' }],
  readingPathReasons: [{ path: 'src/server.ts', reason: 'Boots the application.' }],
  runCommands: ['npm run dev'],
  firstTasks: [{ title: 'Read the database layer', path: 'src/lib/db.ts' }],
};

interface IntelCfg {
  status: 'full' | 'partial' | 'degraded' | 'failed';
  noData: boolean;
  filesIndexed: number;
  sha: string;
  facts: TourIndexFacts;
  indexing: boolean;
  builds: number;
  buildDone: Deferred<void> | null;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function waitFor(cond: () => boolean, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

type StructuredReq = {
  model: string;
  maxRetries?: number;
  timeoutMs?: number;
  messages: Array<{ role: string; content: string }>;
  schema: { parse: (v: unknown) => unknown };
};

class StubLLM {
  readonly id = 'openai';
  calls: StructuredReq[] = [];
  handler: (req: StructuredReq) => Promise<unknown> = async () => OK_OUTPUT;
  async listModels() {
    return [];
  }
  async complete() {
    throw new Error('complete() is not used by the tour');
  }
  async embed() {
    return [];
  }
  async completeStructured(req: StructuredReq) {
    this.calls.push(req);
    const data = await this.handler(req);
    return {
      data: req.schema.parse(data),
      model: req.model,
      tokensIn: 120,
      tokensOut: 45,
      costUsd: 0.001,
      raw: JSON.stringify(data),
      attempts: 1,
    };
  }
}

type GenRow = typeof t.onboardingGenerations.$inferSelect;

/**
 * Onboarding tour: GET never calls a model; POST starts at most one generation
 * job per repo; grounding, failure handling, persistence and isolation, against
 * real Postgres with a stub LLM and a fake repo-intel facade.
 */
d('onboarding tour (Testcontainers pg)', () => {
  let pg: PgFixture;
  let cloneDir: string;
  let workspaceId: string;
  let user: { id: string; email: string; name: string };
  let workspaceBId: string;
  let llm: StubLLM;
  const intelByRepo = new Map<string, IntelCfg>();
  let n = 0;

  const cfgOf = (id: string) => intelByRepo.get(id)!;
  const fakeIntel = {
    getIndexState: async (id: string) => {
      const c = cfgOf(id);
      return {
        repoId: id,
        status: c.noData ? 'degraded' : c.status,
        filesIndexed: c.filesIndexed,
        filesSkipped: 0,
        durationMs: 10,
        reason: c.noData ? 'no_data' : undefined,
        lastIndexedSha: c.noData ? '' : c.sha,
        indexerVersion: 1,
        updatedAt: c.noData ? new Date(0) : new Date('2026-10-22T10:00:00Z'),
        degraded: c.noData || c.status !== 'full' ? true : undefined,
        degradedReason: c.noData ? 'no_data' : undefined,
      };
    },
    getTourFacts: async (id: string) => cfgOf(id).facts,
    isIndexing: async (id: string) => cfgOf(id).indexing,
    requestIndexBuild: async (_ws: string, id: string) => {
      const c = cfgOf(id);
      c.builds += 1;
      return {
        done: c.buildDone!.promise.then(() => {
          c.noData = false;
          c.indexing = false;
          c.filesIndexed = c.facts.indexedPaths.length;
        }),
      };
    },
  } as unknown as RepoIntel;

  let app: Awaited<ReturnType<typeof buildApp>>;
  let appB: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [seeded] = await pg.handle.db.select().from(t.users);
    user = { id: seeded!.id, email: seeded!.email, name: seeded!.name ?? 'You' };
    const [wsB] = await pg.handle.db.insert(t.workspaces).values({ name: 'workspace-b' }).returning();
    workspaceBId = wsB!.id;

    cloneDir = await mkdtemp(join(tmpdir(), 'onboarding-'));
    for (const [path, content] of Object.entries(CHECKOUT_FILES)) {
      await mkdir(dirname(join(cloneDir, path)), { recursive: true });
      await writeFile(join(cloneDir, path), content);
    }

    llm = new StubLLM();
    const overrides = () => ({
      llm: { openai: llm, openrouter: llm, anthropic: llm } as never,
      repoIntel: fakeIntel,
    });
    app = await buildApp({ config: config(), db: pg.handle.db, overrides: overrides() });
    appB = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { ...overrides(), auth: new MockAuthProvider(user, { id: workspaceBId, name: 'workspace-b' }) },
    });
  });
  afterAll(async () => {
    await app?.close();
    await appB?.close();
    await pg?.stop();
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true });
  });
  beforeEach(() => {
    llm.calls = [];
    llm.handler = async () => OK_OUTPUT;
  });

  async function newRepo(
    opts: { clone?: string | null; intel?: Partial<IntelCfg> } = {},
  ): Promise<string> {
    n += 1;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `tour-${n}`,
        fullName: `acme/tour-${n}`,
        clonePath: opts.clone === undefined ? cloneDir : opts.clone,
      })
      .returning();
    intelByRepo.set(r!.id, {
      status: 'full',
      noData: false,
      filesIndexed: FILES.length,
      sha: 'abc123',
      facts: facts(),
      indexing: false,
      builds: 0,
      buildDone: null,
      ...opts.intel,
    });
    return r!.id;
  }

  const getState = async (repoId: string, a = app) => {
    const res = await a.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    return res.json();
  };
  const generate = (repoId: string, a = app) =>
    a.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
  const settle = () => app.container.jobs.onIdle();
  const generationRow = async (id: string): Promise<GenRow> => {
    const [row] = await pg.handle.db.select().from(t.onboardingGenerations).where(eq(t.onboardingGenerations.id, id));
    return row!;
  };
  const backdate = (repoId: string, ms: number) =>
    pg.handle.db
      .update(t.onboardingGenerations)
      .set({ startedAt: new Date(Date.now() - ms) })
      .where(eq(t.onboardingGenerations.repoId, repoId));

  // ----------------------------------------------------------------- T10 ----

  it('SPEC-02 AC-36: another workspace gets 404 on GET and POST, the owning workspace gets 200', async () => {
    const repoId = await newRepo();
    const own = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(own.statusCode).toBe(200);
    expect(own.json().tour).toBeNull();

    expect((await appB.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` })).statusCode).toBe(404);
    expect((await generate(repoId, appB)).statusCode).toBe(404);
    expect(llm.calls).toHaveLength(0);
  });

  // ----------------------------------------------------------------- T11 ----

  it('SPEC-02 AC-11: a GET without a tour serves a facts-only skeleton and makes no model call', async () => {
    llm.handler = async () => {
      throw new Error('the model must not be called by GET');
    };
    const repoId = await newRepo();
    const state = await getState(repoId);

    expect(state.tour).toBeNull();
    expect(state.skeleton.mode).toBe('skeleton');
    expect(state.skeleton.architecture.stack.length).toBeGreaterThan(0);
    expect(state.skeleton.architecture.topLevelDirs).toEqual(['docs', 'specs', 'src']);
    expect(state.skeleton.runLocally.commands.map((c: { command: string }) => c.command)).toContain('npm run dev');
    const users = state.skeleton.criticalPaths.entries.find((e: { path: string }) => e.path === 'src/routes/users.ts');
    expect(users.endpoints).toBe(4);
    expect(llm.calls).toHaveLength(0);
  });

  it('SPEC-02 AC-19 / AC-38: one generation makes exactly one structured call (maxRetries 0, 60 s), and reopening makes none', async () => {
    const repoId = await newRepo();
    const res = await generate(repoId);
    expect(res.statusCode).toBe(202);
    await settle();

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.maxRetries).toBe(0);
    expect(llm.calls[0]!.timeoutMs).toBe(60_000);

    const first = await getState(repoId);
    const second = await getState(repoId);
    expect(first.tour.mode).toBe('generated');
    expect(first.tour.architecture.summary).toBe('First summary of the API.');
    expect(second.tour).toEqual(first.tour);
    expect(llm.calls).toHaveLength(1);
  });

  // ----------------------------------------------------------------- T12 ----

  it('SPEC-02 AC-14 / AC-51: ghost paths are dropped from reasons, and at most 3 grounded first tasks remain', async () => {
    llm.handler = async () => ({
      ...OK_OUTPUT,
      criticalPathReasons: [
        { path: 'src/ghost.ts', reason: 'An invented file.' },
        { path: 'src/routes/users.ts', reason: 'Handles the user requests.' },
      ],
      firstTasks: [
        { title: 'Read the database layer', path: 'src/lib/db.ts' },
        { title: 'Fix the missing module', path: 'src/missing/none.ts' },
        { title: 'Explore the tooling', path: 'specs' },
        { title: 'Tidy the helpers', path: 'src/util.ts' },
      ],
    });
    const repoId = await newRepo();
    expect((await generate(repoId)).statusCode).toBe(202);
    await settle();

    const { tour } = await getState(repoId);
    const paths = (list: { entries: Array<{ path: string }> }) => list.entries.map((e) => e.path);
    expect(paths(tour.criticalPaths)).not.toContain('src/ghost.ts');
    expect(tour.criticalPaths.entries.find((e: { path: string }) => e.path === 'src/routes/users.ts').reason).toBe(
      'Handles the user requests.',
    );
    const tasks = tour.firstTasks as Array<{ path: string; title: string }>;
    expect(tasks.length).toBeLessThanOrEqual(3);
    expect(tasks.map((x) => x.path)).not.toContain('src/missing/none.ts');
    expect(tasks.map((x) => x.path)).toContain('specs');
    expect(tasks.map((x) => x.path)).toContain('src/lib/db.ts');
  });

  it('SPEC-02 AC-51: a first task whose directory holds no indexed file is dropped', async () => {
    llm.handler = async () => ({
      ...OK_OUTPUT,
      firstTasks: [
        { title: 'Read the guide', path: 'docs' }, // exists on disk, but no indexed file under docs/
        { title: 'Read the database layer', path: 'src/lib/db.ts' },
      ],
    });
    const repoId = await newRepo();
    expect((await generate(repoId)).statusCode).toBe(202);
    await settle();

    const { tour } = await getState(repoId);
    expect((tour.firstTasks as Array<{ path: string }>).map((x) => x.path)).toEqual(['src/lib/db.ts']);
  });

  // ----------------------------------------------------------------- T13 ----

  describe('generation records (AC-22, AC-23, AC-44)', () => {
    const logs: unknown[] = [];
    const log = {
      info: (o: unknown) => logs.push(o),
      warn: (o: unknown) => logs.push(o),
      error: (o: unknown) => logs.push(o),
      debug: (o: unknown) => logs.push(o),
    };
    const repository = () => new OnboardingRepository(pg.handle.db);
    const run = async (repoId: string, opts: { timeoutMs?: number } = {}) => {
      const row = await repository().insertRunning(workspaceId, repoId, 'generating');
      await runGeneration({ container: app.container, repository: repository(), log }, row!.id, opts);
      return generationRow(row!.id);
    };
    beforeEach(() => {
      logs.length = 0;
    });

    it('SPEC-02 AC-22: output that fails the contract is recorded as ai_output_invalid and served as a skeleton', async () => {
      llm.handler = async () => {
        throw new ExternalServiceError('schema mismatch', { raw: 'SECRET-README-LINE echoed by the model' });
      };
      const repoId = await newRepo();
      const row = await run(repoId);

      expect(row.status).toBe('failed');
      expect(row.reason).toBe('ai_output_invalid');
      expect(row.tokensIn).toBeNull();
      expect(row.tokensOut).toBeNull();
      expect(row.durationMs).not.toBeNull();

      const state = await getState(repoId);
      expect(state.tour).toBeNull();
      expect(state.skeleton.mode).toBe('skeleton');
      expect(state.skeleton.reason).toBe('ai_output_invalid');
      expect(state.latestGeneration.reason).toBe('ai_output_invalid');
    });

    it('SPEC-02 AC-23: a model call that outlives the timeout is recorded as ai_unavailable with no tokens', async () => {
      llm.handler = () => new Promise<never>(() => undefined);
      const repoId = await newRepo();
      const row = await run(repoId, { timeoutMs: 50 });

      expect(row.status).toBe('failed');
      expect(row.reason).toBe('ai_unavailable');
      expect(row.tokensIn).toBeNull();
      expect(row.durationMs).not.toBeNull();
      const state = await getState(repoId);
      expect(state.skeleton.reason).toBe('ai_unavailable');
    });

    it('SPEC-02 AC-23: a failing provider is recorded as ai_unavailable', async () => {
      llm.handler = async () => {
        throw new Error('provider down');
      };
      const row = await run(await newRepo());
      expect(row).toMatchObject({ status: 'failed', reason: 'ai_unavailable' });
    });

    it('SPEC-02 AC-44: a successful run records status, tokens, duration and run id, and logs no excerpt or model text', async () => {
      const repoId = await newRepo();
      const row = await run(repoId);
      expect(row.status).toBe('succeeded');
      expect(row.reason).toBeNull();
      expect(row.tokensIn).toBe(120);
      expect(row.tokensOut).toBe(45);
      expect(row.durationMs).not.toBeNull();
      expect(row.model).toBeTruthy();

      const finished = logs.find((l) => (l as { generationId?: string }).generationId === row.id);
      expect(finished).toBeDefined();
      const text = JSON.stringify(logs);
      expect(text).not.toContain('SECRET-README-LINE');
      expect(text).not.toContain('First summary of the API.');
    });

    it('SPEC-02 AC-44: logs of a failed run carry no raw model output', async () => {
      llm.handler = async () => {
        throw new ExternalServiceError('schema mismatch', { raw: 'SECRET-README-LINE echoed by the model' });
      };
      await run(await newRepo());
      expect(logs.length).toBeGreaterThan(0);
      expect(JSON.stringify(logs)).not.toContain('SECRET-README-LINE');
    });
  });

  // ----------------------------------------------------------------- T14 ----

  it('SPEC-02 AC-44: each generation started by POST has a record under the returned generation id with status, reason, duration and tokens', async () => {
    const okRepo = await newRepo();
    const okRes = await generate(okRepo);
    expect(okRes.statusCode).toBe(202);
    const okId = okRes.json().generation.id as string;
    expect(okId).toEqual(expect.any(String));
    await settle();
    const ok = await generationRow(okId);
    expect(ok).toMatchObject({ id: okId, repoId: okRepo, status: 'succeeded', reason: null, tokensIn: 120, tokensOut: 45 });
    expect(ok.durationMs).toEqual(expect.any(Number));

    llm.handler = async () => {
      throw new Error('provider down');
    };
    const badRepo = await newRepo();
    const badRes = await generate(badRepo);
    expect(badRes.statusCode).toBe(202);
    const badId = badRes.json().generation.id as string;
    expect(badId).not.toBe(okId);
    await settle();
    const bad = await generationRow(badId);
    expect(bad).toMatchObject({ id: badId, repoId: badRepo, status: 'failed', reason: 'ai_unavailable' });
    expect(bad.durationMs).toEqual(expect.any(Number));
  });

  it('SPEC-02 AC-34: two POSTs while one generation runs return the same generation and make one call', async () => {
    const gate = deferred<void>();
    llm.handler = async () => {
      await gate.promise;
      return OK_OUTPUT;
    };
    const repoId = await newRepo();
    const a = await generate(repoId);
    const b = await generate(repoId);
    expect(a.statusCode).toBe(202);
    expect(b.statusCode).toBe(200);
    expect(b.json().generation.id).toBe(a.json().generation.id);
    expect(b.json().generation.status).toBe('running');

    gate.resolve();
    await settle();
    expect(llm.calls).toHaveLength(1);
    expect((await getState(repoId)).tour.mode).toBe('generated');
  });

  // ----------------------------------------------------------------- T15 ----

  it('SPEC-02 AC-40: a POST within 60 s of the previous start is rejected with 429 and a retry-after', async () => {
    const repoId = await newRepo();
    await pg.handle.db.insert(t.onboardingGenerations).values({
      workspaceId,
      repoId,
      status: 'succeeded',
      phase: 'generating',
      startedAt: new Date(Date.now() - 10_000),
      finishedAt: new Date(),
    });
    const res = await generate(repoId);
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('onboarding_cooldown');
    const retry = res.json().error.details.retryAfterSeconds as number;
    expect(retry).toBeGreaterThanOrEqual(49);
    expect(retry).toBeLessThanOrEqual(51);
    expect(llm.calls).toHaveLength(0);
  });

  it('SPEC-02 AC-40: after the cooldown has passed a new generation is accepted', async () => {
    const repoId = await newRepo();
    await pg.handle.db.insert(t.onboardingGenerations).values({
      workspaceId,
      repoId,
      status: 'succeeded',
      phase: 'generating',
      startedAt: new Date(Date.now() - 2 * MIN),
      finishedAt: new Date(Date.now() - MIN),
    });
    expect((await generate(repoId)).statusCode).toBe(202);
    await settle();
  });

  // ----------------------------------------------------------------- T16 ----

  it('SPEC-02 AC-33 / AC-35: a regeneration keeps the previous tour while running, and a failed one keeps it with a failed record', async () => {
    const repoId = await newRepo();
    expect((await generate(repoId)).statusCode).toBe(202);
    await settle();
    const first = await getState(repoId);
    expect(first.tour.architecture.summary).toBe('First summary of the API.');
    await backdate(repoId, 10 * MIN);

    // A failing regeneration: the previous tour stays, the failure is recorded.
    llm.handler = async () => {
      throw new Error('provider down');
    };
    expect((await generate(repoId)).statusCode).toBe(202);
    await settle();
    const afterFail = await getState(repoId);
    expect(afterFail.tour).toEqual(first.tour);
    expect(afterFail.latestGeneration).toMatchObject({ status: 'failed', reason: 'ai_unavailable' });
    await backdate(repoId, 10 * MIN);

    // A successful regeneration: the old tour is served until it finishes.
    const gate = deferred<void>();
    llm.handler = async () => {
      await gate.promise;
      return { ...OK_OUTPUT, architecture: { summary: 'Second summary of the API.', diagram: null } };
    };
    expect((await generate(repoId)).statusCode).toBe(202);
    const during = await getState(repoId);
    expect(during.tour.architecture.summary).toBe('First summary of the API.');
    expect(during.latestGeneration.status).toBe('running');

    gate.resolve();
    await settle();
    const after = await getState(repoId);
    expect(after.tour.architecture.summary).toBe('Second summary of the API.');
    expect(after.latestGeneration.status).toBe('succeeded');
  });

  // ----------------------------------------------------------------- T17 ----

  it('SPEC-02 AC-46: Generate without an index requests an index build and calls the model only after it finishes', async () => {
    const buildDone = deferred<void>();
    const repoId = await newRepo({ intel: { noData: true, filesIndexed: 0, buildDone } });

    const res = await generate(repoId);
    expect(res.statusCode).toBe(202);
    expect(res.json().generation.phase).toBe('indexing');
    expect(cfgOf(repoId).builds).toBe(1);

    const during = await getState(repoId);
    expect(during.indexing).toBe(true);
    expect(during.skeleton).toBeNull();
    expect(llm.calls).toHaveLength(0);

    buildDone.resolve();
    await waitFor(() => llm.calls.length === 1);
    await settle();
    const after = await getState(repoId);
    expect(after.indexing).toBe(false);
    expect(after.tour.mode).toBe('generated');
    expect(llm.calls).toHaveLength(1);
  });

  it('SPEC-02 AC-47: Generate with an existing index does not re-index', async () => {
    const repoId = await newRepo();
    expect((await generate(repoId)).statusCode).toBe(202);
    await settle();
    expect(cfgOf(repoId).builds).toBe(0);
    expect(llm.calls).toHaveLength(1);
  });

  // ----------------------------------------------------------------- T18 ----

  it('SPEC-02 AC-27: with no checkout or a missing directory the repo is not cloned and Generate gives 422', async () => {
    const noPath = await newRepo({ clone: null });
    const state = await getState(noPath);
    expect(state.cloned).toBe(false);
    expect(state.skeleton).toBeNull();
    expect((await generate(noPath)).statusCode).toBe(422);

    const gone = await newRepo({ clone: join(tmpdir(), 'onboarding-does-not-exist-xyz') });
    expect((await getState(gone)).cloned).toBe(false);
    expect((await generate(gone)).statusCode).toBe(422);
    expect(llm.calls).toHaveLength(0);
  });

  it('SPEC-02 AC-29: with repo intelligence off the skeleton says flag_off, Generate gives 409 and no model call is made', async () => {
    const repoId = await newRepo();
    const mutable = app.container.config as { repoIntelEnabled: boolean };
    mutable.repoIntelEnabled = false;
    try {
      const state = await getState(repoId);
      expect(state.repoIntelEnabled).toBe(false);
      expect(state.skeleton.reason).toBe('flag_off');
      const res = await generate(repoId);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('repo_intel_disabled');
      expect(llm.calls).toHaveLength(0);
    } finally {
      mutable.repoIntelEnabled = true;
    }
  });

  // ----------------------------------------------------------------- T19 ----

  it('SPEC-02 AC-31: an index with zero supported files gives a no_supported_files skeleton that still lists run commands', async () => {
    const repoId = await newRepo({ intel: { filesIndexed: 0, facts: facts([]) } });
    const { skeleton } = await getState(repoId);
    expect(skeleton.reason).toBe('no_supported_files');
    expect(skeleton.criticalPaths.entries).toEqual([]);
    expect(skeleton.readingPath.entries).toEqual([]);
    expect(skeleton.runLocally.commands.map((c: { command: string }) => c.command)).toContain('npm run dev');
  });

  // ----------------------------------------------------------------- T20 ----

  it('SPEC-02 AC-56: only 8 paths per list are offered, and entries 9-25 carry index facts with no model text', async () => {
    const many = Array.from({ length: 30 }, (_, i) => `src/mod/m${String(i).padStart(2, '0')}.ts`);
    llm.handler = async () => ({
      ...OK_OUTPUT,
      criticalPathReasons: many.map((path) => ({ path, reason: 'Owns a slice of the flow.' })),
      readingPathReasons: many.map((path) => ({ path, reason: 'Worth reading early.' })),
      firstTasks: [],
    });
    const repoId = await newRepo({
      intel: { filesIndexed: 30, facts: facts(many, { importers: Object.fromEntries(many.map((p) => [p, 7])) }) },
    });
    expect((await generate(repoId)).statusCode).toBe(202);
    await settle();

    const prompt = llm.calls[0]!.messages.find((m) => m.role === 'user')!.content;
    const reading = prompt.slice(prompt.indexOf('Reading-path candidates'));
    const critical = prompt.slice(prompt.indexOf('Critical-path candidates'), prompt.indexOf('Reading-path candidates'));
    const offered = (s: string) => (s.match(/^- src\/mod\/m\d+\.ts/gm) ?? []).length;
    expect(offered(critical)).toBe(8);
    expect(offered(reading)).toBe(8);

    const { tour } = await getState(repoId);
    for (const list of [tour.criticalPaths, tour.readingPath]) {
      expect(list.entries).toHaveLength(25);
      list.entries.forEach((e: { reason: string | null; importers: number }, i: number) => {
        if (i < 8) expect(e.reason).not.toBeNull();
        else expect(e.reason).toBeNull();
        expect(e.importers).toBe(7);
      });
      expect(list.truncated).toBe(true);
    }
  });

  it('RQ58: a literal compose secret never reaches the model, and a summary echoing it is dropped from the persisted tour', async () => {
    const secret = 'hunter2hunter2';
    const secretDir = await mkdtemp(join(tmpdir(), 'onboarding-secret-'));
    try {
      for (const [path, content] of Object.entries({
        ...CHECKOUT_FILES,
        'docker-compose.yml': `services:\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: ${secret}\n`,
      })) {
        await mkdir(dirname(join(secretDir, path)), { recursive: true });
        await writeFile(join(secretDir, path), content);
      }
      llm.handler = async () => ({
        ...OK_OUTPUT,
        architecture: { summary: `The database password is ${secret}.`, diagram: null },
      });
      const repoId = await newRepo({ clone: secretDir });
      expect((await generate(repoId)).statusCode).toBe(202);
      await settle();

      expect(llm.calls).toHaveLength(1);
      const sent = llm.calls[0]!.messages.map((m) => m.content).join('\n');
      expect(sent).toContain('POSTGRES_PASSWORD');
      expect(sent).toContain('postgres:16');
      expect(sent).not.toContain(secret);

      const { tour } = await getState(repoId);
      expect(tour.mode).toBe('generated');
      expect(tour.architecture.summary).toBeNull();
      expect(JSON.stringify(tour)).not.toContain(secret);
    } finally {
      await rm(secretDir, { recursive: true, force: true });
    }
  });

  // ----------------------------------------------------------------- T36 ----

  it('SPEC-02 AC-38: an old-shape persisted document reads as no tour (200), without a model call', async () => {
    const repoId = await newRepo();
    await pg.handle.db.insert(t.onboarding).values({
      repoId,
      json: { sections: [{ kind: 'architecture', title: 'T', body: 'b', links: [] }] },
    });
    const state = await getState(repoId);
    expect(state.tour).toBeNull();
    expect(state.latestGeneration).toBeNull();
    expect(llm.calls).toHaveLength(0);
  });

  // ----------------------------------------------------------------- T40 ----

  it('SPEC-02 AC-34: an orphaned running row does not block a new generation and is failed as interrupted', async () => {
    const repoId = await newRepo();
    const [orphan] = await pg.handle.db
      .insert(t.onboardingGenerations)
      .values({ workspaceId, repoId, status: 'running', phase: 'generating', startedAt: new Date(Date.now() - 10 * MIN) })
      .returning();

    const res = await generate(repoId);
    expect(res.statusCode).toBe(202);
    expect(res.json().generation.id).not.toBe(orphan!.id);
    await settle();
    expect(await generationRow(orphan!.id)).toMatchObject({ status: 'failed', reason: 'interrupted' });
    expect(llm.calls).toHaveLength(1);
  });

  it('SPEC-02 AC-34: a GET reports an orphaned running row as failed/interrupted so the client stops polling', async () => {
    const repoId = await newRepo();
    await pg.handle.db
      .insert(t.onboardingGenerations)
      .values({ workspaceId, repoId, status: 'running', phase: 'generating', startedAt: new Date(Date.now() - 10 * MIN) });
    const state = await getState(repoId);
    expect(state.latestGeneration).toMatchObject({ status: 'failed', reason: 'interrupted' });
  });

  it('SPEC-02 AC-34: a recent running row is not treated as an orphan', async () => {
    const repoId = await newRepo();
    await pg.handle.db
      .insert(t.onboardingGenerations)
      .values({ workspaceId, repoId, status: 'running', phase: 'generating', startedAt: new Date(Date.now() - 20_000) });
    const state = await getState(repoId);
    expect(state.latestGeneration.status).toBe('running');
  });
});

// ---------------------------------------------------------------------------
// Real repo-intel facade (jobs-queue indexing flag, index-state staleness).
// ---------------------------------------------------------------------------

d('onboarding tour with the real repo-intel facade (Testcontainers pg)', () => {
  let pg: PgFixture;
  let cloneDir: string;
  let workspaceId: string;
  let llm: StubLLM;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let n = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    cloneDir = await mkdtemp(join(tmpdir(), 'onboarding-real-'));
    await writeFile(join(cloneDir, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }));
    llm = new StubLLM();
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openai: llm, openrouter: llm, anthropic: llm } as never },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true });
  });

  async function newRepo(): Promise<string> {
    n += 1;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `real-${n}`, fullName: `acme/real-${n}`, clonePath: cloneDir })
      .returning();
    return r!.id;
  }
  const getState = async (repoId: string) => {
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    return res.json();
  };

  it('SPEC-02 AC-28: while an index job is queued the state reports indexing and Generate gives 409 without a second index job or model call', async () => {
    const repoId = await newRepo();
    await pg.handle.db
      .insert(t.jobs)
      .values({ workspaceId, kind: 'repo-intel-index', payload: { repoId }, status: 'queued', scheduledAt: new Date() });

    expect((await getState(repoId)).indexing).toBe(true);
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('indexing_in_progress');
    const jobs = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.kind, 'repo-intel-index'));
    expect(jobs.filter((j) => (j.payload as { repoId?: string }).repoId === repoId)).toHaveLength(1);
    expect(llm.calls).toHaveLength(0);
  });

  it('RQ60: a queued index job scheduled 8 minutes ago is orphaned and no longer counts as indexing', async () => {
    const repoId = await newRepo();
    await pg.handle.db.insert(t.jobs).values({
      workspaceId,
      kind: 'repo-intel-index',
      payload: { repoId },
      status: 'queued',
      scheduledAt: new Date(Date.now() - 8 * MIN),
    });
    expect((await getState(repoId)).indexing).toBe(false);
  });

  it('SPEC-02 AC-37: the same indexed commit with a moved timestamp is not stale, a different commit is stale', async () => {
    const repoId = await newRepo();
    const tour = {
      mode: 'generated',
      reason: null,
      architecture: { summary: 'S.', diagram: null, stack: [], topLevelDirs: [] },
      criticalPaths: { entries: [], truncated: false },
      readingPath: { entries: [], truncated: false },
      runLocally: { commands: [], envVars: [] },
      firstTasks: [],
      index: { filesIndexed: 5, filesSkipped: 0, status: 'full', indexedSha: 'abc', indexUpdatedAt: '2020-01-01T00:00:00Z' },
      generatedAt: '2020-01-01T00:00:00Z',
    };
    await pg.handle.db.insert(t.onboarding).values({ repoId, json: tour });
    await pg.handle.db
      .insert(t.repoIndexState)
      .values({ repoId, lastIndexedSha: 'abc', indexerVersion: 1, status: 'full', filesIndexed: 5 });

    expect((await getState(repoId)).stale).toBe(false);

    await pg.handle.db
      .update(t.repoIndexState)
      .set({ updatedAt: new Date(Date.now() + 60_000) })
      .where(eq(t.repoIndexState.repoId, repoId));
    const touched = await getState(repoId);
    expect(touched.tour).not.toBeNull();
    expect(touched.stale).toBe(false);

    await pg.handle.db
      .update(t.repoIndexState)
      .set({ lastIndexedSha: 'def' })
      .where(eq(t.repoIndexState.repoId, repoId));
    expect((await getState(repoId)).stale).toBe(true);
  });
});
