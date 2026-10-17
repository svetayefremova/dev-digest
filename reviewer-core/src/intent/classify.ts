import { Intent } from '@devdigest/shared';
import type { LLMProvider } from '@devdigest/shared';
import { buildIntentPrompt } from './prompt.js';
import type { IntentInput, PromptStats } from './types.js';

export const INTENT_MAX_TOKENS = 600;

export interface ClassifyResult {
  intent: Intent;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  promptStats: PromptStats;
}

/**
 * One cheap structured LLM call that derives the PR's intent. The only side
 * effect is the injected `llm`. Schema enforcement and repair retries are the
 * provider's `completeStructured` contract.
 */
export async function classifyIntent(
  llm: LLMProvider,
  model: string,
  input: IntentInput,
): Promise<ClassifyResult> {
  const { system, user, stats } = buildIntentPrompt(input);
  const res = await llm.completeStructured<Intent>({
    model,
    schema: Intent,
    schemaName: 'Intent',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.1,
    maxTokens: INTENT_MAX_TOKENS,
  });
  return {
    intent: res.data,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
    promptStats: stats,
  };
}
