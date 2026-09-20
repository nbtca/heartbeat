import { SLOW_MS } from './check.ts'
import client from './client.js'
import { byId, core, groups, incidents, monitors } from './data.ts'
import * as db from './db.ts'
import { html, raw, type Raw } from './html.ts'
import { escape, type Incident } from './incidents.ts'
import css from './page.css'
import { barColor, downtime, lastDays, merge, percentile, stateAt, uptime, window, worst, type Counts, type Day, type Verdict } from './status.ts'
import { label, LANGS, TEXT, type Text } from './text.ts'
import { REGIONS, type Group, type Monitor, type Region, type State, type Tick } from './types.ts'

export interface Page {
  title?: string
  body: Raw
  status?: number
}

const DAYS = 90
const IMPACT_STATE = { minor: 'degraded', major: 'partial', critical: 'major', maintenance: 'maintenance' } as const
const BEAT = 'h2.5q.6 -2.4 1.2 0h.5l.4 2l.7 -22l.7 25l.4 -5h.6q.8 -5 1.6 0h1.4'

const minute = () => Math.floor(Date.now() / 60000) * 60
const noon = (day: string) => Date.parse(`${day}T12:00:00+08:00`) / 1000
const calm = (s: State) => s === 'operational' || s === 'nodata'
const pct = (u?: number) => (u === undefined ? '—' : u === 1 ? '100%' : `${(Math.floor(u * 10000) / 100).toFixed(2)}%`)
const ms = (v: number) => (v >= 1000 ? `${Number((v / 1000).toPrecision(2))} s` : `${Number(v.toPrecision(2))} ms`)
const list = (items: unknown[], sep: string) => items.flatMap((x, i) => (i ? [sep, x] : [x]))

const icon = (s: State) => html`<svg class="icon" data-state="${s}" aria-hidden="true"><use href="#i-${s}"/></svg>`
const badge = (s: State, t: Text) => html`<span class="badge">${icon(s)}${t.state[s]}</span>`
const CHEV = raw('<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>')
const glyph = (body: string, solid = false) => raw(`<svg class="glyph${solid ? ' solid' : ''}" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`)
const RSS = glyph('<circle cx="3.3" cy="12.7" r="1.5" fill="currentColor" stroke="none"/><path d="M2.6 8.1a5.3 5.3 0 0 1 5.3 5.3M2.6 3.6a9.8 9.8 0 0 1 9.8 9.8"/>')
const GLOBE = glyph('<circle cx="8" cy="8" r="6.2"/><path d="M1.9 8h12.2M8 1.8a9.6 9.6 0 0 1 0 12.4M8 1.8a9.6 9.6 0 0 0 0 12.4"/>')
const BACK = glyph('<path d="M9.8 3.6 5.4 8l4.4 4.4"/>')
const TICK = glyph('<path d="M3.4 8.4 6.4 11.4 12.6 4.8"/>')
const BLANK = raw('<span class="glyph"></span>')
const MARK = glyph(
  '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>',
  true,
)

const heading = (state: State, name: string, n: number, t: Text) =>
  html`${icon(state)}<span class="name">${name}</span>${
    calm(state) ? html`<span class="count">${t.count(n)}</span>` : html`<span class="note" data-state="${state}">${t.state[state]}</span>`
  }`

const SPRITE = raw(`<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="i-operational" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" stroke="none"/><path fill="none" d="M4.8 8.3l2.1 2.1 4.3-4.6"/></symbol>
<symbol id="i-degraded" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" stroke="none"/><path fill="none" d="M4.4 9.4l2.3-2.6 2.4 2.2 2.5-3"/></symbol>
<symbol id="i-partial" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" stroke="none"/><path fill="none" d="M8 4.5v4.3M8 11.3v.2"/></symbol>
<symbol id="i-major" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" stroke="none"/><path fill="none" d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"/></symbol>
<symbol id="i-maintenance" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" stroke="none"/><path fill="none" d="M8 4.6V8l2.3 1.5"/></symbol>
<symbol id="i-nodata" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" stroke="none"/><path fill="none" d="M5.3 8h5.4"/></symbol>
</defs></svg>`)

