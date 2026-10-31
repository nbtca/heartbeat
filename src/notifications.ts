import type { Event } from './db.ts'
import { TEXT } from './text.ts'
import type { Region, State } from './types.ts'

const ALERT: State[] = ['partial', 'major']
const t = TEXT.en

export function message(e: Event, prev: Event | undefined, name: string): string | undefined {
  if (prev?.state === e.state) return
  if (e.monitor.startsWith('region:')) {
    const region = t.region[e.monitor.slice(7) as Region]
    if (e.state === 'nodata') return t.probeDown(region)
    if (prev) return t.probeUp(region)
    return
  }
  // Preserve silent initialization for service monitors.
  if (!prev) return
  if (ALERT.includes(e.state)) {
    const where = e.detail?.failed.length === 1 ? ` (${t.region[e.detail.failed[0]]})` : ''
    return `${name}: ${t.state[e.state]}${where}${e.detail?.err ? ` — ${e.detail.err}` : ''}`
  }
  if (ALERT.includes(prev.state) && (e.state === 'operational' || e.state === 'degraded')) {
    return t.recovered(name, t.state[prev.state], t.duration(e.ts - prev.ts))
  }
}
