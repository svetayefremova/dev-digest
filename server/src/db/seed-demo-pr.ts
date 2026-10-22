/**
 * Demo PR #482 changed files, with real unified-diff patches, so the Files
 * changed tab works offline: every Smart Diff role has a file (core, tests,
 * wiring, docs, boilerplate incl. a lock-file), and the seeded findings
 * (src/config.ts:12, src/api/users.ts:45) land on rendered diff lines.
 *
 * Totals match the PR row in seed.ts (9 files, +247 −38). Patches are short
 * excerpts — the per-file +/− stats are what GitHub reports for the full file.
 * The "secret" below is a fake placeholder, not a key format scanners match.
 */
export interface DemoPrFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
}

export const DEMO_PR_FILES: DemoPrFile[] = [
  {
    path: 'src/middleware/ratelimit.ts',
    additions: 84,
    deletions: 0,
    patch: [
      '@@ -0,0 +1,14 @@',
      "+import type { Req, Res, Next } from '../http';",
      "+import { redis } from '../redis';",
      "+import { bucketKey, limitFor } from './ratelimit-keys';",
      '+',
      '+export async function rateLimit(req: Req, res: Res, next: Next) {',
      '+  const key = bucketKey(req);',
      '+  const count = await redis.incr(key);',
      '+  if (count === 1) await redis.expire(key, 3600);',
      '+',
      '+  if (count > limitFor(req)) {',
      '+    return res.status(429).end();',
      '+  }',
      '+  return next();',
      '+}',
    ].join('\n'),
  },
  {
    path: 'src/api/public/webhooks.ts',
    additions: 31,
    deletions: 6,
    patch: [
      '@@ -58,7 +58,10 @@ import { db } from "../../db";',
      ' ',
      ' export async function webhookHandler(req: Req, res: Res) {',
      '-  const target = req.body.url;',
      '-  await fetch(target, { method: "POST" });',
      '+  const target = req.body.callback_url;',
      '+  const account = await db.accounts.find(req.accountId);',
      '+  const token = account.apiToken;',
      '+  await fetch(target, { method: "POST", headers: { Authorization: token } });',
      '+  await audit.log("webhook.forwarded", { accountId: req.accountId });',
      '   return res.status(202).end();',
      ' }',
      ' ',
    ].join('\n'),
  },
  {
    path: 'src/config.ts',
    additions: 4,
    deletions: 0,
    patch: [
      "@@ -8,5 +8,9 @@ import { z } from 'zod';",
      ' ',
      ' export const config = {',
      '   port: Number(process.env.PORT ?? 3000),',
      '+  redisUrl: process.env.REDIS_URL,',
      '+  stripeKey: "sk_live_demo_placeholder_not_a_real_key",',
      '+  rateLimitPerHour: Number(process.env.RATE_LIMIT ?? 1000),',
      '+  rateLimitBurst: 50,',
      "   logLevel: process.env.LOG_LEVEL ?? 'info',",
      ' };',
    ].join('\n'),
  },
  {
    path: 'src/api/users.ts',
    additions: 7,
    deletions: 2,
    patch: [
      '@@ -42,5 +42,9 @@ export const usersRouter = router();',
      ' export async function listUsers(req: Req, res: Res) {',
      '   const users = await db.users.findMany();',
      '-  // TODO: include posts',
      '-  return res.json(users);',
      '+  const result = [];',
      '+  for (const u of users) {',
      '+    const posts = await db.posts.findMany({ userId: u.id });',
      '+    result.push({ ...u, posts });',
      '+  }',
      '+  return res.json(result);',
      '+',
      ' }',
    ].join('\n'),
  },
  {
    path: 'test/ratelimit.test.ts',
    additions: 6,
    deletions: 0,
    patch: [
      '@@ -0,0 +1,6 @@',
      "+import { rateLimit } from '../src/middleware/ratelimit';",
      '+',
      "+it('returns 429 once the bucket is empty', async () => {",
      '+  const res = await hitTimes(rateLimit, 1001);',
      '+  expect(res.status).toBe(429);',
      '+});',
    ].join('\n'),
  },
  {
    path: 'src/api/public/index.ts',
    additions: 12,
    deletions: 2,
    patch: [
      '@@ -1,3 +1,4 @@',
      "-export { publicRouter } from './router';",
      "-export { webhookHandler } from './webhooks';",
      "+export { publicRouter } from './router';",
      "+export { webhookHandler } from './webhooks';",
      "+export { rateLimit } from '../../middleware/ratelimit';",
      ' ',
    ].join('\n'),
  },
  {
    path: 'src/server.ts',
    additions: 8,
    deletions: 1,
    patch: [
      '@@ -20,3 +20,4 @@ const app = createApp();',
      "-app.use('/public', publicRouter);",
      "+app.use('/public', rateLimit, publicRouter);",
      "+app.use('/webhooks', rateLimit);",
      ' ',
      ' app.listen(config.port);',
    ].join('\n'),
  },
  {
    path: 'docs/rate-limiting.md',
    additions: 3,
    deletions: 0,
    patch: [
      '@@ -0,0 +1,3 @@',
      '+# Rate limiting',
      '+',
      '+Public endpoints allow 1000 requests per hour per API key (burst 50).',
    ].join('\n'),
  },
  {
    path: 'package-lock.json',
    additions: 92,
    deletions: 27,
    patch: [
      '@@ -1204,1 +1204,9 @@',
      '     "node_modules/ioredis": {',
      '+      "version": "5.4.1",',
      '+      "resolved": "https://registry.npmjs.org/ioredis/-/ioredis-5.4.1.tgz",',
      '+      "license": "MIT",',
      '+      "dependencies": {',
      '+        "cluster-key-slot": "^1.1.0",',
      '+        "denque": "^2.1.0"',
      '+      }',
      '+    },',
    ].join('\n'),
  },
];
