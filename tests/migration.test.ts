import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, openDb } from '@core/db'

/** v2 结构：节点是「一个问题」，messages 直接挂节点，没有 turns 表 */
const V2_DDL = `
CREATE TABLE canvases (
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
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL,
  parent_id TEXT,
  question TEXT NOT NULL,
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
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
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
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`

describe('数据库迁移：v2 → v3（节点变话题容器）', () => {
  let dir: string
  let dbPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiflow-migrate-'))
    dbPath = join(dir, 'aiflow.db')
  })

  afterEach(() => {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  })

  function seedV2(): void {
    const raw = new Database(dbPath)
    raw.exec(V2_DDL)
    raw
      .prepare(
        'INSERT INTO canvases(id,title,description,root_node_id,provider_id,model,params_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
      )
      .run('cv1', '画布', null, 'n1', 'openai', 'gpt-4o-mini', null, 1000, 1000)
    raw
      .prepare(
        'INSERT INTO nodes(id,canvas_id,parent_id,question,created_at,updated_at) VALUES (?,?,?,?,?,?)'
      )
      .run('n1', 'cv1', null, 'C语言指针', 1000, 1000)
    raw
      .prepare(
        'INSERT INTO nodes(id,canvas_id,parent_id,question,created_at,updated_at) VALUES (?,?,?,?,?,?)'
      )
      .run('n2', 'cv1', 'n1', '什么是地址', 1001, 1001)
    raw
      .prepare(
        'INSERT INTO messages(id,node_id,role,content,is_active,provider_id,model,usage_prompt,usage_completion,usage_cached,error,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
      )
      .run('m1', 'n1', 'assistant', '指针是一个变量', 1, 'openai', 'gpt-4o-mini', 10, 5, 0, null, 1000)
    raw
      .prepare(
        'INSERT INTO messages(id,node_id,role,content,is_active,provider_id,model,usage_prompt,usage_completion,usage_cached,error,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
      )
      .run('m2', 'n2', 'assistant', '地址是内存编号', 1, 'openai', 'gpt-4o-mini', 20, 5, 0, null, 1001)
    raw.close()
  }

  function readRaw<T>(sql: string): T[] {
    const raw = new Database(dbPath, { readonly: true })
    try {
      return raw.prepare(sql).all() as T[]
    } finally {
      raw.close()
    }
  }

  it('question 变 title，每个节点补一条轮次，旧回答挂到轮次上', () => {
    seedV2()
    openDb(dbPath)

    const nodes = readRaw<{ id: string; title: string }>('SELECT id, title FROM nodes ORDER BY id')
    expect(nodes).toEqual([
      { id: 'n1', title: 'C语言指针' },
      { id: 'n2', title: '什么是地址' }
    ])

    const turns = readRaw<{ id: string; node_id: string; question: string; created_at: number }>(
      'SELECT id, node_id, question, created_at FROM turns ORDER BY node_id'
    )
    expect(turns.map((t) => [t.node_id, t.question])).toEqual([
      ['n1', 'C语言指针'],
      ['n2', '什么是地址']
    ])
    // 沿用节点创建时间，保证多轮排序稳定
    expect(turns[0].created_at).toBe(1000)

    const messages = readRaw<{ id: string; turn_id: string | null }>(
      'SELECT id, turn_id FROM messages ORDER BY id'
    )
    expect(messages[0].turn_id).toBe(turns[0].id)
    expect(messages[1].turn_id).toBe(turns[1].id)

    const version = readRaw<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'schema_version'"
    )
    expect(version[0].value).toBe('3')
  })

  it('重复迁移是幂等的：不会重复补轮次', () => {
    seedV2()
    openDb(dbPath)
    const first = readRaw<{ id: string }>('SELECT id FROM turns ORDER BY node_id')
    closeDb()

    openDb(dbPath)
    const second = readRaw<{ id: string }>('SELECT id FROM turns ORDER BY node_id')
    expect(second.map((t) => t.id)).toEqual(first.map((t) => t.id))
    expect(second.length).toBe(2)
  })
})
