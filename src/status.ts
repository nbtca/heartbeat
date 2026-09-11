import type { Incident } from './incidents.ts'
import { REGIONS, type Monitor, type Outcome, type Region, type Results, type State, type Tick } from './types.ts'

export const OFFSET = 8 * 3600
export const RANK: Record<State, number> = { nodata: 0, operational: 1, maintenance: 2, degraded: 3, partial: 4, major: 5 }
const IMPACT = { minor: 'degraded', major: 'partial', critical: 'major' } as const

export function worst(states: Iterable<State>): State {
  let w: State = 'nodata'
  for (const s of states) if (RANK[s] > RANK[w]) w = s
  return w
}

export function confirm(outcomes: Outcome[]): Outcome | undefined {
  if (!outcomes.length) return
  for (let i = 0; i + 1 < outcomes.length; i++) if (outcomes[i] === outcomes[i + 1]) return outcomes[i]
  return outcomes.some((o) => o !== 'ok') ? 'slow' : 'ok'
}

export type Window = Map<Region, Results[]>

export function window(ticks: Tick[], ts: number): Window {
  const w: Window = new Map()
  for (const t of ticks.toSorted((a, b) => b.ts - a.ts)) {
    if (t.ts > ts || t.ts <= ts - 180) continue
    w.set(t.region, [...(w.get(t.region) ?? []), t.results])
  }
  return w
}

export interface Verdict {
  state: State
  failed: Region[]
  err?: string
}

export function stateAt(m: Monitor, w: Window, ts: number, incidents: Incident[]): Verdict {
  const failed: Region[] = []
  const seen: Outcome[] = []
  let err: string | undefined
  for (const region of m.regions ?? REGIONS) {
    const rs = (w.get(region) ?? []).map((r) => r[m.id]).filter((r) => r !== undefined)
    const v = confirm(rs.map((r) => r.o))
    if (!v) continue
    seen.push(v)
    if (v === 'fail') {
      failed.push(region)
      err ??= rs.find((r) => r.err)?.err
    }
  }
  let state: State = !seen.length
    ? 'nodata'
    : failed.length === seen.length
      ? 'major'
      : failed.length
        ? 'partial'
        : seen.includes('slow')
          ? 'degraded'
          : 'operational'
  for (const i of incidents) {
    if (!i.components.includes(m.id) || ts < i.start || ts >= (i.end ?? Infinity)) continue
    if (i.impact === 'maintenance') return { state: 'maintenance', failed: [] }
    state = worst([state, IMPACT[i.impact]])
  }
  return err ? { state, failed, err } : { state, failed }
}

export type Counts = [ok: number, degraded: number, partial: number, major: number, maintenance: number, nodata: number]
export type Latency = Partial<Record<Region, number[]>>

export interface Day {
  stats: Record<string, Counts>
  lat: Record<string, Latency>
}

const SLOT: Record<State, number> = { operational: 0, degraded: 1, partial: 2, major: 3, maintenance: 4, nodata: 5 }
const BUCKETS = 32

export const bucket = (ms: number) => Math.max(0, Math.min(BUCKETS - 1, Math.round(3 * Math.log2(Math.max(ms, 1) / 10))))
export const bucketMs = (b: number) => Math.round(10 * 2 ** (b / 3))

export function record(day: Day, id: string, state: State) {
  ;(day.stats[id] ??= [0, 0, 0, 0, 0, 0])[SLOT[state]]++
}

export function sample(day: Day, id: string, region: Region, ms: number) {
  ;((day.lat[id] ??= {})[region] ??= Array(BUCKETS).fill(0))[bucket(ms)]++
}

export function merge(hs: (number[] | undefined)[]): number[] {
  const out = Array(BUCKETS).fill(0)
  for (const h of hs) h?.forEach((v, i) => (out[i] += v))
  return out
}

export function percentile(h: number[], p: number): number | undefined {
  const total = h.reduce((a, b) => a + b, 0)
  if (!total) return
  let acc = 0
  for (let b = 0; b < h.length; b++) if ((acc += h[b]) >= p * total) return bucketMs(b)
}

export const downtime = (c?: Counts) => (c ? c[3] + 0.3 * c[2] : 0)

export function uptime(counts: (Counts | undefined)[]): number | undefined {
  let bad = 0
  let seen = 0
  for (const c of counts) {
    if (!c) continue
    bad += downtime(c)
    seen += c[0] + c[1] + c[2] + c[3]
  }
  return seen ? 1 - bad / seen : undefined
}

export function barColor(c?: Counts): string {
  if (!c || c[0] + c[1] + c[2] + c[3] + c[4] === 0) return 'var(--nodata)'
  const w = downtime(c)
  if (!w) return c[4] ? 'var(--maintenance)' : 'var(--operational)'
  const pos = Math.min(1, Math.log1p(w) / Math.log1p(240))
  return pos < 0.5
    ? `color-mix(in oklab, var(--partial) ${Math.round(pos * 200)}%, var(--degraded))`
    : `color-mix(in oklab, var(--major) ${Math.round((pos - 0.5) * 200)}%, var(--partial))`
}

export const dayOf = (ts: number) => new Date((ts + OFFSET) * 1000).toISOString().slice(0, 10)

export const lastDays = (ts: number, n: number) => Array.from({ length: n }, (_, i) => dayOf(ts - (n - 1 - i) * 86400))
