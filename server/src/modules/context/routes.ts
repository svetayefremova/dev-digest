import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SetContextAttachmentsBody } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ContextService } from './service.js';

/**
 * Project context.
 *   GET /repos/:id/context              → every .md in the checkout (category, tokens, used-by)
 *   GET /repos/:id/context/file?path=   → one document's text for the preview
 *   GET|PUT /agents/:id/context         → documents attached to an agent (ordered)
 *   GET|PUT /skills/:id/context         → documents attached to a skill (ordered)
 */

const FileQuery = z.object({ path: z.string().min(1).max(1024) });

export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.contextDocs;

  app.get('/repos/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const started = Date.now();
    const list = await service.list(workspaceId, req.params.id);
    req.log.info(
      { event: 'context.scan', repo_id: req.params.id, files: list.docs.length, truncated: list.truncated, ms: Date.now() - started },
      'project context scanned',
    );
    return list;
  });

  app.get('/repos/:id/context/file', { schema: { params: IdParams, querystring: FileQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.read(workspaceId, req.params.id, req.query.path);
  });

  app.get('/agents/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getAgentDocs(workspaceId, req.params.id);
  });

  app.put(
    '/agents/:id/context',
    { schema: { params: IdParams, body: SetContextAttachmentsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.setAgentDocs(workspaceId, req.params.id, req.body.paths);
    },
  );

  app.get('/skills/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getSkillDocs(workspaceId, req.params.id);
  });

  app.put(
    '/skills/:id/context',
    { schema: { params: IdParams, body: SetContextAttachmentsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.setSkillDocs(workspaceId, req.params.id, req.body.paths);
    },
  );
}
