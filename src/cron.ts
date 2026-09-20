import { run, type Net } from './check.ts'
import { byId, incidents, monitors } from './data.ts'
import * as db from './db.ts'
import { dayOf, record, sample, stateAt, window, type Verdict } from './status.ts'
import { TEXT } from './text.ts'
import { REGIONS, type Region, type State, type Tick } from './types.ts'

export type Bindings = Env & { PROBE_TOKEN: string; NOTIFY_TOKEN?: string }

const ALERT: State[] = ['partial', 'major']

export async function tick(env: Bindings, ts: number, net: Net) {
  await db.saveTick(env.DB, { region: 'global', ts, results: await run(monitors, 'global', net) })
  const recent = await db.ticksSince(env.DB, ts - 240)
  const w = window(recent, ts)
  const verdicts = new Map(monitors.map((m) => [m.id, stateAt(m, w, ts, incidents)]))
  await Promise.all([accumulate(env.DB, ts, recent, verdicts), transition(env, ts, new Set(w.keys()), verdicts)])
  if (ts % 3600 === 0) await db.prune(env.DB, ts - db.RETAIN)
}

async function accumulate(DB: D1Database, ts: number, recent: Tick[], verdicts: Map<string, Verdict>) {
  const day = dayOf(ts)
  const d = (await db.loadDays(DB, day, true)).get(day) ?? { stats: {}, lat: {} }
  for (const [id, v] of verdicts) record(d, id, v.state)
  for (const t of recent) {
    if (t.ts !== (t.region === 'global' ? ts : ts - 60)) continue
    for (const [id, r] of Object.entries(t.results)) if (r.o !== 'fail') sample(d, id, t.region, r.ms)
  }
  await db.saveDay(DB, day, d)
}

async function transition(env: Bindings, ts: number, online: Set<Region>, verdicts: Map<string, Verdict>) {
  const last = await db.lastEvents(env.DB)
  const now: db.Event[] = [
    ...[...verdicts].map(([monitor, v]) => ({ monitor, ts, state: v.state, ...((v.failed.length || v.err) && { detail: { failed: v.failed, err: v.err } }) })),
    ...REGIONS.filter((r) => r !== 'global').map((r) => ({ monitor: `region:${r}`, ts, state: online.has(r) ? ('operational' as const) : ('nodata' as const) })),
  ]
  const changed = now.filter((e) => last.get(e.monitor)?.state !== e.state)
  if (!changed.length) return
  await db.insertEvents(env.DB, changed)
  await Promise.all(changed.map((e) => notify(env, e, last.get(e.monitor))))
}

const t = TEXT.en

function message(e: db.Event, prev: db.Event): string | undefined {
  if (e.monitor.startsWith('region:')) {
    const region = t.region[e.monitor.slice(7) as Region]
    return e.state === 'nodata' ? t.probeDown(region) : t.probeUp(region)
  }
  const name = byId.get(e.monitor)?.name ?? e.monitor
  if (ALERT.includes(e.state)) {
    const where = e.detail?.failed.length === 1 ? ` (${t.region[e.detail.failed[0]]})` : ''
    return `${name}: ${t.state[e.state]}${where}${e.detail?.err ? ` — ${e.detail.err}` : ''}`
  }
  if (ALERT.includes(prev.state) && (e.state === 'operational' || e.state === 'degraded')) {
    return t.recovered(name, t.state[prev.state], t.duration(e.ts - prev.ts))
  }
}

async function notify(env: Bindings, e: db.Event, prev?: db.Event) {
  const text = prev && message(e, prev)
  if (!text || !env.NOTIFY_URL || !env.NOTIFY_TOKEN) return
  const url = e.monitor.startsWith('region:') ? env.SITE_URL : `${env.SITE_URL}/c/${e.monitor}`
  await fetch(env.NOTIFY_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.NOTIFY_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'heartbeat', text, url, monitor: e.monitor, state: e.state, previous: prev?.state, ts: e.ts }),
  }).catch((err) => console.error('notify failed', err))
}
