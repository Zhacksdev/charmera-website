import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync, readdirSync } from 'fs'

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}

const DB_PATH = join(DATA_DIR, 'booth.db')

export const db: any = new Database(DB_PATH)

db.pragma('journal_mode = WAL')

export function runMigrations(): void {
  const migrationsDir = join(__dirname, 'migrations')
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  
  const appliedMigrations = db
    .prepare('SELECT name FROM migrations')
    .all() as { name: string }[]
  
  const appliedSet = new Set(appliedMigrations.map(m => m.name))
  
  const migrationFiles = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()
  
  for (const file of migrationFiles) {
    if (appliedSet.has(file)) continue
    
    const migrationPath = join(migrationsDir, file)
    
    try {
      const migration = require('fs').readFileSync(migrationPath, 'utf-8')
      db.exec(migration)
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file)
      console.log(`Applied migration: ${file}`)
    } catch (err) {
      console.error(`Failed to apply migration ${file}:`, err)
      throw err
    }
  }
}

export function closeDb(): void {
  db.close()
}
