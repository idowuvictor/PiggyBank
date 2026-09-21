import sqlite3 from 'sqlite3'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

const DB_DIR = path.join(__dirname, '../data')
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR)
}

const dbPath = path.join(DB_DIR, 'piggybank.sqlite')
const db = new sqlite3.Database(dbPath)

export function run(sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export function get(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

export function all(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
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
      status TEXT NOT NULL DEFAULT 'Active', -- 'Active', 'Completed', 'Closed'
      created_at_block INTEGER NOT NULL,
      created_at_time INTEGER NOT NULL
    )
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id TEXT NOT NULL,
      event_type TEXT NOT NULL, -- 'RoundPaid', 'CatchUpExecuted', 'EmergencyWithdrawn', 'PlanCompleted'
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
    // Electroneum Testnet piggybank deployment block
    await run(`INSERT INTO sync_state (id, last_synced_block) VALUES (1, 15356368)`)
  }

  console.log('Database initialized at', dbPath)
}

export { db }
