import type { ChatMessage } from '@devdigest/shared';
import { renderPrompt } from '../../platform/prompts.js';
import { wrapUntrusted } from '../../platform/prompt.js';
import { PROMPT_NAME, REASONED_ENTRIES } from './constants.js';
import { criticalCandidates, deriveCommands, detectStack, readingCandidates, truncateExcerpt } from './helpers.js';
import type { Excerpt, TourFacts } from './types.js';

function pathLines(facts: TourFacts, candidates: Array<{ path: string }>): string {
  return candidates
    .slice(0, REASONED_ENTRIES)
    .map((c) => {
      const importers = facts.intel.importers[c.path] ?? 0;
      const endpoints = facts.intel.endpoints[c.path] ?? 0;
      return `- ${c.path} (imported by ${importers}, endpoints ${endpoints})`;
    })
    .join('\n');
}

/**
 * System + user messages for the single tour call. Facts are index-derived;
 * README, package.json, compose and file excerpts are untrusted data.
 */
export async function buildModelMessages(facts: TourFacts, excerpts: readonly Excerpt[]): Promise<ChatMessage[]> {
  const system = await renderPrompt(PROMPT_NAME, { language: 'English' });
  const commands = deriveCommands(facts.run).map((c) => c.command);
  const critical = criticalCandidates(facts.intel);
  const reading = readingCandidates(facts.intel);

  const factBlock = [
    `Stack: ${detectStack(facts.run).join(', ') || 'unknown'}`,
    `Top-level directories: ${facts.run.topLevelDirs.join(', ') || 'none'}`,
    `Allowed run commands: ${commands.join(' | ') || 'none'}`,
    `Environment variable names: ${facts.run.envExampleNames.join(', ') || 'none'}`,
    '',
    'Critical-path candidates (write a reason for each):',
    pathLines(facts, critical) || '- none',
    '',
    'Reading-path candidates (write a reason for each):',
    pathLines(facts, reading) || '- none',
  ].join('\n');

  const parts = [wrapUntrusted('index-facts', factBlock)];
  for (const e of excerpts) parts.push(wrapUntrusted(e.label, truncateExcerpt(e.text)));
  return [
    { role: 'system', content: system },
    { role: 'user', content: parts.join('\n\n') },
  ];
}
