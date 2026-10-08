import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { lastEvents } from '../src/db.ts'

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

test('lastEvents returns the newest event of each requested monitor without scanning the table', async () => {
  const { sql, DB, plans } = d1()
  sql.exec(`INSERT INTO events VALUES
    ('api', 100, 'operational', NULL),
    ('api', 200, 'major', '{"failed":["global"],"err":"HTTP 502"}'),
    ('home', 150, 'degraded', NULL),
    ('retired', 50, 'operational', NULL)`)
  assert.deepEqual(
    [...(await lastEvents(DB, ['api', 'home', 'new']))],
    [
      ['api', { monitor: 'api', ts: 200, state: 'major', detail: { failed: ['global'], err: 'HTTP 502' } }],
      ['home', { monitor: 'home', ts: 150, state: 'degraded' }],
    ],
  )
  assert.deepEqual(plans.filter((p) => /^SCAN (?!j\b)/.test(p)), [])
  assert.equal((await lastEvents(DB, [])).size, 0)
})
