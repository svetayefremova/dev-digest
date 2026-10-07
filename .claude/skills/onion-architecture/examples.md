# Onion Architecture — examples

Real code from this repo, not invented snippets. "Good" examples are quoted
verbatim (trimmed); "bad" examples are quoted verbatim too, paired with a
sketch of the layered shape they're missing.

## Good: `modules/agents/` — the three-file slice to copy

`routes.ts` — transport only, one `service` call per handler:

```ts
// server/src/modules/agents/routes.ts
export default async function agentsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new AgentsService(app.container);

  app.get('/agents/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const agent = await service.get(workspaceId, req.params.id);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  });
}
```

`service.ts` — constructor takes only `Container`; no Fastify, no Drizzle:

```ts
// server/src/modules/agents/service.ts
import type { Container } from '../../platform/container.js';
import { AgentsRepository } from './repository.js';
import { toAgentDto, toAgentVersionDto } from './helpers.js';
```

`repository.ts` — the *only* file in the module that imports `drizzle-orm`:

```ts
// server/src/modules/agents/repository.ts
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
```

That's the whole pattern: routes call a service, the service orchestrates a
repository (+ pure helpers), and only the repository knows Drizzle exists.

## Good: `modules/repos/` — the rule stated in the code's own comments

```ts
// server/src/modules/repos/routes.ts:8-10
/**
 * F1 — repos module. Transport layer only: parses requests, maps status
 * codes, and delegates all business logic to RepoService.
 */
```

```ts
// server/src/modules/repos/service.ts:16-23
/**
 * F1 — repos service. Business logic for the Repositories feature...
 *
 * No HTTP and no raw SQL live here — persistence goes through RepoRepository,
 * pure transforms through helpers.ts, literals through constants.ts.
 */
```

```ts
// server/src/modules/repos/helpers.ts:10-13
/**
 * F1 — repos pure helpers (extracted from routes.ts; no behaviour change).
 * Pure functions only — no I/O, no DB, no container.
 */
import * as t from '../../db/schema.js'; // ← type-only use, see below
```

`helpers.ts` still imports `db/schema.js` — but only to read a *type*
(`typeof t.repos.$inferSelect`), never to run a query. That's the one
allowed exception to "no Drizzle outside `repository.ts`": reusing a type is
not a layering violation.

## Good: `modules/_shared/context.ts` — the one sanctioned Fastify touchpoint

```ts
// server/src/modules/_shared/context.ts
import type { FastifyRequest } from 'fastify';
import type { Container } from '../../platform/container.js';

export async function getContext(
  container: Container,
  req: FastifyRequest,
): Promise<RequestContext> {
  const [user, workspace] = await Promise.all([
    container.auth.currentUser(req),
    container.auth.currentWorkspace(req),
  ]);
  return { workspaceId: workspace.id, userId: user.id };
}
```

Every module calls `getContext(container, req)` in its `routes.ts` and
passes the resulting plain `{ workspaceId, userId }` into the service —
`FastifyRequest` never crosses the boundary itself.

## Good: the `reviewer-core` consumption boundary

```ts
// server/src/modules/reviews/run-executor.ts:187-191
// ---- Engine: assemble → single-pass → grounding -----------------------
// The pure review pipeline lives in @devdigest/reviewer-core (shared with
// the CI runner). The service owns only I/O: repo-intel context resolution
// above, and persistence + observability below.
const outcome = await reviewPullRequest({ /* ... */ });
```

`reviewPullRequest` is called from `ReviewRunExecutor` — a class used by
`ReviewService` — never from `routes.ts`. Everything the pure engine needs
(diff, repo map, an injected `llm`, cancellation check) is resolved by the
service first; the engine itself touches nothing external.

## Bad: `modules/polling/routes.ts` — fat handler, no service/repository

```ts
// server/src/modules/polling/routes.ts (abridged)
app.post('/repos/:id/poll', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(container, req);
  const [repo] = await container.db.select().from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
  if (!repo) throw new NotFoundError('Repo not found');

  const gh = await container.github();
  const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
  for (const pr of pulls) {
    await container.db.insert(t.pullRequests).values({ /* ... */ }).onConflictDoUpdate({ /* ... */ });
  }
  await container.db.update(t.repos).set({ lastPolledAt: new Date() }).where(eq(t.repos.id, repo.id));
  return { synced, reviewTriggered: false };
});
```

This whole module is one route handler: a Drizzle read, a GitHub call, a
Drizzle upsert loop, and a Drizzle update, all inline. There's no
`service.ts` or `repository.ts` at all. If this module grows, it should
split the same way `agents`/`repos` already did:

```ts
// sketch — polling/repository.ts
export class PollingRepository {
  constructor(private db: Db) {}
  findRepo(workspaceId: string, repoId: string) { /* the select above */ }
  upsertPulls(repoId: string, pulls: GitHubPull[]) { /* the insert/onConflict loop */ }
  markPolled(repoId: string) { /* the update */ }
}

// sketch — polling/service.ts
export class PollingService {
  constructor(private container: Container) {}
  async poll(workspaceId: string, repoId: string) {
    const repo = await this.container.pollingRepo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const gh = await this.container.github();
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    await this.container.pollingRepo.upsertPulls(repo.id, pulls);
    await this.container.pollingRepo.markPolled(repo.id);
    return { synced: pulls.length, reviewTriggered: false };
  }
}

// sketch — polling/routes.ts
app.post('/repos/:id/poll', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.poll(workspaceId, req.params.id);
});
```

(`modules/pulls/routes.ts` and `modules/workspace/routes.ts` have the same
shape at larger/smaller scale — same fix applies.)

## Bad: `modules/settings/feature-models.ts` — looks layered, isn't

```ts
// server/src/modules/settings/feature-models.ts:36-44
export async function getFeatureModelOverride(
  container: Container,
  workspaceId: string,
  id: FeatureModelId,
): Promise<FeatureModelChoice | undefined> {
  const rows = await container.db
    .select({ key: t.settings.key, value: t.settings.value })
    .from(t.settings)
    .where(eq(t.settings.workspaceId, workspaceId));
  // ...
}
```

This takes a `Container` (not a `FastifyRequest`), so at a glance it looks
like a service function. But it imports `drizzle-orm` and queries
`container.db` directly instead of going through a `SettingsRepository` —
it's a repository query wearing a service's parameter list. The fix is the
same pattern as everywhere else: move the `select` into a
`SettingsRepository` method and have this function call that instead.

## The acceptable exception: `platform/jobs.ts`

`platform/jobs.ts` (`JobRunner`) also imports `drizzle-orm` and queries
`t.jobs` directly, outside any module's `repository.ts`. This is **not** a
violation to flag — it's genuinely cross-cutting platform infrastructure (the
job queue) owning its own infra table, not a feature module reaching into a
domain table it doesn't own. The rule is "a feature module must go through
its repository," not "nothing outside `modules/*/repository.ts` may ever
touch Drizzle."
