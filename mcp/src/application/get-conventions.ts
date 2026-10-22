import type { DevDigestApi } from '../api/types.js';
import { fail, ok, type Result } from '../domain/errors.js';
import { shapeConventions, truncate, type ResponseFormat, type ShapedConventions } from '../domain/shape.js';
import { UNTRUSTED_MARKER } from '../domain/constants.js';
import { resolveRepo } from './resolve.js';
import type { Output } from './types.js';

export async function getConventions(
  api: DevDigestApi,
  args: { repo?: string | undefined; status: 'accepted' | 'pending' | 'all'; limit: number; format: ResponseFormat },
): Promise<Result<Output<ShapedConventions & { pending: number }>>> {
  const repo = await resolveRepo(api, args.repo);
  if (!repo.ok) return repo;
  const scan = await api.conventions(repo.value.id);
  const name = repo.value.full_name;
  if (scan.scanned_at === null) {
    return fail(
      'not_scanned',
      `Conventions for ${name} were never scanned`,
      'Open the repo in the DevDigest UI → Conventions → Run Scan, then retry.',
    );
  }
  const shaped = shapeConventions(scan, { repo: name, status: args.status, limit: args.limit, format: args.format });
  const pending = scan.candidates.filter((c) => c.status === 'pending').length;
  const lines = shaped.conventions.map((c) => `- [${c.category}] ${c.rule} (${c.evidence})`);
  const head = `Conventions for ${name} (scanned ${scan.scanned_at}): showing ${shaped.shown} of ${shaped.total} (${args.status})`;
  const hint =
    shaped.total === 0 && args.status === 'accepted' && pending > 0
      ? `${pending} pending — call with status:'pending' or accept them in the DevDigest UI.`
      : shaped.shown < shaped.total
        ? 'Narrow with status/limit.'
        : '';
  return ok({
    structured: { ...shaped, pending },
    text: truncate([UNTRUSTED_MARKER, head, ...lines, hint].filter(Boolean).join('\n')),
  });
}
