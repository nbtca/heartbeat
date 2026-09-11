import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Incident } from '../src/incidents.ts'
import { barColor, bucket, bucketMs, confirm, dayOf, merge, percentile, record, stateAt, uptime, window, type Day } from '../src/status.ts'
import type { Monitor, Outcome, Region, Tick } from '../src/types.ts'

const m: Monitor = { id: 'api', name: 'API', http: 'https://example.com' }
const T = 1_757_550_000 - (1_757_550_000 % 60)

const ticks = (region: Region, outcomes: Outcome[]): Tick[] =>
  outcomes.map((o, i) => ({ region, ts: T - i * 60, results: { api: { o, ms: 100, ...(o === 'fail' && { err: 'HTTP 502' }) } } }))

const at = (cn: Outcome[], global: Outcome[], incidents: Incident[] = [], monitor = m) =>
  stateAt(monitor, window([...ticks('cn', cn), ...ticks('global', global)], T), T, incidents)

test('confirm needs two consecutive outcomes, newest first', () => {
  assert.equal(confirm([]), undefined)
  assert.equal(confirm(['ok']), 'ok')
  assert.equal(confirm(['fail']), 'slow')
  assert.equal(confirm(['fail', 'fail', 'ok']), 'fail')
  assert.equal(confirm(['ok', 'fail', 'fail']), 'fail')
  assert.equal(confirm(['ok', 'ok', 'fail']), 'ok')
  assert.equal(confirm(['ok', 'fail', 'ok']), 'slow')
})

test('regions combine into a single state', () => {
  assert.equal(at(['ok', 'ok'], ['ok', 'ok']).state, 'operational')
  assert.deepEqual(at(['fail', 'fail'], ['fail', 'fail']), { state: 'major', failed: ['cn', 'global'], err: 'HTTP 502' })
  assert.deepEqual(at(['ok', 'ok'], ['fail', 'fail']), { state: 'partial', failed: ['global'], err: 'HTTP 502' })
  assert.equal(at(['slow', 'slow'], ['ok', 'ok']).state, 'degraded')
  assert.equal(at(['fail'], ['ok', 'ok']).state, 'degraded')
})

test('an offline region is ignored instead of counted as down', () => {
  assert.equal(at([], ['fail', 'fail']).state, 'major')
  assert.equal(at([], ['ok', 'ok']).state, 'operational')
  assert.equal(at([], []).state, 'nodata')
  const stale = stateAt(m, window(ticks('cn', ['ok', 'ok', 'ok', 'fail', 'fail']).map((t) => ({ ...t, ts: t.ts - 180 })), T), T, [])
  assert.equal(stale.state, 'nodata')
})

test('regions option limits which probes count', () => {
  assert.equal(at(['ok', 'ok'], ['fail', 'fail'], [], { ...m, regions: ['cn'] }).state, 'operational')
})

test('incidents overlay the detected state', () => {
  const base = { id: 'x', title: 'x', components: ['api'], html: '', updates: [] }
  const maintenance: Incident = { ...base, impact: 'maintenance', start: T - 600, end: T + 600 }
  assert.deepEqual(at(['fail', 'fail'], ['fail', 'fail'], [maintenance]), { state: 'maintenance', failed: [] })
  assert.equal(at(['ok', 'ok'], ['ok', 'ok'], [{ ...maintenance, end: T }]).state, 'operational')
  assert.equal(at(['ok', 'ok'], ['ok', 'ok'], [{ ...base, impact: 'major', start: T - 60 }]).state, 'partial')
  assert.equal(at(['fail', 'fail'], ['fail', 'fail'], [{ ...base, impact: 'minor', start: T - 60 }]).state, 'major')
})

test('uptime weights partial outages at 0.3 and skips maintenance and gaps', () => {
  assert.equal(uptime([]), undefined)
  assert.equal(uptime([[1440, 0, 0, 0, 0, 0]]), 1)
  assert.equal(uptime([[1340, 0, 0, 100, 0, 0]]), 1 - 100 / 1440)
  assert.equal(uptime([[1340, 0, 100, 0, 0, 0]]), 1 - 30 / 1440)
  assert.equal(uptime([[720, 0, 0, 0, 360, 360]]), 1)
})

test('bar color scales with downtime', () => {
  assert.equal(barColor(undefined), 'var(--nodata)')
  assert.equal(barColor([0, 0, 0, 0, 0, 1440]), 'var(--nodata)')
  assert.equal(barColor([1440, 0, 0, 0, 0, 0]), 'var(--operational)')
  assert.equal(barColor([1300, 140, 0, 0, 0, 0]), 'var(--operational)')
  assert.equal(barColor([1200, 0, 0, 0, 240, 0]), 'var(--maintenance)')
  assert.match(barColor([1439, 0, 0, 1, 0, 0]), /var\(--partial\) \d+%, var\(--degraded\)/)
  assert.match(barColor([1000, 0, 0, 440, 0, 0]), /var\(--major\) 100%/)
})

test('latency histograms merge and yield percentiles', () => {
  const day: Day = { stats: {}, lat: {} }
  record(day, 'api', 'operational')
  record(day, 'api', 'partial')
  assert.deepEqual(day.stats.api, [1, 0, 1, 0, 0, 0])
  for (const ms of [12, 100, 850, 9000]) assert.ok(Math.abs(bucketMs(bucket(ms)) / ms - 1) < 0.13)
  const h = merge([[0, 0, 5], undefined, [0, 0, 0, 5]])
  assert.equal(percentile(h, 0.5), bucketMs(2))
  assert.equal(percentile(h, 0.95), bucketMs(3))
  assert.equal(percentile(merge([]), 0.5), undefined)
})

test('days are counted in China time', () => {
  assert.equal(dayOf(Date.parse('2026-09-10T16:00:00Z') / 1000), '2026-09-11')
  assert.equal(dayOf(Date.parse('2026-09-10T15:59:59Z') / 1000), '2026-09-10')
})
