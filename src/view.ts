import { SLOW_MS } from './check.ts'
import client from './client.js'
import { byId, core, groups, incidents, monitors } from './data.ts'
import * as db from './db.ts'
import { html, raw, type Raw } from './html.ts'
import { escape, type Incident } from './incidents.ts'
import css from './page.css'
import { barColor, downtime, lastDays, merge, percentile, stateAt, uptime, window, worst, type Counts, type Day, type Verdict } from './status.ts'
import { cat, date, dateTime, duration, fullDate, IMPACT, month, REGION, STATE, STATUS, time } from './text.ts'
import { REGIONS, type Group, type Monitor, type Region, type State, type Tick } from './types.ts'

export interface Page {
  title?: string
  body: Raw
  status?: number
}

const SITE = 'NBTCA 服务状态'
const DAYS = 90
const IMPACT_STATE = { minor: 'degraded', major: 'partial', critical: 'major', maintenance: 'maintenance' } as const
const HEADLINE: Partial<Record<State, string>> = {
  degraded: '部分服务响应缓慢',
  partial: '部分服务出现中断',
  major: '部分服务严重中断',
  maintenance: '部分服务正在维护',
}
const BEAT = 'h2.5q.6 -2.4 1.2 0h.5l.4 2l.7 -22l.7 25l.4 -5h.6q.8 -5 1.6 0h1.4'

const minute = () => Math.floor(Date.now() / 60000) * 60
const noon = (day: string) => Date.parse(`${day}T12:00:00+08:00`) / 1000
const calm = (s: State) => s === 'operational' || s === 'nodata'
const pct = (u?: number) => (u === undefined ? '—' : u === 1 ? '100%' : `${(Math.floor(u * 10000) / 100).toFixed(2)}%`)
const ms = (v: number) => (v >= 1000 ? `${Number((v / 1000).toPrecision(2))} s` : `${Number(v.toPrecision(2))} ms`)
const list = (items: unknown[]) => items.flatMap((x, i) => (i ? ['、', x] : [x]))

const icon = (s: State) => html`<svg class="icon" data-state="${s}" aria-hidden="true"><use href="#i-${s}"/></svg>`
const badge = (s: State) => html`<span class="badge">${icon(s)}${STATE[s]}</span>`

const SPRITE = raw(`<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="i-operational" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" stroke="none"/><path fill="none" d="M4.8 8.3l2.1 2.1 4.3-4.6"/></symbol>
<symbol id="i-degraded" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" stroke="none"/><path fill="none" d="M4.4 9.4l2.3-2.6 2.4 2.2 2.5-3"/></symbol>
<symbol id="i-partial" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" stroke="none"/><path fill="none" d="M8 4.5v4.3M8 11.3v.2"/></symbol>
<symbol id="i-major" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" stroke="none"/><path fill="none" d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"/></symbol>
<symbol id="i-maintenance" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" stroke="none"/><path fill="none" d="M8 4.6V8l2.3 1.5"/></symbol>
<symbol id="i-nodata" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" stroke="none"/><path fill="none" d="M5.3 8h5.4"/></symbol>
</defs></svg>`)

export function layout(p: Page): string {
  return `<!doctype html>${
    html`<html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.title ? `${p.title} - ${SITE}` : SITE}</title>
<meta name="description" content="NBTCA 各项服务的实时状态、可用率与事件记录">
<link rel="icon" href="/logo.webp" type="image/webp">
<link rel="alternate" type="application/atom+xml" href="/feed.xml" title="${SITE}">
<style>${raw(css)}</style>
</head><body>
${SPRITE}
<div class="wrap">
<header class="top"><a class="brand" href="/"><img src="/logo.webp" alt="" width="28" height="28">${SITE}</a><a class="subscribe" href="/feed.xml">订阅更新</a></header>
<main>${p.body}</main>
<footer class="foot"><span>每分钟从境内、境外两个探测点各检测一次</span><a href="https://github.com/nbtca/heartbeat">GitHub</a></footer>
</div>
<script>${raw(client)}</script>
</body></html>`.value
  }`
}

