import { z } from 'zod';
import { MAX_LIMIT, REPO_RE } from '../domain/constants.js';

export const repoArg = z
  .string()
  .regex(REPO_RE, 'repo must be owner/name')
  .optional()
  .describe('GitHub repo as owner/name, e.g. acme/api; optional when only one repo is connected');

export const limitArg = (def: number) => z.number().int().min(1).max(MAX_LIMIT).default(def);

export const formatArg = z.enum(['concise', 'detailed']).default('concise');
