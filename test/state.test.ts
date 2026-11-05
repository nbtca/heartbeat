import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BIN, BINS, extend, keep, keepFor, seed } from '../src/state.ts'
import type { Tick } from '../src/types.ts'

const T = 1_000_200
const tick = (ts: number, region: 'cn' | 'global', ms: number, o: 'ok' | 'fail' = 'ok', cert?: number): Tick => ({
  ts,
  region,
  results: { api: { o, ms, ...(cert !== undefined && { cert }) } },
})

test('keep replaces a repeated minute and drops ticks older than the window', () => {
  const old = tick(T - keepFor(900), 'global', 1)
  const kept = keep([old, tick(T - 60, 'global', 2), tick(T, 'global', 3)], tick(T, 'global', 4), T, 900)
  assert.deepEqual(kept.map((t) => [t.ts, t.results.api.ms]), [[T - 60, 2], [T, 4]])
})

test('extend appends the median of a bin, ignoring failed checks, and pads skipped bins', () => {
  const ticks = [tick(T, 'global', 30), tick(T + 60, 'global', 10), tick(T + 120, 'global', 20), tick(T + 180, 'global', 999, 'fail'), tick(T + 60, 'cn', 50, 'ok', 40)]
  const first = extend(undefined, ticks, T)
  assert.equal(first.at, T)
  assert.equal(first.bins.api!.global!.length, BINS)
  assert.equal(first.bins.api!.global!.at(-1), 20)
  assert.equal(first.bins.api!.cn!.at(-1), 50)
  assert.equal(first.cert.api, 40)

  const later = extend(first, [tick(T + 3 * BIN, 'global', 70)], T + 3 * BIN)
  assert.deepEqual(later.bins.api!.global!.slice(-4), [20, null, null, 70])
  assert.deepEqual(later.bins.api!.cn!.slice(-4), [50, null, null, null])
  assert.equal(extend(later, [], T + (BINS + 3) * BIN).bins.api, undefined, 'a monitor with no data left in the day is dropped')
  assert.equal(later.cert.api, 40, 'the last known certificate survives bins without one')
  assert.equal(extend(later, [], T + 3 * BIN), later, 'a bin is never appended twice')
})

test('seed builds a full day from raw ticks', () => {
  const at = T + 10 * BIN
  const chart = seed([tick(at - 5 * BIN, 'global', 15), tick(at, 'global', 25)], at)
  assert.equal(chart.at, at)
  const row = chart.bins.api!.global!
  assert.equal(row.length, BINS)
  assert.equal(row.at(-1), 25)
  assert.equal(row.at(-6), 15)
  assert.equal(row.filter((v) => v !== null).length, 2)
})
