import type { Day } from './status.ts'
import type { Region, Result, State, Tick } from './types.ts'

export const RETAIN = 30 * 86400

export interface Event {
  monitor: string
  ts: number
  state: State
  detail?: { failed: Region[]; err?: string }
}

export async function saveTick(db: D1Database, t: Tick) {
  await db.prepare('INSERT OR REPLACE INTO ticks (ts, region, results) VALUES (?, ?, ?)').bind(t.ts, t.region, JSON.stringify(t.results)).run()
}

export async function ticksSince(db: D1Database, since: number): Promise<Tick[]> {
  const { results } = await db
    .prepare('SELECT ts, region, results FROM ticks WHERE ts >= ?')
    .bind(since)
    .all<{ ts: number; region: Region; results: string }>()
  return results.map((r) => ({ ...r, results: JSON.parse(r.results) }))
}

export async function series(db: D1Database, id: string, since: number) {
  const { results } = await db
    .prepare('SELECT ts, region, results -> ? AS r FROM ticks WHERE ts >= ? AND r IS NOT NULL ORDER BY ts')
    .bind(`$."${id}"`, since)
    .all<{ ts: number; region: Region; r: string }>()
  return results.map((x) => ({ ts: x.ts, region: x.region, r: JSON.parse(x.r) as Result }))
}

export async function prune(db: D1Database, before: number) {
  await db.prepare('DELETE FROM ticks WHERE ts < ?').bind(before).run()
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

export async function lastEvents(db: D1Database): Promise<Map<string, Event>> {
  const { results } = await db.prepare('SELECT monitor, max(ts) AS ts, state, detail FROM events GROUP BY monitor').all<any>()
  return new Map(results.map((r) => [r.monitor, toEvent(r)]))
}

export async function recentEvents(db: D1Database, monitor: string, limit = 20): Promise<Event[]> {
  const { results } = await db.prepare('SELECT * FROM events WHERE monitor = ? ORDER BY ts DESC LIMIT ?').bind(monitor, limit).all<any>()
  return results.map(toEvent)
}

export async function insertEvents(db: D1Database, events: Event[]) {
  const stmt = db.prepare('INSERT OR REPLACE INTO events (monitor, ts, state, detail) VALUES (?, ?, ?, ?)')
  await db.batch(events.map((e) => stmt.bind(e.monitor, e.ts, e.state, e.detail ? JSON.stringify(e.detail) : null)))
}