const at = (t: Text, path = '') => `${t.dir}${path}` || '/'

export function layout(p: Page, t: Text): string {
  return `<!doctype html>${
    html`<html lang="${t.locale}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.title ? `${p.title} - ${t.site}` : t.site}</title>
<meta name="description" content="${t.desc}">
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<link rel="alternate" type="application/atom+xml" href="/feed.xml" title="${t.site}">
${LANGS.map((l) => html`<link rel="alternate" hreflang="${TEXT[l].locale}" href="${at(TEXT[l])}">`)}
<style>${raw(css)}</style>
</head><body>
${SPRITE}
<div class="wrap">
<header class="top"><a class="brand" href="${at(t)}"><img src="/logo.svg" alt="" width="28" height="28">${t.site}</a><nav class="links"><details class="lang"><summary title="${t.language}" aria-label="${t.language}">${GLOBE}</summary><menu>${LANGS.map((l) => {
      const o = TEXT[l]
      return html`<li><a href="${at(o)}" lang="${o.locale}"${l === t.lang ? raw(' aria-current="true"') : ''}>${l === t.lang ? TICK : BLANK}${o.name}</a></li>`
    })}</menu></details><a href="/feed.xml" title="${t.subscribe}" aria-label="${t.subscribe}">${RSS}</a></nav></header>
<main>${p.body}</main>
<footer class="foot"><span>${t.footer}</span><a href="https://github.com/nbtca/heartbeat" title="GitHub" aria-label="GitHub">${MARK}</a></footer>
</div>
<script>${raw(client)}</script>
</body></html>`.value
  }`
}

interface Live {
  ts: number
  t: Text
  recent: Tick[]
  verdicts: Map<string, Verdict>
  seen: Partial<Record<Region, number>>
}

async function live(DB: D1Database, ts: number, t: Text, span = 0): Promise<Live> {
  const recent = await db.ticksSince(DB, ts - span - 180)
  const w = window(recent, ts)
  const seen: Partial<Record<Region, number>> = {}
  for (const x of recent) seen[x.region] = Math.max(seen[x.region] ?? 0, x.ts)
  return { ts, t, recent, verdicts: new Map(monitors.map((m) => [m.id, stateAt(m, w, ts, incidents)])), seen }
}

function related(ids: string[], day: string, now: number) {
  const from = noon(day) - 43200
  return incidents.filter((i) => i.components.some((c) => ids.includes(c)) && i.start < from + 86400 && (i.end ?? now) >= from)
}

function impact(c: Counts | undefined, t: Text): string[] {
  if (!c) return []
  return ([3, 2, 1, 4] as const).filter((k) => c[k]).map((k) => `${t.impactOf[k]} ${t.duration(c[k] * 60)}`)
}

const measured = (c?: Counts) => !!c && c[0] + c[1] + c[2] + c[3] + c[4] > 0

function tip(day: string, lines: string[], hasData: boolean, rel: Incident[], t: Text) {
  return [t.date(noon(day)), ...(lines.length ? lines : [hasData ? t.noDowntime : t.noData]), ...rel.map((i) => t.incidentAt(i.title))].join('\n')
}

function combine(cs: (Counts | undefined)[]): Counts | undefined {
  let pick: Counts | undefined
  for (const c of cs) if (c && (!pick || downtime(c) > downtime(pick) || (downtime(c) === downtime(pick) && c[4] > pick[4]))) pick = c
  return pick
}

const strip = (cells: { color: string; tip: string }[], caption: string) =>
  html`<div class="bars" role="img" aria-label="${caption}">${cells.map((c) => html`<i style="--c:${c.color}" data-tip="${c.tip}"></i>`)}</div>`

