import { connect } from 'cloudflare:sockets'
import type { Net } from './check.ts'
import { tick, type Bindings } from './cron.ts'
import { byId, monitors } from './data.ts'
import { saveTick } from './db.ts'
import logo from './logo.svg'
import { TEXT, type Text } from './text.ts'
import { REGIONS, type Region, type Result, type Results } from './types.ts'
import * as view from './view.ts'

const net: Net = {
  async tcp(hostname, port, signal) {
    const socket = connect({ hostname, port })
    try {
      await Promise.race([socket.opened, new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))])
    } finally {
      socket.close().catch(() => {})
    }
  },
}

const CACHE = { 'cache-control': 'public, max-age=30' }
const HTML = {
  ...CACHE,
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
}
const enc = new TextEncoder()

function authorized(req: Request, env: Bindings) {
  const a = enc.encode(req.headers.get('authorization') ?? '')
  const b = enc.encode(`Bearer ${env.PROBE_TOKEN}`)
  return !!env.PROBE_TOKEN && a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b)
}

const valid = (r: any): r is Result => !!r && ['ok', 'slow', 'fail'].includes(r.o) && typeof r.ms === 'number'

async function ingest(req: Request, env: Bindings) {
  const body = await req.json<{ region?: Region; ts?: number; results?: Record<string, unknown> }>().catch(() => null)
  const region = body?.region
  if (
    !region ||
    region === 'global' ||
    !REGIONS.includes(region) ||
    typeof body.ts !== 'number' ||
    Math.abs(Date.now() / 1000 - body.ts) > 300 ||
    typeof body.results !== 'object' ||
    !body.results
  ) {
    return new Response('invalid tick', { status: 400 })
  }
  const results = Object.fromEntries(Object.entries(body.results).filter(([id, r]) => byId.has(id) && valid(r))) as Results
  await saveTick(env.DB, { region, ts: Math.floor(body.ts / 60) * 60, results })
  return new Response(null, { status: 204 })
}

const page = (p: view.Page, t: Text) => new Response(view.layout(p, t), { status: p.status ?? 200, headers: HTML })

async function route(url: URL, env: Bindings): Promise<Response> {
  if (url.pathname === '/feed.xml') return new Response(view.feed(env.SITE_URL), { headers: { ...CACHE, 'content-type': 'application/atom+xml; charset=utf-8' } })
  if (url.pathname === '/api/status') return Response.json(await view.summary(env.DB), { headers: { ...CACHE, 'access-control-allow-origin': '*' } })
  const prefixed = url.pathname.match(/^\/zh(\/.*)?$/)
  const t = TEXT[prefixed ? 'zh' : 'en']
  const path = (prefixed ? (prefixed[1] ?? '/') : url.pathname).replace(/^(.+)\/$/, '$1')
  if (path === '/') return page(await view.home(env.DB, t), t)
  if (path === '/history') return page(view.history(t), t)
  const [, kind, id] = path.match(/^\/([ci])\/([\w.-]+)$/) ?? []
  const found = kind === 'c' ? await view.component(env.DB, id, t) : kind === 'i' ? view.incident(id, t) : undefined
  return page(found ?? view.notFound(t), t)
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url)
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/status') {
      if (!authorized(req, env)) return new Response('unauthorized', { status: 401 })
      if (url.pathname === '/api/config' && req.method === 'GET') return Response.json(monitors)
      if (url.pathname === '/api/ingest' && req.method === 'POST') return ingest(req, env)
      return new Response('not found', { status: 404 })
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } })
    if (url.pathname === '/logo.svg') return new Response(logo, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' } })
    const key = new Request(url.origin + url.pathname)
    const hit = await caches.default.match(key)
    if (hit) return hit
    const res = await route(url, env)
    if (res.status === 200) ctx.waitUntil(caches.default.put(key, res.clone()))
    return res
  },

  async scheduled(controller, env) {
    await tick(env, Math.floor(controller.scheduledTime / 60000) * 60, net)
  },
} satisfies ExportedHandler<Bindings>
