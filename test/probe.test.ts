import assert from 'node:assert/strict'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { Probe } from '../probe/cycle.ts'
import { Health, healthServer, STALE_MS } from '../probe/health.ts'
import type { Results } from '../src/types.ts'

const config = [{ id: 'bot-qq', name: 'QQ', role: 'bot', http: 'http://example.com/healthz', regions: ['cn'] }]
const results: Results = { 'bot-qq': { o: 'fail', ms: 12, err: 'HTTP 503' } }

test('readiness requires a recent accepted ingest; failed bot checks still count as a healthy probe', async () => {
  const requests: { url: string; init?: RequestInit }[] = []
  const probe = new Probe('https://worker.example', 'cn', 'test-token', async () => results, async (url, init) => {
    requests.push({ url: String(url), init })
    return String(url).endsWith('/api/config') ? Response.json(config) : new Response(null, { status: 204 })
  })
  assert.equal(probe.health.response('/readyz').status, 503)
  assert.equal(await probe.cycle(), true)
  assert.equal(probe.health.response('/readyz').status, 200)
  assert.deepEqual(JSON.parse(requests[1].init!.body as string).results, results)
  assert.equal(new Headers(requests[0].init?.headers).get('authorization'), 'Bearer test-token')
  const at = probe.health.lastIngest!
  assert.equal(probe.health.response('/readyz', at + STALE_MS).status, 503)
})

test('cold start config failure sends no empty tick; completed failures remain live', async () => {
  let calls = 0
  const probe = new Probe('https://worker.example', 'cn', 'secret', async () => { throw new Error('must not check') }, async () => {
    calls++
    return new Response(null, { status: 401 })
  })
  assert.equal(await probe.cycle(), false)
  assert.equal(calls, 1)
  assert.equal(probe.health.consecutiveFailures, 1)
  assert.equal(probe.health.response('/healthz').status, 200)
  assert.equal(probe.health.response('/readyz').status, 503)
})

test('cached config survives refresh failure; ingest retries and recovery reset failures', async () => {
  let mode: 'ok' | 'down' = 'ok'
  let attempts = 0
  const delays: number[] = []
  const probe = new Probe('https://worker.example', 'cn', 'secret', async () => results, async (url) => {
    if (String(url).endsWith('/api/config')) return mode === 'ok' ? Response.json(config) : new Response(null, { status: 503 })
    attempts++
    if (mode === 'down') throw new Error('offline')
    return new Response(null, { status: 204 })
  }, async (ms) => { delays.push(ms) })
  await probe.cycle()
  const last = probe.health.lastIngest
  mode = 'down'
  assert.equal(await probe.cycle(), false)
  assert.equal(attempts, 4)
  assert.deepEqual(delays, [5000, 5000])
  assert.equal(probe.health.lastIngest, last)
  assert.equal(probe.health.consecutiveFailures, 1)
  mode = 'ok'
  assert.equal(await probe.cycle(), true)
  assert.equal(probe.health.consecutiveFailures, 0)
})

test('check exceptions mark a failed completed cycle; a stalled cycle eventually fails liveness', async () => {
  const probe = new Probe('https://worker.example', 'cn', 'secret', async () => { throw new Error('check failed') }, async () => Response.json(config))
  await assert.rejects(probe.cycle(), /check failed/)
  assert.equal(probe.health.consecutiveFailures, 1)
  assert.equal(probe.health.response('/healthz', probe.health.lastCycle + STALE_MS).status, 503)
})

test('health HTTP endpoints expose readiness without credentials or cached configuration', async (t) => {
  const health = new Health()
  const server = healthServer(health).listen(0, '127.0.0.1')
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())))
  await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  assert.equal((await fetch(`${url}/healthz`)).status, 200)
  assert.equal((await fetch(`${url}/readyz`)).status, 503)
  health.completed(true)
  const res = await fetch(`${url}/readyz`)
  assert.equal(res.status, 200)
  assert.deepEqual(Object.keys(await res.json()).sort(), ['consecutiveFailures', 'lastIngest', 'live', 'ready'])
  assert.equal((await fetch(`${url}/missing`)).status, 404)
})

test('the real probe process checks a service and ingests cn results before becoming ready', { timeout: 15_000 }, async (t) => {
  let tick: any
  let workerUrl = ''
  const worker = createServer(async (req, res) => {
    if (req.url === '/service') return void res.writeHead(503).end('disconnected')
    assert.equal(req.headers.authorization, 'Bearer smoke-token')
    if (req.url === '/api/config') {
      return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify([
        { ...config[0], http: `${workerUrl}/service` },
        { ...config[0], id: 'global-only', regions: ['global'] },
      ]))
    }
    if (req.url === '/api/ingest') {
      let body = ''
      for await (const chunk of req) body += chunk
      tick = JSON.parse(body)
      return void res.writeHead(204).end()
    }
    res.writeHead(404).end()
  }).listen(0, '127.0.0.1')
  t.after(() => new Promise<void>((resolve) => worker.close(() => resolve())))
  await once(worker, 'listening')
  workerUrl = `http://127.0.0.1:${(worker.address() as AddressInfo).port}`
  const reservation = createServer().listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = (reservation.address() as AddressInfo).port
  await new Promise<void>((resolve) => reservation.close(() => resolve()))
  const child = spawn(process.execPath, ['probe/main.ts'], {
    cwd: resolve(import.meta.dirname, '..'),
    env: { ...process.env, PROBE_TOKEN: 'smoke-token', PROBE_REGION: 'cn', HEARTBEAT_URL: workerUrl, HEALTH_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => {
    if (child.exitCode === null) {
      const ended = once(child, 'exit')
      child.kill()
      await ended
    }
  })
  await new Promise<void>((resolve, reject) => {
    let output = ''
    child.stdout.on('data', (data) => {
      output += data
      if (output.includes('1 checked,')) resolve()
    })
    child.once('error', reject)
    child.once('exit', (code) => reject(new Error(`probe exited early: ${code}`)))
  })
  assert.equal(tick.region, 'cn')
  assert.equal(tick.ts % 60, 0)
  assert.deepEqual(Object.keys(tick.results), ['bot-qq'])
  assert.equal(tick.results['bot-qq'].o, 'fail')
  assert.equal(tick.results['bot-qq'].err, 'HTTP 503')
  assert.equal((await fetch(`http://127.0.0.1:${port}/readyz`)).status, 200)
})
