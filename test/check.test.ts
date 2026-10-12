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

const conn = (...reply: number[][]) => {
  const sent: number[] = []
  const net: Net = {
    tcp: async () => ({
      readable: new ReadableStream({
        start(c) {
          for (const chunk of reply) c.enqueue(Uint8Array.from(chunk))
          c.close()
        },
      }),
      writable: new WritableStream({ write: (b) => void sent.push(...b) }),
      close() {},
    }),
  }
  return { net, sent }
}
const { net } = conn()

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

test('a minecraft check needs a status reply, not just an open port', async () => {
  const mc = { id: 'mc', name: 'mc', role: 'mc', tcp: 'mc.example.com:25565', minecraft: true }
  const json = [...Buffer.from(JSON.stringify({ version: { name: '1.21' }, description: 'x'.repeat(200) }))]
  const reply = [0x80 | ((json.length + 3) & 0x7f), (json.length + 3) >> 7, 0, 0x80 | (json.length & 0x7f), json.length >> 7, ...json]
  const up = conn(reply.slice(0, 1), reply.slice(1, 50), reply.slice(50))
  assert.equal((await check(mc, up.net)).o, 'ok')
  assert.deepEqual(up.sent, [24, 0, 0xff, 0xff, 0xff, 0xff, 0x0f, 14, ...Buffer.from('mc.example.com'), 0x63, 0xdd, 1, 1, 0])
  assert.equal((await check(mc, conn().net)).err, 'no status reply')
  assert.equal((await check(mc, conn(reply.slice(0, 50)).net)).err, 'no status reply')
  assert.equal((await check(mc, conn([...Buffer.from('SSH-2.0-OpenSSH_9.6\r\n')]).net)).err, 'no status reply')
  assert.equal((await check(mc, conn([4, 0, 2, 0x7b, 0x7d]).net)).err, 'unexpected reply')
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
