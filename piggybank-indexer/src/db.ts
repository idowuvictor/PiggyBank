import { Pool } from 'pg'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
dotenv.config()

const usePostgres = !!process.env.DATABASE_URL

let pgPool: Pool | null = null
let sqliteDb: any = null

if (usePostgres) {
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })
} else {
  const sqlite3 = require('sqlite3')
  const DB_DIR = path.join(__dirname, '../data')
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR)
  }
  sqliteDb = new sqlite3.Database(path.join(DB_DIR, 'piggybank.sqlite'))
}

// Convert `?` to `$1, $2` for Postgres
function convertSql(sql: string): string {
  if (!usePostgres) return sql
  let i = 1
  return sql.replace(/\?/g, () => '$' + (i++))
}

export async function run(sql: string, params: any[] = []): Promise<void> {
  if (usePostgres) {
    await pgPool!.query(convertSql(sql), params)
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb!.run(sql, params, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}

export async function get(sql: string, params: any[] = []): Promise<any> {
  if (usePostgres) {
    const res = await pgPool!.query(convertSql(sql), params)
    return res.rows[0] || null
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb!.get(sql, params, (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })
  }
}

export async function all(sql: string, params: any[] = []): Promise<any[]> {
  if (usePostgres) {
    const res = await pgPool!.query(convertSql(sql), params)
    return res.rows
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb!.all(sql, params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
  }
}

export async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_synced_block INTEGER NOT NULL
    )
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS plans (
      plan_id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      token TEXT NOT NULL,
      title TEXT NOT NULL,
      goal TEXT NOT NULL,
      interval INTEGER NOT NULL,
      total_rounds INTEGER NOT NULL,
      round_amount TEXT NOT NULL,
      current_round_index INTEGER NOT NULL DEFAULT 0,
      amount_saved TEXT NOT NULL DEFAULT '0',
      fees_paid TEXT NOT NULL DEFAULT '0',
      status TEXT NOT NULL DEFAULT 'Active',
      created_at_block INTEGER NOT NULL,
      created_at_time INTEGER NOT NULL
    )
  `)

  const idCol = usePostgres ? 'id SERIAL PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT'

  await run(`
    CREATE TABLE IF NOT EXISTS events (
      ${idCol},
      plan_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      amount TEXT NOT NULL DEFAULT '0',
      fee TEXT NOT NULL DEFAULT '0',
      round_index INTEGER,
      tx_hash TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY(plan_id) REFERENCES plans(plan_id)
    )
  `)

  // Initialize sync state if empty
  const state = await get(`SELECT last_synced_block FROM sync_state WHERE id = 1`)
  if (!state) {
    const insertSql = usePostgres 
      ? `INSERT INTO sync_state (id, last_synced_block) VALUES (1, 15356719) ON CONFLICT DO NOTHING`
      : `INSERT OR IGNORE INTO sync_state (id, last_synced_block) VALUES (1, 15356719)`
    await run(insertSql)
  }

  console.log('Database initialized! Mode:', usePostgres ? 'PostgreSQL' : 'SQLite')
}