function explain(m: Monitor, v: Verdict, ts: number, t: Text): string {
  if (v.state === 'maintenance') return t.maintaining
  const declared = incidents.some((i) => i.impact !== 'maintenance' && i.components.includes(m.id) && ts >= i.start && ts < (i.end ?? Infinity))
  if (declared && !v.failed.length) return t.declared
  const err = v.err ? t.paren(v.err) : ''
  if (v.state === 'major') return ((m.regions ?? REGIONS).length > 1 ? t.failedAll : t.failedOne) + err
  if (v.state === 'partial') return t.failedFrom(v.failed.map((r) => t.region[r]).join(t.listSep)) + err
  return t.slowerThan((m.slowMs ?? SLOW_MS) / 1000)
}

function hero(l: Live) {
  const t = l.t
  const state = (m: Monitor) => l.verdicts.get(m.id)!.state
  const affected = core.filter((m) => !calm(state(m)))
  const fine = core.filter((m) => state(m) === 'operational').length
  const overall = worst(core.map(state))
  const [title, lede] =
    overall === 'nodata'
      ? [t.collecting, t.collectingLede]
      : !affected.length
        ? [t.allGood, t.everyFine(core.length)]
        : affected.length === 1
          ? [
              t.oneAffected(label(affected[0], t), t.state[state(affected[0])]),
              `${explain(affected[0], l.verdicts.get(affected[0].id)!, l.ts, t)}${t.stop}${t.restFine(fine)}`,
            ]
          : [t.headline[overall]!, `${affected.map((m) => t.cat(label(m, t), t.state[state(m)])).join(t.listSep)}${t.stop}${t.restFine(fine)}`]
  return html`<section class="hero"><div class="banner" data-state="${overall}"><h1>${icon(overall)}${title}</h1><p class="lede">${lede}</p></div></section>`
}

function probes(l: Live) {
  return html`<p class="probes">${REGIONS.map((r) => {
    const last = l.seen[r]
    return last && last > l.ts - 180
      ? html`<span class="probe" data-on>${l.t.probeLabel(l.t.region[r])} <span data-since="${last}">${l.t.time(last)}</span></span>`
      : html`<span class="probe">${l.t.probeOff(l.t.region[r])}</span>`
  })}</p>`
}

function pulse(l: Live) {
  const t = l.t
  const beats = Array.from({ length: 60 }, (_, i) => {
    const at = l.ts - (59 - i) * 60
    const w = window(l.recent, at)
    const vs = core.map((m) => [m, stateAt(m, w, at, incidents)] as const)
    return { at, state: worst(vs.map(([, v]) => v.state)), hurt: vs.filter(([, v]) => !calm(v.state)) }
  })
  const latest = Math.max(0, ...Object.values(l.seen))
  return html`<figure class="pulse intro" data-latest="${latest}">
<div class="trace"><svg viewBox="0 0 600 56" preserveAspectRatio="none" role="img" aria-label="${t.overallTrace}">${beats.map((b, i) =>
    b.state === 'nodata' ? html`<path class="flat" d="M${i * 10} 36h10"/>` : html`<path data-state="${b.state}" d="M${i * 10} 36${BEAT}"/>`,
  )}${beats.map(
    (b, i) =>
      html`<rect x="${i * 10}" width="10" height="56" data-tip="${[
        t.time(b.at),
        ...(b.hurt.length ? b.hurt.map(([m, v]) => t.cat(label(m, t), t.state[v.state])) : [b.state === 'nodata' ? t.noData : t.allFine]),
      ].join('\n')}"/>`,
  )}</svg><span class="live" data-state="${beats[59].state}"></span></div>
<figcaption><span>${t.hourAgo}</span><span>${t.now}</span></figcaption>
</figure>`
}

function group(g: Group, l: Live, days: string[], counts: (id: string) => (Counts | undefined)[]) {
  const t = l.t
  const state = worst(g.items.map((m) => l.verdicts.get(m.id)!.state))
  const per = g.items.map((m) => counts(m.id))
  const ups = per.map(uptime).filter((u) => u !== undefined)
  const up = ups.length ? ups.reduce((a, b) => a + b) / ups.length : undefined
  const ids = g.items.map((m) => m.id)
  const name = label(g, t)
  const cells = days.map((d, i) => {
    const cs = per.map((c) => c[i])
    const lines = g.items.flatMap((m, j) => impact(cs[j], t).map((x) => t.cat(label(m, t), x)))
    return { color: barColor(combine(cs)), tip: tip(d, lines, cs.some(measured), related(ids, d, l.ts), t) }
  })
  return html`<details class="group" data-key="${g.name}"${calm(state) ? '' : raw(' open')}>
