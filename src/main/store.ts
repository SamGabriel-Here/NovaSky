/**
 * Local persistence.
 *
 * Everything NovaSky remembers — your location, your settings, quiz progress and the
 * cached satellite elements — lives on this machine in a SQLite database inside the
 * app's userData directory. Nothing is uploaded.
 *
 * better-sqlite3 is a native module. If it fails to load (an unrebuilt binary on an
 * unusual platform, for example) the store transparently falls back to a JSON file so
 * the app still works; `backend` reports which one is live.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Achievement, LessonProgress, Settings } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/settings'

export type StoreBackend = 'sqlite' | 'json'

export interface CacheEntry {
  value: string
  fetchedAt: string
}

export interface Store {
  backend: StoreBackend
  getSettings(): Settings
  saveSettings(patch: Partial<Settings>): Settings
  getAchievements(): Achievement[]
  unlockAchievement(id: string): Achievement[]
  getLessonProgress(): LessonProgress[]
  saveLessonProgress(progress: LessonProgress): LessonProgress[]
  getCache(key: string): CacheEntry | null
  putCache(key: string, value: string): void
  /** Removes cached network data but keeps settings and progress. */
  clearCache(): void
  /** Privacy control: erases everything, including the stored location. */
  clearAll(): void
  close(): void
}

