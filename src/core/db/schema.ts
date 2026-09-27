import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const canvases = sqliteTable('canvases', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  rootNodeId: text('root_node_id'),
  providerId: text('provider_id').notNull(),
  model: text('model').notNull(),
  paramsJson: text('params_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const nodes = sqliteTable(
  'nodes',
  {
    id: text('id').primaryKey(),
    canvasId: text('canvas_id').notNull(),
    parentId: text('parent_id'),
    title: text('title').notNull(),
    anchorJson: text('anchor_json'),
    quoteJson: text('quote_json'),
    summary: text('summary'),
    summaryCoversNodeId: text('summary_covers_node_id'),
    collapsed: integer('collapsed').notNull().default(0),
    posX: real('pos_x'),
    posY: real('pos_y'),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [index('idx_nodes_canvas').on(t.canvasId), index('idx_nodes_parent').on(t.parentId)]
)

export const turns = sqliteTable(
  'turns',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id').notNull(),
    question: text('question').notNull(),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [index('idx_turns_node').on(t.nodeId)]
)

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    turnId: text('turn_id'),
    nodeId: text('node_id').notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(),
    isActive: integer('is_active').notNull().default(0),
    providerId: text('provider_id'),
    model: text('model'),
    usagePrompt: integer('usage_prompt').notNull().default(0),
    usageCompletion: integer('usage_completion').notNull().default(0),
    usageCached: integer('usage_cached').notNull().default(0),
    error: text('error'),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('idx_messages_node').on(t.nodeId), index('idx_messages_turn').on(t.turnId)]
)

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const SCHEMA_VERSION = 3
