import { pgTable, uuid, text, integer, primaryKey, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { agents } from './agents';
import { skills } from './skills';

/** Project-context documents (repo-relative `.md` paths) attached to an agent, in saved order. */
export const agentContextDocs = pgTable(
  'agent_context_docs',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull().default(0),
    createdAt: now(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agentId, t.path] }),
    orderIdx: index('agent_context_docs_order_idx').on(t.agentId, t.order),
    pathIdx: index('agent_context_docs_path_idx').on(t.path),
  }),
);

/** Same, attached to a skill; inherited by every agent that enables the skill. */
export const skillContextDocs = pgTable(
  'skill_context_docs',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull().default(0),
    createdAt: now(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.skillId, t.path] }),
    orderIdx: index('skill_context_docs_order_idx').on(t.skillId, t.order),
    pathIdx: index('skill_context_docs_path_idx').on(t.path),
  }),
);
