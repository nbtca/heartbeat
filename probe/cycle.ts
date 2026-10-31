import type { Monitor, Region, Results } from '../src/types.ts'
import { Health } from './health.ts'

export class Probe {
  monitors: Monitor[] = []
  readonly health = new Health()
  readonly url: string
  readonly region: Region
  readonly token: string
  readonly check: (monitors: Monitor[], region: Region, ts: number) => Promise<Results>
  readonly request: typeof fetch
  readonly sleep: (ms: number) => Promise<void>

  constructor(
    url: string,
    region: Region,
    token: string,
    check: (monitors: Monitor[], region: Region, ts: number) => Promise<Results>,
    request: typeof fetch = fetch,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {
    this.url = url
    this.region = region
    this.token = token
    this.check = check
    this.request = request
    this.sleep = sleep
  }

  async cycle() {
    let success = false
    const ts = Math.floor(Date.now() / 60000) * 60
    const headers = { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }
    try {
      try {
        const res = await this.request(`${this.url}/api/config`, { headers, signal: AbortSignal.timeout(10_000) })
        if (!res.ok) {
          await res.body?.cancel()
          throw new Error(`HTTP ${res.status}`)
        }
        const config = await res.json() as Monitor[]
        if (!Array.isArray(config) || !config.length || config.some((m) => !m || typeof m.id !== 'string' || (!m.http && !m.tcp))) {
          throw new Error('invalid monitor config')
        }
        this.monitors = config
      } catch (e) {
        // Do not log arbitrary fetch errors: they can include request details.
        console.error('config fetch failed; using cached config:', e instanceof Error && /^HTTP \d+$/.test(e.message) ? e.message : 'network or invalid config')
      }
      if (!this.monitors.length) {
        console.error('no monitor config; skipping checks and ingest')
        return false
      }
      const results = await this.check(this.monitors, this.region, ts)
      const body = JSON.stringify({ region: this.region, ts, results })
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await this.request(`${this.url}/api/ingest`, { method: 'POST', headers, body, signal: AbortSignal.timeout(15_000) })
          await res.body?.cancel()
          if (res.ok) {
            const failing = Object.keys(results).filter((id) => results[id].o === 'fail')
            console.log(new Date(ts * 1000).toISOString(), `${Object.keys(results).length} checked,`, failing.length ? `failing: ${failing.join(', ')}` : 'all ok')
            success = true
            return true
          }
          console.error(`ingest attempt ${attempt} failed: HTTP ${res.status}`)
        } catch {
          console.error(`ingest attempt ${attempt} failed: network error`)
        }
        if (attempt < 3) await this.sleep(5_000)
      }
      return false
    } finally {
      this.health.completed(success)
      if (!success) console.error(`cycle failed; consecutive failures: ${this.health.consecutiveFailures}`)
    }
  }
}
