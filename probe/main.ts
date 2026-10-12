import { connect, type Socket } from 'node:net'
import { Duplex } from 'node:stream'
import { connect as tls } from 'node:tls'
import { run, type Conn, type Net } from '../src/check.ts'
import type { Monitor, Region } from '../src/types.ts'

const url = process.env.HEARTBEAT_URL ?? 'https://status.nbtca.space'
const region = (process.env.PROBE_REGION ?? 'cn') as Region
const token = process.env.PROBE_TOKEN
if (!token) throw new Error('PROBE_TOKEN is required')
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function settle<S extends Socket>(socket: S, ready: string, signal: AbortSignal) {
  return new Promise<S>((resolve, reject) => {
    signal.addEventListener('abort', () => socket.destroy(new Error('timeout')), { once: true })
    socket.once('error', reject)
    socket.once(ready, () => resolve(socket))
  })
}

const net: Net = {
  async tcp(host, port, signal) {
    const socket = await settle(connect({ host, port }), 'connect', signal)
    return { ...(Duplex.toWeb(socket) as unknown as Conn), close: () => socket.destroy() }
  },
  async cert(host, signal) {
    const socket = await settle(tls({ host, port: 443, servername: host, rejectUnauthorized: false }), 'secureConnect', signal)
    try {
      return Math.floor((Date.parse(socket.getPeerCertificate().valid_to) - Date.now()) / 86400000)
    } finally {
      socket.destroy()
    }
  },
}

let monitors: Monitor[] = []

async function cycle() {
  const ts = Math.floor(Date.now() / 60000) * 60
  try {
    const res = await fetch(`${url}/api/config`, { headers, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    monitors = await res.json()
  } catch (e) {
    console.error('config fetch failed, keeping previous config:', (e as Error).message)
  }
  if (!monitors.length) return
  const results = await run(monitors, region, net, ts)
  const body = JSON.stringify({ region, ts, results })
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${url}/api/ingest`, { method: 'POST', headers, body, signal: AbortSignal.timeout(15_000) }).catch((e: Error) => e)
    if (res instanceof Response && res.ok) {
      const failing = Object.keys(results).filter((id) => results[id].o === 'fail')
      console.log(new Date(ts * 1000).toISOString(), `${Object.keys(results).length} checked,`, failing.length ? `failing: ${failing.join(', ')}` : 'all ok')
      return
    }
    console.error(`ingest attempt ${attempt} failed:`, res instanceof Response ? `HTTP ${res.status}` : res.message)
    await sleep(5_000)
  }
}

for (;;) {
  await cycle().catch((e) => console.error(e))
  await sleep(62_000 - (Date.now() % 60_000))
}
