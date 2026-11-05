import { run, type Net } from './check.ts'
import { byId, incidents, monitors, SPAN } from './data.ts'
import * as db from './db.ts'
import { BIN, BINS, extend, keep, seed, type Packed } from './state.ts'
import { dayOf, record, sample, stateAt, window, type Verdict } from './status.ts'
import { message } from './notifications.ts'
import { REGIONS, type Region, type State, type Tick } from './types.ts'

export type Bindings = Env & { PROBE_TOKEN: string; NOTIFY_TOKEN?: string }

export async function tick(env: Bindings, ts: number, net: Net) {
  const results = await run(monitors, 'global', net, ts)
  const chartDue = ts % BIN === 0
  const st = await db.readState<Packed>(env.DB, ['recent:global', 'recent:cn', 'last', ...(chartDue ? (['chart'] as const) : [])])
  const global = keep(st['recent:global'] ?? [], { region: 'global', ts, results }, ts, SPAN)
  const recent = [...global, ...(st['recent:cn'] ?? [])]
  const w = window(recent, ts, SPAN)
  const verdicts = new Map(monitors.map((m) => [m.id, stateAt(m, w, ts, incidents)]))
  const writes = [db.writeState(env.DB, 'recent:global', global)]
  const last = await transition(env, ts, new Set(w.keys()), verdicts, st.last ?? {})
  if (last) writes.push(db.writeState(env.DB, 'last', last))
  if (chartDue) {
    // The bin closes five minutes late so the China probe's reports for it have arrived.
    const from = ts - 2 * BIN
    const chart = st.chart ? extend(st.chart, recent, from) : seed(await db.ticksSince(env.DB, from - BINS * BIN), from)
    writes.push(db.writeState(env.DB, 'chart', chart))
  }
  await Promise.all([accumulate(env.DB, ts, recent, verdicts), env.DB.batch(writes)])
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

async function transition(env: Bindings, ts: number, online: Set<Region>, verdicts: Map<string, Verdict>, last: Record<string, db.Event>) {
  const now: db.Event[] = [
    ...[...verdicts].map(([monitor, v]) => ({ monitor, ts, state: v.state, ...((v.failed.length || v.err) && { detail: { failed: v.failed, err: v.err } }) })),
    ...REGIONS.filter((r) => r !== 'global').map((r) => ({ monitor: `region:${r}`, ts, state: online.has(r) ? ('operational' as const) : ('nodata' as const) })),
  ]
  const changed = now.filter((e) => last[e.monitor]?.state !== e.state)
  if (!changed.length) return
  await db.insertEvents(env.DB, changed)
  await Promise.all(changed.map((e) => notify(env, e, last[e.monitor])))
  return { ...last, ...Object.fromEntries(changed.map((e) => [e.monitor, e])) }
}

async function notify(env: Bindings, e: db.Event, prev?: db.Event) {
  const text = message(e, prev, byId.get(e.monitor)?.name ?? e.monitor)
  if (!text || !env.NOTIFY_URL || !env.NOTIFY_TOKEN) return
  const url = e.monitor.startsWith('region:') ? env.SITE_URL : `${env.SITE_URL}/c/${e.monitor}`
  await fetch(env.NOTIFY_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.NOTIFY_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'heartbeat', text, url, monitor: e.monitor, state: e.state, previous: prev?.state, ts: e.ts }),
  }).catch((err) => console.error('notify failed', err))
}
