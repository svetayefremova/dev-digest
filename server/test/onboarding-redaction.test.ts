import { describe, it, expect } from 'vitest';
import {
  redactCompose,
  redactPackageJson,
  redactText,
  containsSecret,
  stripMarkdownLinks,
} from '../src/modules/onboarding/helpers.js';

const COMPOSE = [
  'services:',
  '  db:',
  '    image: postgres:16',
  '    ports:',
  '      - "5432:5432"',
  '    environment:',
  '      POSTGRES_PASSWORD: hunter2',
  '  api:',
  '    image: acme/api:latest',
  '    depends_on:',
  '      - db',
  '    environment:',
  '      - API_KEY=abc123xyz',
  '      - NODE_ENV=production',
  '',
].join('\n');

describe('onboarding redaction of secrets before the model call (compose, package.json, text)', () => {
  it('RQ58: a compose file keeps services, images, ports and env names but drops env values', () => {
    const r = redactCompose(COMPOSE);
    for (const keep of ['db:', 'api:', 'postgres:16', 'acme/api:latest', '5432:5432', 'POSTGRES_PASSWORD', 'API_KEY', 'depends_on']) {
      expect(r.text).toContain(keep);
    }
    expect(r.text).not.toContain('hunter2');
    expect(r.text).not.toContain('abc123xyz');
    expect(r.secrets).toEqual(expect.arrayContaining(['hunter2', 'abc123xyz']));
  });

  it('RQ58: package.json keeps only name, scripts and dependency names', () => {
    const r = redactPackageJson(
      JSON.stringify({
        name: 'payments-api',
        version: '9.9.9',
        scripts: { dev: 'tsx watch src/server.ts' },
        dependencies: { fastify: '^5.0.0' },
        devDependencies: { vitest: '^2.0.0' },
        config: { deployToken: 'tok-config-value-123' },
        repository: { url: 'https://user:ghp_abcdefghijklmnopqrstuvwxyz0123456789@github.com/a/b.git' },
        publishConfig: { registry: 'https://registry.example.test' },
      }),
    );
    expect(r.text).toContain('payments-api');
    expect(r.text).toContain('tsx watch src/server.ts');
    expect(r.text).toContain('fastify');
    expect(r.text).toContain('vitest');
    expect(r.text).not.toContain('^5.0.0');
    expect(r.text).not.toContain('config');
    expect(r.text).not.toContain('tok-config-value-123');
    expect(r.text).not.toContain('ghp_');
    expect(r.text).not.toContain('registry.example.test');
  });

  it('RQ58: README lines with secret-keyed assignments lose their values, ordinary prose stays', () => {
    const readme = [
      '# Payments API',
      'Run the service with npm run dev and open the dashboard.',
      'SECRET_TOKEN=s3cr3tvalue99',
      'password: correcthorse',
      'Contact the team for access.',
    ].join('\n');
    const r = redactText(readme);
    expect(r.text).toContain('# Payments API');
    expect(r.text).toContain('Run the service with npm run dev and open the dashboard.');
    expect(r.text).toContain('Contact the team for access.');
    expect(r.text).toContain('SECRET_TOKEN');
    expect(r.text).not.toContain('s3cr3tvalue99');
    expect(r.text).not.toContain('correcthorse');
    expect(r.secrets).toEqual(expect.arrayContaining(['s3cr3tvalue99', 'correcthorse']));
  });

  it('RQ58: well-known token shapes (sk-, ghp_, AKIA, PEM block) are redacted wherever they appear', () => {
    const sk = 'sk-abcdefghijklmnop1234567890';
    const gh = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
    const aws = 'AKIAABCDEFGHIJKLMNOP';
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAxyz\n-----END RSA PRIVATE KEY-----';
    const text = `Use ${sk} for the demo.\nClone with ${gh} in the URL.\nKey id ${aws} is rotated.\n${pem}\nThe end.`;
    const r = redactText(text);
    for (const s of [sk, gh, aws, 'MIIEowIBAAKCAQEAxyz']) expect(r.text).not.toContain(s);
    expect(r.text).toContain('The end.');
    expect(r.secrets).toEqual(expect.arrayContaining([sk, gh, aws]));
  });

  it('RQ58: model text that echoes a redacted secret is detected, text without it is not', () => {
    const secrets = ['hunter2hunter2'];
    expect(containsSecret('The db password is hunter2hunter2.', secrets)).toBe(true);
    expect(containsSecret('The db uses a password from the environment.', secrets)).toBe(false);
  });

  it('RQ58: harmless prose keys (author, authors, authorship) are kept unchanged', () => {
    const lines = ['author: Jane Doe', 'authors: A, B', 'authorship: x'];
    const r = redactText(lines.join('\n'));
    expect(r.text).toBe(lines.join('\n'));
    expect(r.secrets).toEqual([]);
  });

  it('RQ58: auth/key/password/secret style keys lose their values', () => {
    const cases: Array<[string, string]> = [
      ['AUTH_TOKEN=abcd1234', 'abcd1234'],
      ['auth-key: zz99yy', 'zz99yy'],
      ['apiKey: qwer5678', 'qwer5678'],
      ['DB_PASSWORD=hunter', 'hunter'],
      ['access_key=AKIAxxxx', 'AKIAxxxx'],
      ['client_secret: s3cr', 's3cr'],
    ];
    for (const [line, value] of cases) {
      const r = redactText(line);
      expect(r.text, line).not.toContain(value);
      expect(r.text, line).toContain(line.split(/[:=]/)[0]!);
      expect(r.secrets, line).toContain(value);
    }
  });

  it('RQ58: a redacted 4-5 character value echoed by the model is detected', () => {
    const r = redactText('PWD=ab12');
    expect(r.text).not.toContain('ab12');
    expect(containsSecret('The password is ab12 per the README.', r.secrets)).toBe(true);
  });

  it('RQ58: trivial values (true, 1234, changeme) are not echo-detected', () => {
    for (const value of ['true', '1234', 'changeme']) {
      const r = redactText(`API_TOKEN=${value}`);
      expect(r.text).not.toContain(value);
      expect(containsSecret(`The flag is ${value} here.`, r.secrets)).toBe(false);
      expect(containsSecret(`The flag is ${value} here.`, [value])).toBe(false);
    }
  });
});

