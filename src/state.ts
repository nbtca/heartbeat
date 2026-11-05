import type { Event } from './db.ts'
import type { Region, Tick } from './types.ts'

// Pages need the last hour plus one verdict window (`span`); a little slack absorbs late probe reports.
export const keepFor = (span: number) => 3600 + span + 180

export const BIN = 300
export const BINS = 288

export interface Chart {
  at: number
  bins: Record<string, Partial<Record<Region, (number | null)[]>>>
  cert: Record<string, number>
}

export interface Packed {
  'recent:global': Tick[]
  'recent:cn': Tick[]
  last: Record<string, Event>
  chart: Chart
}

export const recentKey = (region: Region) => `recent:${region}` as const

export const keep = (ticks: Tick[], add: Tick, now: number, span: number) =>
  [...ticks.filter((t) => t.ts !== add.ts && t.ts > now - keepFor(span)), add].sort((a, b) => a.ts - b.ts)

const median = (xs: number[]) => (xs.length ? xs.toSorted((a, b) => a - b)[xs.length >> 1] : null)

// Median latency of every monitor and region over [from, from + BIN), ignoring failed checks.
function bin(ticks: Tick[], from: number) {
  const ms: Record<string, Partial<Record<Region, number[]>>> = {}
  for (const t of ticks) {
    if (t.ts < from || t.ts >= from + BIN) continue
    for (const [id, r] of Object.entries(t.results)) if (r.o !== 'fail') ((ms[id] ??= {})[t.region] ??= []).push(r.ms)
  }
  return ms
}

// Appends the bin starting at `from`, padding any bins the cron missed, and keeps the last day.
export function extend(chart: Chart | undefined, ticks: Tick[], from: number): Chart {
  const gap = chart ? (from - chart.at) / BIN : BINS
  if (chart && gap <= 0) return chart
  const next: Chart = { at: from, bins: {}, cert: { ...chart?.cert } }
  const fresh = bin(ticks, from)
  const ids = new Set([...Object.keys(chart?.bins ?? {}), ...Object.keys(fresh)])
  for (const id of ids) {
    for (const region of ['cn', 'global'] as Region[]) {
      const old = gap < BINS ? (chart?.bins[id]?.[region] ?? []) : []
      const value = median(fresh[id]?.[region] ?? [])
      const row = [...Array(BINS).fill(null), ...old, ...Array(Math.min(gap, BINS) - 1).fill(null), value].slice(-BINS)
      if (row.some((v) => v !== null)) (next.bins[id] ??= {})[region] = row
    }
  }
  for (const t of ticks.toSorted((a, b) => a.ts - b.ts)) for (const [id, r] of Object.entries(t.results)) if (r.cert !== undefined) next.cert[id] = r.cert
  return next
}

// Builds a whole day of bins at once, for the first run after switching to packed state.
export function seed(ticks: Tick[], at: number): Chart {
  let chart: Chart | undefined
  for (let from = at - (BINS - 1) * BIN; from <= at; from += BIN) chart = extend(chart, ticks, from)
  return chart!
}
