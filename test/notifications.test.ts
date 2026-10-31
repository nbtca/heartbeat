import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Event } from '../src/db.ts'
import { message } from '../src/notifications.ts'

const offline: Event = { monitor: 'region:cn', ts: 600, state: 'nodata' }
const online: Event = { ...offline, ts: 660, state: 'operational' }

test('a probe that has never reported raises an initial offline alert', () => {
  assert.match(message(offline, undefined, 'cn')!, /offline/)
  assert.equal(message(online, undefined, 'cn'), undefined)
})

test('probe loss and recovery alert once per state change', () => {
  assert.match(message(offline, online, 'cn')!, /offline/)
  assert.equal(message({ ...offline, ts: 720 }, offline, 'cn'), undefined)
  assert.match(message(online, offline, 'cn')!, /reporting again/)
  assert.equal(message({ ...online, ts: 780 }, online, 'cn'), undefined)
})

test('service initialization stays silent and confirmed outages still alert', () => {
  const down: Event = { monitor: 'bot-qq', ts: 660, state: 'major', detail: { failed: ['cn'], err: 'HTTP 503' } }
  const up: Event = { monitor: 'bot-qq', ts: 600, state: 'operational' }
  assert.equal(message(down, undefined, 'QQ bot'), undefined)
  assert.match(message(down, up, 'QQ bot')!, /QQ bot:.*HTTP 503/)
  assert.ok(message({ ...up, ts: 720 }, down, 'QQ bot'))
})