<summary><span class="row">${heading(state, name, g.items.length, t)}<span class="uptime">${t.uptime(pct(up))}</span>${CHEV}</span>${strip(
    cells,
    `${name} ${t.uptime(pct(up))}`,
  )}</summary>
<ul class="members">${g.items.map((m, j) => member(m, l.verdicts.get(m.id)!, days, per[j], l.ts, t))}</ul>
</details>`
}

function advanced(gs: Group[], l: Live, days: string[], counts: (id: string) => (Counts | undefined)[]) {
  const t = l.t
  const items = gs.flatMap((g) => g.items)
  const state = worst(items.map((m) => l.verdicts.get(m.id)!.state))
  return html`<details class="advanced" data-key="infra"${calm(state) ? '' : raw(' open')}>
<summary>${heading(state, t.infra, items.length, t)}${CHEV}</summary>
<div class="panel">${gs.map((g) => group(g, l, days, counts))}</div>
</details>`
}

function member(m: Monitor, v: Verdict, days: string[], cs: (Counts | undefined)[], now: number, t: Text) {
  const up = uptime(cs)
  const name = label(m, t)
  const cells = days.map((d, i) => ({ color: barColor(cs[i]), tip: tip(d, impact(cs[i], t), measured(cs[i]), related([m.id], d, now), t) }))
  const where = v.failed.length === 1 && v.state === 'partial' ? t.paren(t.region[v.failed[0]]) : ''
  return html`<li><div class="row">${icon(v.state)}<a class="name" href="${at(t, `/c/${m.id}`)}">${name}</a>${
    v.state === 'operational' ? '' : html`<span class="note" data-state="${v.state}">${t.state[v.state]}${where}</span>`
  }<span class="uptime">${t.uptime(pct(up))}</span></div>${strip(cells, `${name} ${t.uptime(pct(up))}`)}</li>`
}

function range(i: Incident, t: Text) {
  if (i.end === undefined) return t.from(t.dateTime(i.start))
  return t.date(i.start) === t.date(i.end) ? t.between(t.dateTime(i.start), t.time(i.end)) : t.between(t.dateTime(i.start), t.dateTime(i.end))
}

const names = (i: Incident, t: Text) => i.components.map((c) => (byId.has(c) ? label(byId.get(c)!, t) : c)).join(t.listSep)

function notice(i: Incident, ts: number, t: Text) {
  const u = i.updates[0]
  const scope = i.components.length ? t.scope(names(i, t)) : ''
  const when = i.impact === 'maintenance' ? (ts < i.start ? t.plannedFor(range(i, t)) : t.ongoing(range(i, t))) : t.starts(t.dateTime(i.start))
  return html`<article class="notice" data-state="${IMPACT_STATE[i.impact]}">
<h2><a href="${at(t, `/i/${i.id}`)}">${i.title}</a></h2>
<p class="meta">${t.impact[i.impact]}${scope}${t.stop}${when}</p>
${u ? html`<div class="update"><p class="status">${t.status[u.status]}<time>${t.dateTime(u.ts)}</time></p>${raw(u.html)}</div>` : raw(i.html)}
</article>`
}

const item = (i: Incident, t: Text) =>
  html`<li>${icon(IMPACT_STATE[i.impact])}<a href="${at(t, `/i/${i.id}`)}">${i.title}</a><span class="when">${range(i, t)}</span></li>`

export async function home(DB: D1Database, t: Text): Promise<Page> {
  const ts = minute()
  const days = lastDays(ts, DAYS)
  const [l, stats] = await Promise.all([live(DB, ts, t, 3600), db.loadDays(DB, days[0])])
  const counts = (id: string) => days.map((d) => stats.get(d)?.stats[id])
  const open = incidents.filter((i) => (i.end ?? Infinity) > ts).sort((a, b) => a.start - b.start)
  const past = incidents.filter((i) => i.end !== undefined && i.end <= ts && i.end > ts - 14 * 86400)
  return {
    body: html`${hero(l)}
