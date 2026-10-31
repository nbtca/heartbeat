import { connect, type Socket } from 'node:net'
import { Duplex } from 'node:stream'
import { connect as tls } from 'node:tls'
import { run, type Conn, type Net } from '../src/check.ts'
import { REGIONS, type Region } from '../src/types.ts'
import { Probe } from './cycle.ts'
import { healthServer } from './health.ts'

const url = process.env.HEARTBEAT_URL ?? 'https://status.nbtca.space'
const region = (process.env.PROBE_REGION ?? 'cn') as Region
const token = process.env.PROBE_TOKEN
if (!token) throw new Error('PROBE_TOKEN is required')
if (region === 'global' || !REGIONS.includes(region)) throw new Error('PROBE_REGION must be cn')
const port = Number(process.env.HEALTH_PORT ?? 8080)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid HEALTH_PORT')

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

const probe = new Probe(url, region, token, (monitors, region, ts) => run(monitors, region, net, ts))
const server = healthServer(probe.health)
server.listen(port, '0.0.0.0')
console.log('probe started; region=' + region + ', health port=' + port)

for (;;) {
  await probe.cycle().catch(() => console.error('probe cycle failed unexpectedly'))
  await sleep(62_000 - (Date.now() % 60_000))
}