interface Live {
  ts: number
  recent: Tick[]
  verdicts: Map<string, Verdict>
  seen: Partial<Record<Region, number>>
}

async function live(DB: D1Database, ts: number, span = 0): Promise<Live> {
  const recent = await db.ticksSince(DB, ts - span - 180)
  const w = window(recent, ts)
  const seen: Partial<Record<Region, number>> = {}
  for (const t of recent) seen[t.region] = Math.max(seen[t.region] ?? 0, t.ts)
  return { ts, recent, verdicts: new Map(monitors.map((m) => [m.id, stateAt(m, w, ts, incidents)])), seen }
}

function related(ids: string[], day: string, now: number) {
  const from = noon(day) - 43200
  return incidents.filter((i) => i.components.some((c) => ids.includes(c)) && i.start < from + 86400 && (i.end ?? now) >= from)
}

function impact(c?: Counts): string[] {
  if (!c) return []
  return [
    c[3] && `严重中断 ${duration(c[3] * 60)}`,
    c[2] && `部分中断 ${duration(c[2] * 60)}`,
    c[1] && `响应缓慢 ${duration(c[1] * 60)}`,
    c[4] && `维护 ${duration(c[4] * 60)}`,
  ].filter((x): x is string => !!x)
}

const measured = (c?: Counts) => !!c && c[0] + c[1] + c[2] + c[3] + c[4] > 0

function tip(day: string, lines: string[], hasData: boolean, rel: Incident[]) {
  return [date(noon(day)), ...(lines.length ? lines : [hasData ? '无中断记录' : '无数据']), ...rel.map((i) => `事件：${i.title}`)].join('\n')
}

function combine(cs: (Counts | undefined)[]): Counts | undefined {
  let pick: Counts | undefined
  for (const c of cs) if (c && (!pick || downtime(c) > downtime(pick) || (downtime(c) === downtime(pick) && c[4] > pick[4]))) pick = c
  return pick
}

const strip = (cells: { color: string; tip: string }[], label: string) =>
  html`<div class="bars" role="img" aria-label="${label}">${cells.map((c) => html`<i style="--c:${c.color}" data-tip="${c.tip}"></i>`)}</div>`

function explain(m: Monitor, v: Verdict, ts: number): string {
  if (v.state === 'maintenance') return '正在进行计划维护'
  const declared = incidents.some((i) => i.impact !== 'maintenance' && i.components.includes(m.id) && ts >= i.start && ts < (i.end ?? Infinity))
  if (declared && !v.failed.length) return '已发布事件公告'
  const err = v.err ? `（${v.err}）` : ''
  if (v.state === 'major') return `${(m.regions ?? REGIONS).length > 1 ? '境内外探测点均' : '探测点'}连续访问失败${err}`
  if (v.state === 'partial') return `${v.failed.map((r) => REGION[r]).join('、')}探测点连续访问失败${err}，其他地区访问正常`
  return `响应时间超过 ${(m.slowMs ?? SLOW_MS) / 1000} 秒或结果不稳定`
}

function hero(l: Live) {
  const state = (m: Monitor) => l.verdicts.get(m.id)!.state
  const affected = core.filter((m) => !calm(state(m)))
  const fine = core.filter((m) => state(m) === 'operational').length
  const rest = fine ? `其余 ${fine} 项服务运行正常。` : ''
  const overall = worst(core.map(state))
  const [title, lede] =
    overall === 'nodata'
      ? ['正在收集数据', '探测点上报第一批结果后，这里会显示各项服务的状态。']
      : !affected.length
        ? ['一切正常', `全部 ${core.length} 项服务运行正常。`]
        : affected.length === 1
          ? [cat(affected[0].name, STATE[state(affected[0])]), `${explain(affected[0], l.verdicts.get(affected[0].id)!, l.ts)}。${rest}`]
          : [HEADLINE[overall]!, `${affected.map((m) => cat(m.name, STATE[state(m)])).join('、')}。${rest}`]
  return html`<section class="hero"><div class="banner" data-state="${overall}"><h1>${icon(overall)}${title}</h1><p class="lede">${lede}</p></div></section>`
}

