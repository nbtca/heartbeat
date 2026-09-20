import { REGIONS, type Monitor, type Region, type Result, type Results } from './types.ts'

export const TIMEOUT = 10_000
export const SLOW_MS = 3_000

export interface Net {
  tcp(host: string, port: number, signal: AbortSignal): Promise<void>
  cert?(host: string, signal: AbortSignal): Promise<number>
}

async function probe(m: Monitor, net: Net, signal: AbortSignal): Promise<string | undefined> {
  if (m.tcp) {
    const i = m.tcp.lastIndexOf(':')
    await net.tcp(m.tcp.slice(0, i), Number(m.tcp.slice(i + 1)), signal)
    return
  }
  const res = await fetch(m.http!, { method: m.head ? 'HEAD' : 'GET', signal, redirect: 'manual', headers: { 'user-agent': 'nbtca-heartbeat' } })
  const body = m.expect ? await res.text() : ''
  if (!m.expect) await res.body?.cancel()
  if (m.status ? res.status !== m.status : res.status >= 400) return `HTTP ${res.status}`
  if (m.expect && !body.includes(m.expect)) return 'unexpected body'
}

export async function check(m: Monitor, net: Net): Promise<Result> {
  const signal = AbortSignal.timeout(TIMEOUT)
  const start = performance.now()
  const err = await probe(m, net, signal).catch((e: any) => (signal.aborted ? 'timeout' : String(e?.cause?.code ?? e?.cause?.message ?? e?.message ?? e)))
  const ms = Math.round(performance.now() - start)
  const r: Result = { o: err ? 'fail' : ms > (m.slowMs ?? SLOW_MS) ? 'slow' : 'ok', ms }
  if (err) r.err = err.slice(0, 120)
  if (net.cert && m.http?.startsWith('https:')) {
    r.cert = await net.cert(new URL(m.http).hostname, AbortSignal.timeout(TIMEOUT)).catch(() => undefined)
  }
  return r
}

export async function run(monitors: Monitor[], region: Region, net: Net): Promise<Results> {
  const list = monitors.filter((m) => (m.regions ?? REGIONS).includes(region))
  return Object.fromEntries(await Promise.all(list.map(async (m) => [m.id, await check(m, net)] as const)))
}
