import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_file', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

// Usage roll-up shown on a skill card. Percentages are whole numbers 0-100 and
// null when there is no run data to compute them from (30-day window).
export const SkillUsage = z.object({
  agents: z.number().int(),
  pull_pct: z.number().nullable(),
  accept_pct: z.number().nullable(),
});
export type SkillUsage = z.infer<typeof SkillUsage>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  /** Exact token count of `body`, from the server tokenizer. */
  body_tokens: z.number().int(),
  /** Present on `GET /skills` only (one aggregate query for the whole list). */
  usage: SkillUsage.optional(),
});
export type Skill = z.infer<typeof Skill>;

// One row of a skill's body history. Only a body change creates a version;
// restoring an old one appends a NEW version rather than rewriting history.
export const SkillVersion = z.object({
  version: z.number().int(),
  message: z.string(),
  body: z.string(),
  created_at: z.string(),
  current: z.boolean(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

// Stats over the last 30 days of completed runs. Attribution is per RUN, not
// per skill: a run that carried four skills credits its findings to all four.
export const SkillStats = z.object({
  used_by: z.number().int(),
  pull_pct: z.number().nullable(),
  accept_pct: z.number().nullable(),
  findings_30d: z.number().int(),
  agents: z.array(z.object({ id: z.string(), name: z.string() })),
  by_category: z.array(z.object({ category: z.string(), count: z.number().int() })),
});
export type SkillStats = z.infer<typeof SkillStats>;

// What an uploaded .md / .zip yields BEFORE anything is saved: the skill's text
// core plus the archive entries that were deliberately left unread (scripts,
// binaries, references). A skill is text only — nothing in an archive executes.
export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  source_file: z.string(),
  skipped_files: z.array(z.string()),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
export const ConventionCandidate = z.object({
  id: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  accepted: z.boolean(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

// 30-day roll-up over an agent's completed runs. A metric with no data behind
// it is null, not 0.
export const AgentUsage = z.object({
  runs: z.number().int(),
  accept_pct: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
});
export type AgentUsage = z.infer<typeof AgentUsage>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
  // Number of skills linked AND enabled for this agent (list/detail reads only).
  skill_count: z.number().int().optional(),
  /** Present on `GET /agents` only (one aggregate query for the whole list). */
  usage: AgentUsage.optional(),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  // Per-agent switch: a linked-but-disabled skill keeps its position but is left
  // out of the prompt.
  enabled: z.boolean(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