function probes(l: Live) {
  return html`<p class="probes">${REGIONS.map((r) => {
    const last = l.seen[r]
    return last && last > l.ts - 180
      ? html`<span class="probe" data-on>${REGION[r]}探测点 <span data-since="${last}">${time(last)} 更新</span></span>`
      : html`<span class="probe">${REGION[r]}探测点离线</span>`
  })}</p>`
}

function pulse(l: Live) {
  const beats = Array.from({ length: 60 }, (_, i) => {
    const t = l.ts - (59 - i) * 60
    const w = window(l.recent, t)
    const vs = core.map((m) => [m, stateAt(m, w, t, incidents)] as const)
    return { t, state: worst(vs.map(([, v]) => v.state)), hurt: vs.filter(([, v]) => !calm(v.state)) }
  })
  const latest = Math.max(0, ...Object.values(l.seen))
  return html`<figure class="pulse intro" data-latest="${latest}">
<div class="trace"><svg viewBox="0 0 600 56" preserveAspectRatio="none" role="img" aria-label="最近 60 分钟的整体状态">${beats.map((b, i) =>
    b.state === 'nodata' ? html`<path class="flat" d="M${i * 10} 36h10"/>` : html`<path data-state="${b.state}" d="M${i * 10} 36${BEAT}"/>`,
  )}${beats.map(
    (b, i) =>
      html`<rect x="${i * 10}" width="10" height="56" data-tip="${[
        time(b.t),
        ...(b.hurt.length ? b.hurt.map(([m, v]) => cat(m.name, STATE[v.state])) : [b.state === 'nodata' ? '无数据' : '全部正常']),
      ].join('\n')}"/>`,
  )}</svg><span class="live" data-state="${beats[59].state}"></span></div>
<figcaption><span>60 分钟前</span><span>现在</span></figcaption>
</figure>`
}

function group(g: Group, l: Live, days: string[], counts: (id: string) => (Counts | undefined)[]) {
  const state = worst(g.items.map((m) => l.verdicts.get(m.id)!.state))
  const per = g.items.map((m) => counts(m.id))
  const ups = per.map(uptime).filter((u) => u !== undefined)
  const up = ups.length ? ups.reduce((a, b) => a + b) / ups.length : undefined
  const ids = g.items.map((m) => m.id)
  const cells = days.map((d, i) => {
    const cs = per.map((c) => c[i])
    const lines = g.items.flatMap((m, j) => impact(cs[j]).map((t) => cat(m.name, t)))
    return { color: barColor(combine(cs)), tip: tip(d, lines, cs.some(measured), related(ids, d, l.ts)) }
  })
  return html`<details class="group" data-key="${g.name}"${calm(state) ? '' : raw(' open')}>
<summary><span class="row">${icon(state)}<span class="name">${g.name}</span>${
    calm(state) ? html`<span class="count">${g.items.length} 项</span>` : html`<span class="note">${STATE[state]}</span>`
  }<span class="uptime">${pct(up)} 可用</span><svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg></span>${strip(
    cells,
    `${g.name}过去 90 天可用率 ${pct(up)}`,
  )}</summary>
<ul class="members">${g.items.map((m, j) => member(m, l.verdicts.get(m.id)!, days, per[j], l.ts))}</ul>
</details>`
}

function advanced(gs: Group[], l: Live, days: string[], counts: (id: string) => (Counts | undefined)[]) {
  const items = gs.flatMap((g) => g.items)
  const state = worst(items.map((m) => l.verdicts.get(m.id)!.state))
  return html`<details class="advanced" data-key="infra"${calm(state) ? '' : raw(' open')}>
<summary>${icon(state)}<span class="name">开发与基础设施</span>${
    calm(state) ? html`<span class="count">${items.length} 项</span>` : html`<span class="note">${STATE[state]}</span>`
  }<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg></summary>