${open.length ? html`<section class="notices" aria-label="${t.recent}">${open.map((i) => notice(i, ts, t))}</section>` : ''}
<section aria-labelledby="services">
<div class="section-head"><h2 id="services">${t.services}</h2><span>${t.past90}</span></div>
<ul class="services">${core.map((m) => member(m, l.verdicts.get(m.id)!, days, counts(m.id), l.ts, t))}</ul>
${groups.some((g) => g.infra) ? advanced(groups.filter((g) => g.infra), l, days, counts) : ''}
</section>
<section aria-labelledby="pulse">
<div class="section-head"><h2 id="pulse">${t.lastHour}</h2></div>
${probes(l)}${pulse(l)}
</section>
<section aria-labelledby="recent">
<div class="section-head"><h2 id="recent">${t.recent}</h2><a href="${at(t, '/history')}">${t.allHistory}</a></div>
${past.length ? html`<ul class="incidents">${past.map((i) => item(i, t))}</ul>` : html`<p class="empty">${t.noRecent}</p>`}
</section>`,
  }
}

type Point = Awaited<ReturnType<typeof db.series>>[number]

function chart(points: Point[], ts: number, regions: Region[], t: Text) {
  const N = 288
  const BIN = 300
  const start = ts - N * BIN
  const series = regions.map((region) => {
    const bins: number[][] = Array.from({ length: N }, () => [])
    for (const p of points) {
      const b = Math.floor((p.ts - start) / BIN)
      if (p.region === region && p.r.o !== 'fail' && b >= 0 && b < N) bins[b].push(p.r.ms)
    }
    return { region, values: bins.map((b) => (b.length ? b.toSorted((x, y) => x - y)[b.length >> 1] : null)) }
  })
  const peak = Math.max(0, ...series.flatMap((s) => s.values.filter((v) => v !== null)))
  if (!peak) return html`<p class="empty">${t.noLatency}</p>`
  const max = [100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000, 20000].find((n) => n >= peak) ?? peak
  const x = (i: number) => ((i / (N - 1)) * 720).toFixed(1)
  const y = (v: number) => 176 - (v / max) * 168
  const d = (vs: (number | null)[]) => vs.map((v, i) => (v === null ? '' : `${i && vs[i - 1] !== null ? 'L' : 'M'}${x(i)} ${y(v).toFixed(1)}`)).join('')
  const data = {
    times: Array.from({ length: N }, (_, i) => t.time(start + i * BIN)),
    series: series.map((s) => ({ label: t.region[s.region], text: s.values.map((v) => (v === null ? t.noData : ms(v))) })),
  }
  return html`<figure class="chart">
<ul class="legend">${series.map((s) => html`<li style="--c:var(--${s.region})">${t.region[s.region]}</li>`)}</ul>
<div class="plot" data-chart="${JSON.stringify(data)}">
<svg viewBox="0 0 720 180" preserveAspectRatio="none" aria-hidden="true">${[0.5, 1].map(
    (f) => html`<line class="grid" x1="0" x2="720" y1="${y(max * f)}" y2="${y(max * f)}"/>`,
  )}${series.map((s) => html`<path class="line" style="--c:var(--${s.region})" d="${d(s.values)}"/>`)}</svg>
${[0.5, 1].map((f) => html`<span class="ylabel" style="top:${((y(max * f) / 180) * 100).toFixed(1)}%">${ms(max * f)}</span>`)}
<div class="cursor" hidden></div>
</div>
<div class="axis">${[0, 6, 12, 18].map((h) => html`<span>${t.time(start + h * 3600)}</span>`)}<span>${t.now}</span></div>
</figure>`
}

function latency(lat: Map<string, Day>, days: string[], id: string, regions: Region[], t: Text) {
  const rows = regions.map((r) => {
    const h = merge(days.map((d) => lat.get(d)?.lat[id]?.[r]))
    return [r, percentile(h, 0.5), percentile(h, 0.95)] as const
  })
  if (rows.every(([, p50]) => p50 === undefined)) return ''
  const cell = (v?: number) => (v === undefined ? '—' : ms(v))
  return html`<table class="lat"><caption>${t.past30}</caption>
