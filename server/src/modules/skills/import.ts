import { unzipSync, strFromU8 } from 'fflate';
import { SkillType, type SkillImportPreview } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import {
  DEFAULT_IMPORT_TYPE,
  MAX_IMPORT_BYTES,
  MAX_SKILL_MD_BYTES,
  SKILL_MD_FILENAME,
} from './constants.js';

/**
 * Skill import — turn an uploaded `.md` or `.zip` into a preview of the skill's
 * text core. Pure: bytes in, preview out. Nothing is written to disk or the DB
 * and nothing from the upload is ever executed.
 *
 * A skill is TEXT ONLY. From an archive we inflate exactly one entry — the
 * skill's markdown — and never decompress anything else: scripts, binaries and
 * reference files are reported back by name in `skipped_files` so the user can
 * see what was left out.
 */

const FRONTMATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Minimal `key: value` frontmatter reader (flat scalars only — all a skill needs). */
function parseFrontmatter(markdown: string): { meta: Record<string, string>; body: string } {
  const match = FRONTMATTER.exec(markdown);
  if (!match) return { meta: {}, body: markdown.replace(/^﻿/, '') };
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    meta[kv[1]!.toLowerCase()] = kv[2]!.trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return { meta, body: markdown.slice(match[0].length) };
}

function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

/** Build the preview from a skill's markdown. `fallbackName` is used when the
 *  file has neither a frontmatter name nor a top-level heading. */
function previewFromMarkdown(
  markdown: string,
  sourceFile: string,
  fallbackName: string,
  skippedFiles: string[],
): SkillImportPreview {
  const { meta, body } = parseFrontmatter(markdown);
  const trimmed = body.trim();
  if (trimmed.length === 0) throw new ValidationError('The skill file has no body');

  const heading = /^#\s+(.+)$/m.exec(trimmed)?.[1]?.trim();
  const type = SkillType.safeParse(meta.type);
  return {
    name: meta.name || heading || fallbackName,
    description: meta.description ?? '',
    type: type.success ? type.data : DEFAULT_IMPORT_TYPE,
    body: trimmed,
    source_file: sourceFile,
    skipped_files: skippedFiles,
  };
}

function isUnsafePath(path: string): boolean {
  return path.startsWith('/') || path.split(/[\\/]/).includes('..');
}

function previewFromZip(bytes: Uint8Array, filename: string): SkillImportPreview {
  // Pass 1 — read the central directory only (the filter rejects every entry,
  // so nothing is inflated) to learn the entry names and declared sizes.
  const entries: { name: string; originalSize: number }[] = [];
  try {
    unzipSync(bytes, {
      filter: (file) => {
        entries.push({ name: file.name, originalSize: file.originalSize });
        return false;
      },
    });
  } catch {
    throw new ValidationError('Could not read the archive — is it a valid .zip?');
  }

  const files = entries.filter((e) => !e.name.endsWith('/'));
  if (files.some((e) => isUnsafePath(e.name))) {
    throw new ValidationError('The archive contains an unsafe path');
  }

  // The skill's markdown: SKILL.md nearest the root, else a lone root-level .md.
  const depth = (name: string) => name.split('/').length;
  const skillMds = files
    .filter((e) => baseName(e.name).toLowerCase() === SKILL_MD_FILENAME)
    .sort((a, b) => depth(a.name) - depth(b.name));
  const rootMds = files.filter((e) => depth(e.name) === 1 && e.name.toLowerCase().endsWith('.md'));
  const target = skillMds[0] ?? (rootMds.length === 1 ? rootMds[0] : undefined);
  if (!target) throw new ValidationError('No SKILL.md found in the archive');
  if (target.originalSize > MAX_SKILL_MD_BYTES) {
    throw new ValidationError('The skill file inside the archive is too large');
  }

  // Pass 2 — inflate ONLY the skill markdown.
  const inflated = unzipSync(bytes, { filter: (file) => file.name === target.name })[target.name];
  if (!inflated) throw new ValidationError('Could not read the skill file from the archive');
  if (inflated.byteLength > MAX_SKILL_MD_BYTES) {
    throw new ValidationError('The skill file inside the archive is too large');
  }

  // Name fallback: the skill's folder, else the archive's own name.
  const folder = target.name.split('/').slice(-2, -1)[0];
  const fallbackName = folder ?? filename.replace(/\.zip$/i, '');
  const skipped = files.map((e) => e.name).filter((name) => name !== target.name);
  return previewFromMarkdown(strFromU8(inflated), target.name, fallbackName, skipped);
}

/** Parse an uploaded skill file into a preview. Throws ValidationError (422) on
 *  anything it can't safely turn into a skill. */
export function buildImportPreview(filename: string, bytes: Uint8Array): SkillImportPreview {
  if (bytes.byteLength === 0) throw new ValidationError('The uploaded file is empty');
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new ValidationError('The uploaded file is too large');

  const name = baseName(filename.replace(/\\/g, '/'));
  const lower = name.toLowerCase();
  if (lower.endsWith('.zip')) return previewFromZip(bytes, name);
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    if (bytes.byteLength > MAX_SKILL_MD_BYTES) throw new ValidationError('The skill file is too large');
    return previewFromMarkdown(strFromU8(bytes), name, name.replace(/\.(md|markdown)$/i, ''), []);
  }
  throw new ValidationError('Unsupported file type — upload a .md or .zip file');
}