<div class="panel">${gs.map((g) => group(g, l, days, counts))}</div>
</details>`
}

function member(m: Monitor, v: Verdict, days: string[], cs: (Counts | undefined)[], now: number) {
  const up = uptime(cs)
  const cells = days.map((d, i) => ({ color: barColor(cs[i]), tip: tip(d, impact(cs[i]), measured(cs[i]), related([m.id], d, now)) }))
  const where = v.failed.length === 1 && v.state === 'partial' ? `（${REGION[v.failed[0]]}）` : ''
  return html`<li><div class="row">${icon(v.state)}<a class="name" href="/c/${m.id}">${m.name}</a>${
    v.state === 'operational' ? '' : html`<span class="note">${STATE[v.state]}${where}</span>`
  }<span class="uptime">${pct(up)} 可用</span></div>${strip(cells, `${m.name}过去 90 天可用率 ${pct(up)}`)}</li>`
}

function range(i: Incident) {
  if (i.end === undefined) return `${dateTime(i.start)} 起`
  return date(i.start) === date(i.end) ? `${dateTime(i.start)} 至 ${time(i.end)}` : `${dateTime(i.start)} 至 ${dateTime(i.end)}`
}

const names = (i: Incident) => i.components.map((c) => byId.get(c)?.name ?? c).join('、')

function notice(i: Incident, ts: number) {
  const u = i.updates[0]
  const scope = i.components.length ? cat('，涉及', names(i)) : ''
  const when = i.impact === 'maintenance' ? `${ts < i.start ? '计划于' : '维护中，'}${range(i)}` : `${dateTime(i.start)} 开始`
  return html`<article class="notice" data-state="${IMPACT_STATE[i.impact]}">
<h2><a href="/i/${i.id}">${i.title}</a></h2>
<p class="meta">${IMPACT[i.impact]}${scope}。${when}</p>
${u ? html`<div class="update"><p class="status">${STATUS[u.status]}<time>${dateTime(u.ts)}</time></p>${raw(u.html)}</div>` : raw(i.html)}
</article>`
}

const item = (i: Incident) => html`<li>${icon(IMPACT_STATE[i.impact])}<a href="/i/${i.id}">${i.title}</a><span class="when">${range(i)}</span></li>`

export async function home(DB: D1Database): Promise<Page> {
  const ts = minute()
  const days = lastDays(ts, DAYS)
  const [l, stats] = await Promise.all([live(DB, ts, 3600), db.loadDays(DB, days[0])])
  const counts = (id: string) => days.map((d) => stats.get(d)?.stats[id])
  const open = incidents.filter((i) => (i.end ?? Infinity) > ts).sort((a, b) => a.start - b.start)
  const past = incidents.filter((i) => i.end !== undefined && i.end <= ts && i.end > ts - 14 * 86400)
  return {
    body: html`${hero(l)}
${open.length ? html`<section class="notices" aria-label="进行中的事件">${open.map((i) => notice(i, ts))}</section>` : ''}
<section aria-labelledby="services">
<div class="section-head"><h2 id="services">服务</h2><span>过去 90 天</span></div>
<ul class="services">${core.map((m) => member(m, l.verdicts.get(m.id)!, days, counts(m.id), l.ts))}</ul>
${groups.some((g) => g.infra) ? advanced(groups.filter((g) => g.infra), l, days, counts) : ''}
</section>
<section aria-labelledby="pulse">
<div class="section-head"><h2 id="pulse">最近 60 分钟</h2></div>
${probes(l)}${pulse(l)}
</section>
<section aria-labelledby="recent">
<div class="section-head"><h2 id="recent">近期事件</h2><a href="/history">全部历史</a></div>
${past.length ? html`<ul class="incidents">${past.map(item)}</ul>` : html`<p class="empty">过去 14 天没有事件。</p>`}
</section>`,
  }
}

type Point = Awaited<ReturnType<typeof db.series>>[number]

function chart(points: Point[], ts: number, regions: Region[]) {
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
  if (!peak) return html`<p class="empty">最近 24 小时还没有响应时间数据。</p>`
  const max = [100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000, 20000].find((n) => n >= peak) ?? peak
  const x = (i: number) => ((i / (N - 1)) * 720).toFixed(1)
  const y = (v: number) => 176 - (v / max) * 168
  const d = (vs: (number | null)[]) => vs.map((v, i) => (v === null ? '' : `${i && vs[i - 1] !== null ? 'L' : 'M'}${x(i)} ${y(v).toFixed(1)}`)).join('')
  const data = {
    times: Array.from({ length: N }, (_, i) => time(start + i * BIN)),
    series: series.map((s) => ({ label: REGION[s.region], text: s.values.map((v) => (v === null ? '无数据' : ms(v))) })),
  }
  return html`<figure class="chart">
