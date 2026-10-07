import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrMeta, PrDetail, PrReviewComment } from '@devdigest/shared';
import { PrCommentInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PullsService } from './service.js';

/**
 * F1 — pulls module. Transport layer only: parses requests and delegates all
 * business logic to PullsService.
 *   GET /repos/:id/pulls → list PRs for a repo (open + recently merged/closed,
 *                          synced from GitHub, persisted). `status` is GitHub's
 *                          merge state (open/merged/closed).
 *   GET /pulls/:id       → full PR detail (diff/files, commits, body, linked issue)
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new PullsService(app.container);

  app.get(
    '/repos/:id/pulls',
    // Tighter than the global 120/min: this handler can make up to
    // BACKFILL_LIMIT concurrent GitHub calls per request (see service.ts).
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req): Promise<PrMeta[]> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listForRepo(workspaceId, req.params.id, app.log.warn.bind(app.log));
    },
  );

  app.get(
    '/pulls/:id',
    // Tighter than the global 120/min: this handler calls GitHub for a fresh
    // detail refresh on every request.
    { schema: { params: IdParams }, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req): Promise<PrDetail> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getDetail(workspaceId, req.params.id, app.log.warn.bind(app.log));
    },
  );

  // ---- Inline review comments (Files changed tab) -------------------------
  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams } },
    async (req): Promise<PrReviewComment[]> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getComments(workspaceId, req.params.id, app.log.warn.bind(app.log));
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req): Promise<PrReviewComment> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.postComment(workspaceId, req.params.id, req.body);
    },
  );
}
