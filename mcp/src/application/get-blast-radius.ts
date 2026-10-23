import type { BlastRadiusResponse } from '@devdigest/shared';
import type { DevDigestApi } from '../api/types.js';
import { ok, type Result } from '../domain/errors.js';
import { truncate } from '../domain/shape.js';
import { UNTRUSTED_MARKER } from '../domain/constants.js';
import { resolvePull, resolveRepo } from './resolve.js';
import type { Output } from './types.js';

export type ShapedBlast = BlastRadiusResponse & { repo: string; pr: number };

export async function getBlastRadius(
  api: DevDigestApi,
  args: { repo?: string | undefined; pr: number },
): Promise<Result<Output<ShapedBlast>>> {
  const repo = await resolveRepo(api, args.repo);
  if (!repo.ok) return repo;
  const pull = await resolvePull(api, repo.value, args.pr);
  if (!pull.ok) return pull;
  const blast = await api.blast(pull.value.prId);
  const name = repo.value.full_name;
  const lines: string[] = [UNTRUSTED_MARKER, `Blast radius for ${name}#${args.pr}: ${blast.summary}`];
  if (blast.degraded && blast.reason === 'no_changed_files') {
    lines.push("Changed files for this PR aren't loaded in DevDigest — open the PR in the DevDigest UI, then retry.");
  } else if (blast.degraded) {
    lines.push(
      `Index degraded (${blast.reason ?? 'unknown'}) — results may be incomplete; rebuild in the DevDigest UI.`,
    );
  }
  for (const d of blast.downstream) {
    lines.push(`- ${d.symbol} (${d.callers.length} callers)`);
    for (const c of d.callers) lines.push(`  ↳ ${c.file}:${c.line} (${c.name})`);
    if (d.endpoints_affected.length) lines.push(`  endpoints: ${d.endpoints_affected.join(', ')}`);
    if (d.crons_affected.length) lines.push(`  crons: ${d.crons_affected.join(', ')}`);
  }
  return ok({ structured: { ...blast, repo: name, pr: args.pr }, text: truncate(lines.join('\n')) });
}