<ul class="legend">${series.map((s) => html`<li style="--c:var(--${s.region})">${REGION[s.region]}</li>`)}</ul>
<div class="plot" data-chart="${JSON.stringify(data)}">
<svg viewBox="0 0 720 180" preserveAspectRatio="none" aria-hidden="true">${[0.5, 1].map(
    (f) => html`<line class="grid" x1="0" x2="720" y1="${y(max * f)}" y2="${y(max * f)}"/>`,
  )}${series.map((s) => html`<path class="line" style="--c:var(--${s.region})" d="${d(s.values)}"/>`)}</svg>
${[0.5, 1].map((f) => html`<span class="ylabel" style="top:${((y(max * f) / 180) * 100).toFixed(1)}%">${ms(max * f)}</span>`)}
<div class="cursor" hidden></div>
</div>
<div class="axis">${[0, 6, 12, 18].map((h) => html`<span>${time(start + h * 3600)}</span>`)}<span>现在</span></div>
</figure>`
}

function latency(lat: Map<string, Day>, days: string[], id: string, regions: Region[]) {
  const rows = regions.map((r) => {
    const h = merge(days.map((d) => lat.get(d)?.lat[id]?.[r]))
    return [r, percentile(h, 0.5), percentile(h, 0.95)] as const
  })
  if (rows.every(([, p50]) => p50 === undefined)) return ''
  const cell = (v?: number) => (v === undefined ? '—' : ms(v))
  return html`<table class="lat"><caption>过去 30 天</caption>
<thead><tr><th scope="col">探测点</th><th scope="col">中位数</th><th scope="col">P95</th></tr></thead>
<tbody>${rows.map(([r, p50, p95]) => html`<tr><th scope="row">${REGION[r]}</th><td>${cell(p50)}</td><td>${cell(p95)}</td></tr>`)}</tbody></table>`
}

export async function component(DB: D1Database, id: string): Promise<Page | undefined> {
  const m = byId.get(id)
  if (!m) return
  const ts = minute()
  const days = lastDays(ts, DAYS)
  const [l, stats, lat, points, events] = await Promise.all([
    live(DB, ts),
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
  const cells = days.map((d, i) => ({ color: barColor(cs[i]), tip: tip(d, impact(cs[i]), measured(cs[i]), related([id], d, ts)) }))
  const mine = incidents.filter((i) => i.components.includes(id))
  return {
    title: m.name,
    body: html`<a class="back" href="/">全部服务</a>
<section class="detail">
<h1>${m.name}</h1>
<p class="now">${badge(v.state)}${since ? html`<span class="meta">已持续 ${duration(ts - since)}</span>` : ''}${v.err ? html`<code>${v.err}</code>` : ''}</p>
<p class="target">${m.http ?? m.tcp}</p>
<dl class="uptimes">${(
      [
        ['今天', 1],
        ['7 天', 7],
        ['30 天', 30],
        ['90 天', 90],
      ] as const
    ).map(([label, n]) => html`<div><dt>${label}可用率</dt><dd>${pct(uptime(cs.slice(-n)))}</dd></div>`)}</dl>
