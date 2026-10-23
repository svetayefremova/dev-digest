/**
 * onboarding HTTP module.
 *
 *   GET  /repos/:id/onboarding           → OnboardingTourState (never calls a model)
 *   POST /repos/:id/onboarding/generate  → 202 new generation / 200 the one already running
 *
 * Registers the generate job handler once at app boot.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { GenerateOnboardingResponse, OnboardingTourState } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OnboardingService } from './service.js';

export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new OnboardingService(container);
  service.registerJobHandlers(app.log);

  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams, response: { 200: OnboardingTourState } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getState(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/onboarding/generate',
    { schema: { params: IdParams, response: { 200: GenerateOnboardingResponse, 202: GenerateOnboardingResponse } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const { generation, created } = await service.startGeneration(workspaceId, req.params.id);
      reply.code(created ? 202 : 200);
      return { generation };
    },
  );
}
