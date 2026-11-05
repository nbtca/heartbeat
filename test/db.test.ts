import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { readState } from '../src/db.ts'
import type { Packed } from '../src/state.ts'

function d1() {
  const sql = new DatabaseSync(':memory:')
  sql.exec(readFileSync('migrations/0001_init.sql', 'utf8'))
  const plans: string[] = []
  const DB = {
    prepare(query: string) {
      let args: any[] = []
      const stmt = {
        bind: (...a: any[]) => ((args = a), stmt),
        async all() {
          plans.push(...sql.prepare(`EXPLAIN QUERY PLAN ${query}`).all(...args).map((r: any) => r.detail))
          return { results: sql.prepare(query).all(...args) }
        },
      }
      return stmt
    },
  } as unknown as D1Database
  return { sql, DB, plans }
}

test('the state migration packs the newest event per monitor and the recent ticks, and reads seek by key', async () => {
  const { sql, DB, plans } = d1()
  sql.exec(`INSERT INTO events VALUES
    ('api', 100, 'operational', NULL),
    ('api', 200, 'major', '{"failed":["global"],"err":"HTTP 502"}'),
    ('home', 150, 'degraded', NULL)`)
  sql.exec(`INSERT INTO ticks VALUES (6000, 'global', '{"api":{"o":"ok","ms":10}}'), (6000, 'cn', '{}'), (100, 'global', '{}')`)
  sql.exec(readFileSync('migrations/0002_state.sql', 'utf8'))
  const st = await readState<Packed>(DB, ['last', 'recent:global'])
  assert.deepEqual(st.last, {
    api: { monitor: 'api', ts: 200, state: 'major', detail: { failed: ['global'], err: 'HTTP 502' } },
    home: { monitor: 'home', ts: 150, state: 'degraded', detail: null },
  })
  assert.deepEqual(st['recent:global'], [{ region: 'global', ts: 6000, results: { api: { o: 'ok', ms: 10 } } }])
  assert.equal(st['recent:cn'], undefined)
  assert.deepEqual(plans.filter((p) => /^SCAN/.test(p)), [])
})