${strip(cells, `过去 90 天可用率 ${pct(uptime(cs))}`)}
<div class="axis"><span>90 天前</span><span>今天</span></div>
</section>
<section class="block"><h2>响应时间</h2>${chart(points, ts, regions)}${latency(lat, days.slice(-30), id, regions)}</section>
${
  cert === undefined
    ? ''
    : html`<section class="block"><h2>HTTPS 证书</h2><p class="now badge">${icon(cert < 0 ? 'major' : cert <= 14 ? 'degraded' : 'operational')}<span>${
        cert < 0 ? '证书已过期' : `还有 ${cert} 天到期（${fullDate(ts + cert * 86400)}）`
      }</span></p></section>`
}
<section class="block"><h2>最近状态变化</h2>${
      events.length
        ? html`<ol class="events">${events.map(
            (e) =>
              html`<li><time>${dateTime(e.ts)}</time>${badge(e.state)}${e.detail?.failed.length ? html`<span class="meta">${e.detail.failed.map((r) => REGION[r]).join('、')}</span>` : ''}${
                e.detail?.err ? html`<code>${e.detail.err}</code>` : ''
              }</li>`,
          )}</ol>`
        : html`<p class="empty">近期没有状态变化。</p>`
    }</section>
${mine.length ? html`<section class="block"><h2>相关事件</h2><ul class="incidents">${mine.map(item)}</ul></section>` : ''}`,
  }
}

export function incident(id: string): Page | undefined {
  const i = incidents.find((x) => x.id === id)
  if (!i) return
  const ts = minute()
  const phase =
    i.impact === 'maintenance' ? (ts < i.start ? '计划中' : ts < i.end! ? '进行中' : '已完成') : i.end !== undefined && i.end <= ts ? '已解决' : '处理中'
  const links = i.components.map((c) => html`<a href="/c/${c}">${byId.get(c)?.name ?? c}</a>`)
  return {
    title: i.title,
    body: html`<a class="back" href="/">全部服务</a>
<article class="incident">
<p class="kind">${icon(IMPACT_STATE[i.impact])}${IMPACT[i.impact]}，${phase}</p>
<h1>${i.title}</h1>
<p class="meta">${range(i)}${i.end !== undefined && i.end <= ts ? `，持续 ${duration(i.end - i.start)}` : ''}</p>
${links.length ? html`<p class="meta">涉及服务：${list(links)}</p>` : ''}
${raw(i.html)}
${
  i.updates.length
    ? html`<ol class="timeline">${i.updates.map((u) => html`<li><h2>${STATUS[u.status]}</h2><time>${dateTime(u.ts)}</time>${raw(u.html)}</li>`)}</ol>`
    : ''
}
</article>`,
  }
}

export function history(): Page {
  const months = Map.groupBy(incidents, (i) => month(i.start))
  return {
    title: '历史事件',
    body: html`<a class="back" href="/">全部服务</a>
<h1 class="page-title">历史事件</h1>
${
  incidents.length
    ? [...months].map(([name, items]) => html`<section class="month"><h2>${name}</h2><ul class="incidents">${items.map(item)}</ul></section>`)
    : html`<p class="empty" style="margin-top:16px">还没有记录过事件。</p>`
}`,
  }
}

export const notFound = (): Page => ({
  title: '页面不存在',
  status: 404,
  body: html`<h1 class="page-title">页面不存在</h1><p>这个地址没有对应的页面，可能对应的服务或事件已被移除。</p><p><a href="/">返回服务状态</a></p>`,
})

export async function summary(DB: D1Database) {
  const ts = minute()
  const [l, last] = await Promise.all([live(DB, ts), db.lastEvents(DB)])
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
  const recent = incidents.slice(0, 50)
  const updated = (i: Incident) => i.updates[0]?.ts ?? i.start
  const entry = (i: Incident) => {
    const body = i.html + i.updates.map((u) => `<p><strong>${STATUS[u.status]}</strong> ${dateTime(u.ts)}</p>${u.html}`).join('')
    return `<entry><id>${site}/i/${i.id}</id><title>${escape(i.title)}</title><link href="${site}/i/${i.id}"/><published>${iso(i.start)}</published><updated>${iso(updated(i))}</updated><content type="html">${escape(body)}</content></entry>`
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><id>${site}/</id><title>${SITE}</title><link href="${site}/"/><link rel="self" href="${site}/feed.xml"/><updated>${iso(
    Math.max(minute() - 86400 * 365, ...recent.map(updated)),
  )}</updated>${recent.map(entry).join('')}</feed>`
}
