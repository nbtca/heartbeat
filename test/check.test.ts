import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, test } from 'node:test'
import { check, run, type Net } from '../src/check.ts'

const server = createServer((req, res) => {
  if (req.url === '/slow') return setTimeout(() => res.end('ok'), 60)
  res.writeHead(Number(req.url?.slice(1)) || 200).end('pong')
}).listen(0)
after(() => server.close())
const url = (path: string) => `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`

const net: Net = { tcp: async () => {} }

test('http checks classify status codes, bodies, and latency', async () => {
  assert.equal((await check({ id: 'a', name: 'a', role: 'a', http: url('/') }, net)).o, 'ok')
  assert.deepEqual(await check({ id: 'a', name: 'a', role: 'a', http: url('/502') }, net).then((r) => [r.o, r.err]), ['fail', 'HTTP 502'])
  assert.equal((await check({ id: 'a', name: 'a', role: 'a', http: url('/401'), status: 401 }, net)).o, 'ok')
  assert.equal((await check({ id: 'a', name: 'a', role: 'a', http: url('/302') }, net)).o, 'ok')
  assert.equal((await check({ id: 'a', name: 'a', role: 'a', http: url('/'), expect: 'pong' }, net)).o, 'ok')
  assert.equal((await check({ id: 'a', name: 'a', role: 'a', http: url('/'), expect: 'nope' }, net)).err, 'unexpected body')
  assert.equal((await check({ id: 'a', name: 'a', role: 'a', http: url('/slow'), slowMs: 20 }, net)).o, 'slow')
})

test('connection errors report the underlying code', async () => {
  const closed = createServer().listen(0)
  await once(closed, 'listening')
  const { port } = closed.address() as AddressInfo
  closed.close()
  assert.equal((await check({ id: 'a', name: 'a', role: 'a', http: `http://127.0.0.1:${port}/` }, net)).err, 'ECONNREFUSED')
})

test('tcp checks go through the injected socket adapter', async () => {
  const down: Net = { tcp: async () => Promise.reject(new Error('ECONNREFUSED')) }
  assert.equal((await check({ id: 'mc', name: 'mc', role: 'mc', tcp: 'mc.example.com:25565' }, net)).o, 'ok')
  assert.equal((await check({ id: 'mc', name: 'mc', role: 'mc', tcp: 'mc.example.com:25565' }, down)).err, 'ECONNREFUSED')
})

test('run only includes monitors assigned to the region', async () => {
  const results = await run(
    [
      { id: 'both', name: 'both', role: 'both', http: url('/') },
      { id: 'cn', name: 'cn', role: 'cn', http: url('/'), regions: ['cn'] },
    ],
    'global',
    net,
  )
  assert.deepEqual(Object.keys(results), ['both'])
})

test('a service with its own interval is only checked when it is due', async () => {
  const every = [
    { id: 'fast', name: 'fast', role: 'fast', http: url('/') },
    { id: 'slow', name: 'slow', role: 'slow', http: url('/'), every: 5 },
  ]
  assert.deepEqual(Object.keys(await run(every, 'global', net, 300)).sort(), ['fast', 'slow'])
  assert.deepEqual(Object.keys(await run(every, 'global', net, 360)), ['fast'])
  assert.deepEqual(Object.keys(await run(every, 'global', net)).sort(), ['fast', 'slow'])
})
