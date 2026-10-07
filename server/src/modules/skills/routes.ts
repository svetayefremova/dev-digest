import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';
import { MAX_IMPORT_BYTES, MAX_VERSION_MESSAGE_LENGTH } from './constants.js';

/**
 * Skills module.
 *   GET    /skills                               → list (workspace-scoped), each with `usage`
 *   GET    /skills/:id                           → one skill (no `usage`)
 *   POST   /skills                               → create (manual, or a confirmed import)
 *   PUT    /skills/:id                           → update / toggle enabled (body change versions)
 *   DELETE /skills/:id                           → delete (agent links cascade)
 *   GET    /skills/:id/versions                  → body history, newest first
 *   POST   /skills/:id/versions/:version/restore → append a new version with an old body
 *   GET    /skills/:id/stats                     → 30-day usage stats
 *   POST   /skills/import/preview                → parse an uploaded .md/.zip; saves nothing
 */

/** Optional "What changed" note; blank → the server writes a default. */
const VersionMessage = z.string().trim().max(MAX_VERSION_MESSAGE_LENGTH).optional();

const CreateSkillBody = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().default(''),
  type: SkillType,
  body: z.string().trim().min(1),
  source: z.enum(['manual', 'imported_file']).optional(),
  enabled: z.boolean().optional(),
  message: VersionMessage,
  // The uploaded file a confirmed import came from (`SkillImportPreview.source_file`
  // or the upload's own name) — only used for the default "Imported from <file>".
  source_file: z.string().trim().max(255).optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  type: SkillType.optional(),
  body: z.string().trim().min(1).optional(),
  enabled: z.boolean().optional(),
  message: VersionMessage,
});

const RestoreParams = IdParams.extend({ version: z.coerce.number().int().min(1) });

const ImportPreviewBody = z.object({
  filename: z.string().min(1).max(255),
  // base64 inflates by 4/3; the raw-size limit is enforced again after decoding.
  content_base64: z.string().min(1).max(Math.ceil((MAX_IMPORT_BYTES * 4) / 3) + 4),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.versions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.post('/skills/:id/versions/:version/restore', { schema: { params: RestoreParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.restore(workspaceId, req.params.id, req.params.version);
    if ('missing' in result) {
      throw new NotFoundError(result.missing === 'skill' ? 'Skill not found' : 'Skill version not found');
    }
    return result.skill;
  });

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.stats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });

  app.post('/skills/import/preview', { schema: { body: ImportPreviewBody } }, async (req) => {
    await getContext(app.container, req);
    return service.previewImport(req.body.filename, req.body.content_base64);
  });
}
