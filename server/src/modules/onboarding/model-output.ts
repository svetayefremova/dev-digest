import { z } from 'zod';

/**
 * What the model returns for the tour. Deliberately loose (no `.max()`): length
 * and grounding limits are enforced in code so an over-long answer is trimmed,
 * not rejected.
 */
const PathReason = z.object({ path: z.string(), reason: z.string() });

export const OnboardingModelOutput = z.object({
  architecture: z.object({
    summary: z.string(),
    diagram: z.string().nullable(),
  }),
  criticalPathReasons: z.array(PathReason),
  readingPathReasons: z.array(PathReason),
  runCommands: z.array(z.string()),
  firstTasks: z.array(z.object({ title: z.string(), path: z.string() })),
});
export type OnboardingModelOutput = z.infer<typeof OnboardingModelOutput>;
