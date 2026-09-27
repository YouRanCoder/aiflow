import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { SCHEMA_VERSION } from './schema'

export type Db = BetterSQLite3Database<typeof schema>

const DDL = `
CREATE TABLE IF NOT EXISTS canvases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  root_node_id TEXT,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  params_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL,
  parent_id TEXT,
  title TEXT NOT NULL,
  anchor_json TEXT,
  quote_json TEXT,
  summary TEXT,
  summary_covers_node_id TEXT,
  collapsed INTEGER NOT NULL DEFAULT 0,
  pos_x REAL,
  pos_y REAL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_canvas ON nodes(canvas_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);

CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  question TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_turns_node ON turns(node_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  turn_id TEXT,
  node_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT,
  model TEXT,
  usage_prompt INTEGER NOT NULL DEFAULT 0,
  usage_completion INTEGER NOT NULL DEFAULT 0,
  usage_cached INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_node ON messages(node_id);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

function tableColumns(sqlite: Database.Database, table: string): Set<string> {
  const rows = sqlite.pragma(`table_info(${table})`) as Array<{ name: string }>
  return new Set(rows.map((row) => row.name))
}

/**
 * 老库不会因为 `CREATE TABLE IF NOT EXISTS` 拿到新列/新表，这里做幂等补齐。
 * 只增不删，可重复执行。
 */
function migrate(sqlite: Database.Database): void {
  // v2：画布描述
  if (!tableColumns(sqlite, 'canvases').has('description')) {
    sqlite.exec('ALTER TABLE canvases ADD COLUMN description TEXT')
  }

  // v3：节点从「一个问题」变成「话题容器」
  const nodeColumns = tableColumns(sqlite, 'nodes')
  if (nodeColumns.has('question') && !nodeColumns.has('title')) {
    sqlite.exec('ALTER TABLE nodes RENAME COLUMN question TO title')
  }

  const messageColumns = tableColumns(sqlite, 'messages')
  if (!messageColumns.has('turn_id')) {
    sqlite.exec('ALTER TABLE messages ADD COLUMN turn_id TEXT')
  }
  // 注意：这条索引必须在 turn_id 列存在之后建，不能放进上面的 DDL（老库此时还没有该列）
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_messages_turn ON messages(turn_id)')

  // 回填：还没有轮次的节点，用它的话题标题补一条轮次，并把旧的回答挂上去
  const pending = sqlite
    .prepare(
      `SELECT n.id AS id, n.title AS title, n.created_at AS createdAt
         FROM nodes n
        WHERE NOT EXISTS (SELECT 1 FROM turns t WHERE t.node_id = n.id)`
    )
    .all() as Array<{ id: string; title: string; createdAt: number }>

  if (pending.length === 0) return

  const insertTurn = sqlite.prepare(
    `INSERT INTO turns(id, node_id, question, order_index, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)`
  )
  const linkMessages = sqlite.prepare(
    `UPDATE messages SET turn_id = ? WHERE node_id = ? AND (turn_id IS NULL OR turn_id = '')`
  )

  const backfill = sqlite.transaction((rows: typeof pending) => {
    for (const row of rows) {
      const turnId = randomUUID()
      insertTurn.run(turnId, row.id, row.title, row.createdAt, row.createdAt)
      linkMessages.run(turnId, row.id)
    }
  })
  backfill(pending)
}

let instance: Db | null = null
let sqliteInstance: Database.Database | null = null

export function openDb(path: string): Db {
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(DDL)
  migrate(sqlite)
  sqlite
    .prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('schema_version', String(SCHEMA_VERSION))

  sqliteInstance = sqlite
  instance = drizzle(sqlite, { schema })
  return instance
}

export function getDb(): Db {
  if (!instance) throw new Error('数据库尚未初始化：请先调用 openDb()')
  return instance
}

export function closeDb(): void {
  sqliteInstance?.close()
  sqliteInstance = null
  instance = null
}
