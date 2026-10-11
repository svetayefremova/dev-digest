/**
 * Config files read for a scan when they exist at the repo root — the tooling
 * that already encodes house style (lint, compiler, formatter).
 */
export const CONFIG_FILE_CANDIDATES = [
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'tsconfig.json',
  'tsconfig.base.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'prettier.config.js',
  'prettier.config.mjs',
  'prettier.config.cjs',
] as const;

/** How many top-ranked source files a scan samples next to the configs. */
export const SAMPLE_FILE_COUNT = 12;

/** A sampled file is cut to this many lines before it goes into the prompt. */
export const MAX_FILE_LINES = 300;

/** Longest evidence snippet stored for a candidate, in lines. */
export const MAX_SNIPPET_LINES = 12;

/** Shortest quoted line (whitespace-normalised) accepted as evidence. */
export const MIN_QUOTE_LENGTH = 4;

/** Most candidates one scan keeps (highest confidence first). */
export const MAX_CANDIDATES = 20;

/** `schemaName` of the single LLM call a scan makes. */
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

export const EXTRACTION_PROMPT = 'conventions.extract.system.md';

/** Name proposed for the skill the accepted candidates merge into. */
export const DEFAULT_SKILL_NAME = 'repo-conventions';

/** Message recorded on version 1 of a skill created from conventions. */
export const EXTRACTED_VERSION_MESSAGE = 'Extracted from conventions';
