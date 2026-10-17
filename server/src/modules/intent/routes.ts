import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * intent module (transport only: validate → one service call → map status).
 *   GET  /pulls/:id/intent  → the PR's persisted intent (404 when none yet)
 *   POST /pulls/:id/intent  → (re-)detect the intent now
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const rec = await container.intent.get(workspaceId, req.params.id);
    if (!rec) throw new NotFoundError('No intent detected for this pull request yet');
    return rec;
  });

  // Tight per-route limit: each call is an LLM request.
  app.post(
    '/pulls/:id/intent',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.intent.redetect(workspaceId, req.params.id, req.log);
    },
  );
}