describe('onboarding model Markdown is stripped of external links and images', () => {
  it('RQ59: images are removed entirely', () => {
    const out = stripMarkdownLinks('See ![diagram](https://evil.test/x.png) and ![ref img][r1] here.');
    expect(out).toContain('See');
    expect(out).toContain('here.');
    expect(out).not.toContain('![');
    expect(out).not.toContain('evil.test');
    expect(out).not.toContain('diagram');
  });

  it('RQ59: [text](url) becomes plain text and the url disappears', () => {
    const out = stripMarkdownLinks('Read the [docs](https://evil.test/a) and [run](javascript:alert(1)) now.');
    expect(out).toContain('Read the docs and');
    expect(out).toContain('run');
    expect(out).not.toContain('evil.test');
    expect(out).not.toContain('javascript:');
  });

  it('RQ59: bare https URLs, autolinks and reference definitions are removed', () => {
    const out = stripMarkdownLinks(
      ['Visit https://evil.test/path now.', 'Or <https://evil.test/auto> too.', 'A [ref link][r] here.', '[r]: https://evil.test/ref'].join('\n'),
    );
    expect(out).toContain('Visit');
    expect(out).toContain('A ref link here.');
    expect(out).not.toContain('evil.test');
    expect(out).not.toContain('[r]:');
  });

  it('RQ59: null stays null and plain prose is unchanged', () => {
    expect(stripMarkdownLinks(null)).toBeNull();
    expect(stripMarkdownLinks('Plain **bold** summary of the API.')).toBe('Plain **bold** summary of the API.');
  });
});
