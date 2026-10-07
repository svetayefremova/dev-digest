import type { Settings, ConnTestRequest, ConnTestResult, SecretsStatus } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { SettingsRepository } from './repository.js';
import { rowsToSettings } from './helpers.js';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';

/**
 * F1 — settings service. Business logic for non-secret workspace prefs +
 * the connection-test flow. No HTTP and no raw SQL live here — persistence
 * goes through SettingsRepository.
 *
 * Secrets are NOT stored here — only non-secret prefs. test-connection reads
 * the key via SecretsProvider and does a cheap live call (listModels / GET user).
 */
export class SettingsService {
  private repo: SettingsRepository;

  constructor(private container: Container) {
    this.repo = new SettingsRepository(container.db);
  }

  async getSettings(workspaceId: string): Promise<Settings> {
    const rows = await this.repo.list(workspaceId);
    return rowsToSettings(rows);
  }

  async updateSettings(workspaceId: string, userId: string, patch: Record<string, unknown>): Promise<Settings> {
    for (const [key, value] of Object.entries(patch)) {
      await this.repo.upsert(workspaceId, userId, key, value);
    }
    return this.getSettings(workspaceId);
  }

  // Which provider keys are configured (booleans only — the values are NEVER
  // returned). Drives the "Configured / Not set" badges in the API Keys panel.
  async getSecretsStatus(): Promise<SecretsStatus> {
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, string][]).map(
        async ([provider, key]) => [provider, Boolean(await this.container.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  }

  async testConnection({ provider, key }: ConnTestRequest): Promise<ConnTestResult> {
    try {
      // If the UI supplied a key, persist it (BYO key) before testing so the
      // test reflects — and the rest of the app can use — the new value.
      if (key) {
        if (!this.container.secrets.set) {
          return { provider, ok: false, message: 'Secrets backend is read-only' };
        }
        await this.container.secrets.set(SECRET_KEY_BY_PROVIDER[provider], key);
        this.container.invalidateSecretCaches();
      }
      if (provider === GITHUB_PROVIDER) {
        const gh = await this.container.github();
        const login = await gh.currentLogin();
        return { provider, ok: true, message: `Connected as @${login}` };
      }
      const llm = await this.container.llm(provider);
      const models = await llm.listModels();
      return { provider, ok: true, message: `OK — ${models.length} models available` };
    } catch (err) {
      return { provider, ok: false, message: (err as Error).message };
    }
  }
}
