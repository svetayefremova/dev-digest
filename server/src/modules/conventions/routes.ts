import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionCategory, ConventionStatus, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module.
 *   GET   /repos/:id/conventions             → last scan + candidates (rejected left out)
 *   POST  /repos/:id/conventions/extract     → scan the repo, persist verified candidates
 *   PUT   /repos/:id/conventions/status      → accept / un-accept every listed candidate
 *   PUT   /conventions/:id                   → accept / reject / edit one candidate
 *   GET   /repos/:id/conventions/skill-draft → the skill the accepted ones merge into; saves nothing
 *   POST  /repos/:id/conventions/skill       → save that skill and link it to agents
 */

const UpdateConventionBody = z.object({
  status: ConventionStatus.optional(),
  rule: z.string().trim().min(1).max(500).optional(),
  category: ConventionCategory.optional(),
});

const SetAllStatusBody = z.object({ status: z.enum(['pending', 'accepted']) });

const CreateSkillBody = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().default(''),
  type: SkillType.default('convention'),
  body: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  agent_ids: z.array(z.string().uuid()).min(1),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.put(
    '/repos/:id/conventions/status',
    { schema: { params: IdParams, body: SetAllStatusBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.setAllStatus(workspaceId, req.params.id, req.body.status);
    },
  );

  app.put('/conventions/:id', { schema: { params: IdParams, body: UpdateConventionBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const candidate = await service.update(workspaceId, req.params.id, req.body);
    if (!candidate) throw new NotFoundError('Convention not found');
    return candidate;
  });

  app.get('/repos/:id/conventions/skill-draft', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.skillDraft(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const created = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(201);
      return created;
    },
  );
}
