import type { Day } from './status.ts'
import type { Region, State, Tick } from './types.ts'

export interface Event {
  monitor: string
  ts: number
  state: State
  detail?: { failed: Region[]; err?: string }
}

// The ticks and the latest event per monitor live in a few packed rows, so the minutely cron and every
// page read a handful of rows instead of scanning ticks and events.
export async function readState<T extends object>(db: D1Database, keys: (keyof T & string)[]): Promise<Partial<T>> {
  const { results } = await db
    .prepare(`SELECT key, value FROM state WHERE key IN (${keys.map(() => '?').join(', ')})`)
    .bind(...keys)
    .all<{ key: string; value: string }>()
  return Object.fromEntries(results.map((r) => [r.key, JSON.parse(r.value)])) as Partial<T>
}

export const writeState = (db: D1Database, key: string, value: unknown) =>
  db.prepare('INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)').bind(key, JSON.stringify(value))

// Kept only to seed the latency chart once after the switch to packed state.
export async function ticksSince(db: D1Database, since: number): Promise<Tick[]> {
  const { results } = await db
    .prepare('SELECT ts, region, results FROM ticks WHERE ts >= ?')
    .bind(since)
    .all<{ ts: number; region: Region; results: string }>()
  return results.map((r) => ({ ...r, results: JSON.parse(r.results) }))
}

export async function loadDays(db: D1Database, from: string, lat = false): Promise<Map<string, Day>> {
  const { results } = await db
    .prepare(`SELECT day, stats${lat ? ', lat' : ''} FROM days WHERE day >= ?`)
    .bind(from)
    .all<{ day: string; stats: string; lat?: string }>()
  return new Map(results.map((r) => [r.day, { stats: JSON.parse(r.stats), lat: r.lat ? JSON.parse(r.lat) : {} }]))
}

export async function saveDay(db: D1Database, day: string, d: Day) {
  await db.prepare('INSERT OR REPLACE INTO days (day, stats, lat) VALUES (?, ?, ?)').bind(day, JSON.stringify(d.stats), JSON.stringify(d.lat)).run()
}

const toEvent = (r: { monitor: string; ts: number; state: State; detail: string | null }): Event =>
  r.detail ? { ...r, detail: JSON.parse(r.detail) } : { monitor: r.monitor, ts: r.ts, state: r.state }

export async function recentEvents(db: D1Database, monitor: string, limit = 20): Promise<Event[]> {
  const { results } = await db.prepare('SELECT * FROM events WHERE monitor = ? ORDER BY ts DESC LIMIT ?').bind(monitor, limit).all<any>()
  return results.map(toEvent)
}

export async function insertEvents(db: D1Database, events: Event[]) {
  const stmt = db.prepare('INSERT OR REPLACE INTO events (monitor, ts, state, detail) VALUES (?, ?, ?, ?)')
  await db.batch(events.map((e) => stmt.bind(e.monitor, e.ts, e.state, e.detail ? JSON.stringify(e.detail) : null)))
}