interface SqliteLike {
  prepare(sql: string): {
    run(...params: unknown[]): unknown
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }
  exec(sql: string): unknown
  close(): void
  pragma(source: string): unknown
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS achievements (
  id          TEXT PRIMARY KEY,
  unlocked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lesson_progress (
  id         TEXT PRIMARY KEY,
  completed  INTEGER NOT NULL DEFAULT 0,
  score      REAL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cache (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
`

/** Settings are stored one row per key so a schema change never loses the others. */
function mergeSettings(rows: { key: string; value: string }[]): Settings {
  const settings = { ...DEFAULT_SETTINGS } as Record<string, unknown>
  for (const row of rows) {
    if (!(row.key in DEFAULT_SETTINGS)) continue
    try {
      settings[row.key] = JSON.parse(row.value)
    } catch {
      // A corrupt row falls back to the default rather than breaking startup.
    }
  }
  return settings as unknown as Settings
}

class SqliteStore implements Store {
  readonly backend = 'sqlite' as const

  constructor(private readonly db: SqliteLike) {
    this.db.pragma('journal_mode = WAL')
    this.db.exec(SCHEMA)
  }

  getSettings(): Settings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as {
      key: string
      value: string
    }[]
    return mergeSettings(rows)
  }

  saveSettings(patch: Partial<Settings>): Settings {
    const statement = this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      statement.run(key, JSON.stringify(value))
    }
    return this.getSettings()
  }

  getAchievements(): Achievement[] {
    const rows = this.db
      .prepare('SELECT id, unlocked_at FROM achievements ORDER BY unlocked_at')
      .all() as { id: string; unlocked_at: string }[]
    return rows.map((r) => ({ id: r.id, unlockedAt: r.unlocked_at }))
  }

  unlockAchievement(id: string): Achievement[] {
    this.db
      .prepare('INSERT OR IGNORE INTO achievements (id, unlocked_at) VALUES (?, ?)')
      .run(id, new Date().toISOString())
    return this.getAchievements()
  }

  getLessonProgress(): LessonProgress[] {
    const rows = this.db
      .prepare('SELECT id, completed, score, updated_at FROM lesson_progress')
      .all() as { id: string; completed: number; score: number | null; updated_at: string }[]
    return rows.map((r) => ({
      id: r.id,
      completed: r.completed === 1,
      score: r.score,
      updatedAt: r.updated_at
    }))
  }

  saveLessonProgress(progress: LessonProgress): LessonProgress[] {
    this.db
      .prepare(
        `INSERT INTO lesson_progress (id, completed, score, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           completed  = excluded.completed,
           score      = MAX(COALESCE(lesson_progress.score, -1), COALESCE(excluded.score, -1)),
           updated_at = excluded.updated_at`
      )
      .run(progress.id, progress.completed ? 1 : 0, progress.score, new Date().toISOString())
    return this.getLessonProgress()
  }

  getCache(key: string): CacheEntry | null {
    const row = this.db.prepare('SELECT value, fetched_at FROM cache WHERE key = ?').get(key) as
      | { value: string; fetched_at: string }
      | undefined
    return row ? { value: row.value, fetchedAt: row.fetched_at } : null
  }

  putCache(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO cache (key, value, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at'
      )
      .run(key, value, new Date().toISOString())
  }

  clearCache(): void {
    this.db.exec('DELETE FROM cache')
  }

  clearAll(): void {
    this.db.exec('DELETE FROM cache; DELETE FROM settings; DELETE FROM achievements; DELETE FROM lesson_progress;')
  }

  close(): void {
    this.db.close()
  }
}

interface JsonShape {
  settings: Record<string, unknown>
  achievements: Achievement[]
  lessons: LessonProgress[]
  cache: Record<string, CacheEntry>
}

const EMPTY: JsonShape = { settings: {}, achievements: [], lessons: [], cache: {} }

/** Fallback used when the native SQLite binding is unavailable. */
class JsonStore implements Store {
  readonly backend = 'json' as const
  private data: JsonShape

  constructor(private readonly file: string) {
    this.data = this.read()
  }

  private read(): JsonShape {
    if (!existsSync(this.file)) return structuredClone(EMPTY)
    try {
      return { ...structuredClone(EMPTY), ...JSON.parse(readFileSync(this.file, 'utf8')) }
    } catch {
      return structuredClone(EMPTY)
    }
  }

  private write(): void {
    // Write to a sibling file and rename, so a crash mid-write cannot corrupt the store.
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, JSON.stringify(this.data, null, 2), 'utf8')
    renameSync(temporary, this.file)
  }

  getSettings(): Settings {
    return mergeSettings(
      Object.entries(this.data.settings).map(([key, value]) => ({
        key,
        value: JSON.stringify(value)
      }))
    )
  }

  saveSettings(patch: Partial<Settings>): Settings {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      this.data.settings[key] = value
    }
    this.write()
    return this.getSettings()
  }

  getAchievements(): Achievement[] {
    return [...this.data.achievements]
  }

  unlockAchievement(id: string): Achievement[] {
    if (!this.data.achievements.some((a) => a.id === id)) {
      this.data.achievements.push({ id, unlockedAt: new Date().toISOString() })
      this.write()
    }
    return this.getAchievements()
  }

  getLessonProgress(): LessonProgress[] {
    return [...this.data.lessons]
  }

  saveLessonProgress(progress: LessonProgress): LessonProgress[] {
    const existing = this.data.lessons.find((l) => l.id === progress.id)
    if (existing) {
      existing.completed = progress.completed
      existing.score = Math.max(existing.score ?? -1, progress.score ?? -1)
      if (existing.score < 0) existing.score = null
      existing.updatedAt = new Date().toISOString()
    } else {
      this.data.lessons.push({ ...progress, updatedAt: new Date().toISOString() })
    }
    this.write()
    return this.getLessonProgress()
  }

  getCache(key: string): CacheEntry | null {
    return this.data.cache[key] ?? null
  }

  putCache(key: string, value: string): void {
    this.data.cache[key] = { value, fetchedAt: new Date().toISOString() }
    this.write()
  }

  clearCache(): void {
    this.data.cache = {}
    this.write()
  }

  clearAll(): void {
    this.data = structuredClone(EMPTY)
    this.write()
  }

  close(): void {
    /* nothing to release */
  }
}

/**
 * Opens the local store in `directory`, preferring SQLite.
 * `onFallback` is called with the load error when SQLite is unavailable.
 */
export function openStore(directory: string, onFallback?: (error: unknown) => void): Store {
  mkdirSync(directory, { recursive: true })
  try {
    // Required lazily so a missing native binary degrades instead of crashing startup.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3') as new (file: string) => SqliteLike
    return new SqliteStore(new Database(path.join(directory, 'novasky.db')))
  } catch (error) {
    onFallback?.(error)
    return new JsonStore(path.join(directory, 'novasky.json'))
  }
}