<thead><tr><th scope="col">${t.probe}</th><th scope="col">${t.median}</th><th scope="col">${t.p95}</th></tr></thead>
<tbody>${rows.map(([r, p50, p95]) => html`<tr><th scope="row">${t.region[r]}</th><td>${cell(p50)}</td><td>${cell(p95)}</td></tr>`)}</tbody></table>`
}

export async function component(DB: D1Database, id: string, t: Text): Promise<Page | undefined> {
  const m = byId.get(id)
  if (!m) return
  const ts = minute()
  const days = lastDays(ts, DAYS)
  const [l, stats, lat, points, events] = await Promise.all([
    live(DB, ts, t),
    db.loadDays(DB, days[0]),
    db.loadDays(DB, days[DAYS - 30], true),
    db.series(DB, id, ts - 86400),
    db.recentEvents(DB, id),
  ])
  const v = l.verdicts.get(id)!
  const cs = days.map((d) => stats.get(d)?.stats[id])
  const since = events[0]?.state === v.state ? events[0].ts : undefined
  const regions = m.regions ?? REGIONS
  const cert = points.findLast((p) => p.r.cert !== undefined)?.r.cert
  const cells = days.map((d, i) => ({ color: barColor(cs[i]), tip: tip(d, impact(cs[i], t), measured(cs[i]), related([id], d, ts), t) }))
  const mine = incidents.filter((i) => i.components.includes(id))
  const name = label(m, t)
  return {
    title: name,
    body: html`<a class="back" href="${at(t)}">${BACK}${t.back}</a>
<section class="detail">
<h1>${name}</h1>
<p class="now">${badge(v.state, t)}${since ? html`<span class="meta">${t.since(t.duration(ts - since))}</span>` : ''}${v.err ? html`<code>${v.err}</code>` : ''}</p>
<p class="target">${m.http ?? m.tcp}</p>
<dl class="uptimes">${t.windows.map(([lbl, n]) => html`<div><dt>${t.uptimeOver(lbl)}</dt><dd>${pct(uptime(cs.slice(-n)))}</dd></div>`)}</dl>
${strip(cells, t.uptime(pct(uptime(cs))))}
<div class="axis"><span>${t.daysAgo90}</span><span>${t.today}</span></div>
</section>
<section class="block"><h2>${t.latency}</h2>${chart(points, ts, regions, t)}${latency(lat, days.slice(-30), id, regions, t)}</section>
${
  cert === undefined
    ? ''
    : html`<section class="block"><h2>${t.cert}</h2><p class="now badge">${icon(cert < 0 ? 'major' : cert <= 14 ? 'degraded' : 'operational')}<span>${
        cert < 0 ? t.certExpired : t.certLeft(cert, t.fullDate(ts + cert * 86400))
      }</span></p></section>`
}
<section class="block"><h2>${t.changes}</h2>${
      events.length
        ? html`<ol class="events">${events.map(
            (e) =>
              html`<li><time>${t.dateTime(e.ts)}</time>${badge(e.state, t)}${
                e.detail?.failed.length ? html`<span class="meta">${e.detail.failed.map((r) => t.region[r]).join(t.listSep)}</span>` : ''
              }${e.detail?.err ? html`<code>${e.detail.err}</code>` : ''}</li>`,
          )}</ol>`
        : html`<p class="empty">${t.noChanges}</p>`
    }</section>
${mine.length ? html`<section class="block"><h2>${t.related}</h2><ul class="incidents">${mine.map((i) => item(i, t))}</ul></section>` : ''}`,
  }
}

export function incident(id: string, t: Text): Page | undefined {
  const i = incidents.find((x) => x.id === id)
  if (!i) return
  const ts = minute()
  const phase =
    i.impact === 'maintenance'
      ? ts < i.start
        ? t.phase.planned
        : ts < i.end!
          ? t.phase.ongoing
          : t.phase.done
      : i.end !== undefined && i.end <= ts
        ? t.phase.resolved
        : t.phase.open
  const links = i.components.map((c) => html`<a href="${at(t, `/c/${c}`)}">${byId.has(c) ? label(byId.get(c)!, t) : c}</a>`)
  return {
    title: i.title,
    body: html`<a class="back" href="${at(t)}">${BACK}${t.back}</a>
