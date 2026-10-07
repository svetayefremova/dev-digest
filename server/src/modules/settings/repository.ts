import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * F1 — settings data-access. The ONLY file in this module (and the only place
 * `feature-models.ts` reaches for a workspace's settings) that touches the
 * `settings` table directly.
 */
export interface SettingsRow {
  key: string;
  value: unknown;
}

export class SettingsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SettingsRow[]> {
    return this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
  }

  async upsert(workspaceId: string, userId: string | null, key: string, value: unknown): Promise<void> {
    await this.db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoUpdate({
        target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
        set: { value },
      });
  }
}
