import { describe, expect, it } from 'vitest';
import type { SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from '../src/modules/smart-diff/classify.js';

const CASES: Array<[string, SmartDiffRole]> = [
  // order / edge cases
  ['src/__tests__/__snapshots__/x.snap', 'boilerplate'],
  ['.claude/skills/security/SKILL.md', 'wiring'],
  ['e2e/README.md', 'tests'],
  ['package-lock.json', 'boilerplate'],
  ['src/middleware/ratelimit.ts', 'core'],
  // boilerplate
  ['Cargo.lock', 'boilerplate'],
  ['pnpm-lock.yaml', 'boilerplate'],
  ['client/package-lock.json', 'boilerplate'],
  ['yarn.lock', 'boilerplate'],
  ['dist/main.js', 'boilerplate'],
  ['build/out.css', 'boilerplate'],
  ['src/__snapshots__/data.json', 'boilerplate'],
  ['fixtures/output.snap', 'boilerplate'],
  ['src/api.generated.ts', 'boilerplate'],
  ['public/vendor.min.js', 'boilerplate'],
  ['dist/index.js', 'boilerplate'],
  // tests
  ['src/a.test.ts', 'tests'],
  ['src/Button.test.tsx', 'tests'],
  ['src/db.it.test.ts', 'tests'],
  ['src/a.spec.ts', 'tests'],
  ['server/test/helpers/db.ts', 'tests'],
  ['pkg/tests/fixture.json', 'tests'],
  ['src/__tests__/util.ts', 'tests'],
  ['e2e/specs/flow.json', 'tests'],
  ['src/index.test.ts', 'tests'],
  // wiring
  ['src/modules/index.ts', 'wiring'],
  ['lib/index.js', 'wiring'],
  ['vitest.config.ts', 'wiring'],
  ['tsconfig.build.json', 'wiring'],
  ['.eslintrc.json', 'wiring'],
  ['.env.example', 'wiring'],
  ['docker-compose.dev.yml', 'wiring'],
  ['.github/workflows/ci.yml', 'wiring'],
  ['.github/README.md', 'wiring'],
  // docs
  ['notes/guide.md', 'docs'],
  ['docs/diagram.png', 'docs'],
  ['README', 'docs'],
  ['server/README.rst', 'docs'],
  ['CHANGELOG.txt', 'docs'],
  ['LICENSE', 'docs'],
  // core
  ['server/src/modules/smart-diff/service.ts', 'core'],
  ['client/src/app/page.tsx', 'core'],
];

describe('classifyFile', () => {
  it.each(CASES)('%s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});