<article class="incident">
<p class="kind">${icon(IMPACT_STATE[i.impact])}${t.impact[i.impact]}${t.stop}${phase}</p>
<h1>${i.title}</h1>
<p class="meta">${range(i, t)}${i.end !== undefined && i.end <= ts ? t.lastedFor(t.duration(i.end - i.start)) : ''}</p>
${links.length ? html`<p class="meta">${t.affects}${t.colon}${list(links, t.listSep)}</p>` : ''}
${raw(i.html)}
${
  i.updates.length
    ? html`<ol class="timeline">${i.updates.map((u) => html`<li><h2>${t.status[u.status]}</h2><time>${t.dateTime(u.ts)}</time>${raw(u.html)}</li>`)}</ol>`
    : ''
}
</article>`,
  }
}

export function history(t: Text): Page {
  const months = Map.groupBy(incidents, (i) => t.month(i.start))
  return {
    title: t.historyTitle,
    body: html`<a class="back" href="${at(t)}">${BACK}${t.back}</a>
<h1 class="page-title">${t.historyTitle}</h1>
${
  incidents.length
    ? [...months].map(([name, items]) => html`<section class="month"><h2>${name}</h2><ul class="incidents">${items.map((i) => item(i, t))}</ul></section>`)
    : html`<p class="empty" style="margin-top:16px">${t.noHistory}</p>`
}`,
  }
}

export const notFound = (t: Text): Page => ({
  title: t.notFound,
  status: 404,
  body: html`<h1 class="page-title">${t.notFound}</h1><p>${t.notFoundBody}</p><p><a href="${at(t)}">${t.notFoundLink}</a></p>`,
})

export async function summary(DB: D1Database) {
  const t = TEXT.en
  const ts = minute()
  const [l, last] = await Promise.all([live(DB, ts, t), db.lastEvents(DB)])
  return {
    state: worst(core.map((m) => l.verdicts.get(m.id)!.state)),
    updated: ts,
    probes: Object.fromEntries(REGIONS.map((r) => [r, l.seen[r] ?? null])),
    groups: groups.map((g) => ({
      name: g.name,
      infra: !!g.infra,
      components: g.items.map((m) => {
        const v = l.verdicts.get(m.id)!
        const e = last.get(m.id)
        return { id: m.id, name: m.name, state: v.state, since: e?.state === v.state ? e.ts : null, failed: v.failed, error: v.err ?? null }
      }),
    })),
    incidents: incidents
      .filter((i) => (i.end ?? Infinity) > ts)
      .map((i) => ({ id: i.id, title: i.title, impact: i.impact, components: i.components, start: i.start, end: i.end ?? null })),
  }
}

const iso = (ts: number) => new Date(ts * 1000).toISOString()

export function feed(site: string): string {
  const t = TEXT.en
  const recent = incidents.slice(0, 50)
  const updated = (i: Incident) => i.updates[0]?.ts ?? i.start
  const entry = (i: Incident) => {
    const body = i.html + i.updates.map((u) => `<p><strong>${t.status[u.status]}</strong> ${t.dateTime(u.ts)}</p>${u.html}`).join('')
    return `<entry><id>${site}/i/${i.id}</id><title>${escape(i.title)}</title><link href="${site}/i/${i.id}"/><published>${iso(i.start)}</published><updated>${iso(updated(i))}</updated><content type="html">${escape(body)}</content></entry>`
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><id>${site}/</id><title>${t.site}</title><link href="${site}/"/><link rel="self" href="${site}/feed.xml"/><updated>${iso(
    Math.max(minute() - 86400 * 365, ...recent.map(updated)),
  )}</updated>${recent.map(entry).join('')}</feed>`
}
