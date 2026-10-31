import { createServer } from 'node:http'

export const STALE_MS = 180_000

export class Health {
  lastCycle = Date.now()
  lastIngest: number | null = null
  consecutiveFailures = 0

  completed(success: boolean, now = Date.now()) {
    this.lastCycle = now
    if (success) this.lastIngest = now
    this.consecutiveFailures = success ? 0 : this.consecutiveFailures + 1
  }

  response(path: string, now = Date.now()) {
    const live = now - this.lastCycle < STALE_MS
    const ready = this.lastIngest !== null && now - this.lastIngest < STALE_MS
    const status = path === '/healthz' ? (live ? 200 : 503) : path === '/readyz' ? (ready ? 200 : 503) : 404
    return { status, body: { live, ready, lastIngest: this.lastIngest, consecutiveFailures: this.consecutiveFailures } }
  }
}

export function healthServer(health: Health) {
  return createServer((req, res) => {
    const { status, body } = health.response(req.url ?? '')
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))
  })
}
