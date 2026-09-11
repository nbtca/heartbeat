export type Impact = 'minor' | 'major' | 'critical' | 'maintenance'

export const STATUSES = ['investigating', 'identified', 'monitoring', 'resolved', 'scheduled', 'in_progress', 'completed'] as const
export type Status = (typeof STATUSES)[number]

export interface Update {
  status: Status
  ts: number
  html: string
}

export interface Incident {
  id: string
  title: string
  impact: Impact
  components: string[]
  start: number
  end?: number
  html: string
  updates: Update[]
}

const IMPACTS: string[] = ['minor', 'major', 'critical', 'maintenance']
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c])

const inline = (s: string) =>
  escape(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')

export function markdown(src: string): string {
  return src
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim())
      return lines.every((l) => l.startsWith('- '))
        ? `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`
        : `<p>${lines.map(inline).join('<br>')}</p>`
    })
    .join('')
}

export function parseIncident(id: string, src: string): Incident {
  const fail = (msg: string): never => {
    throw new Error(`incidents/${id}.md: ${msg}`)
  }
  const time = (s = '') => {
    const t = Date.parse(`${s.trim().replace(' ', 'T')}:00+08:00`) / 1000
    return Number.isNaN(t) ? fail(`invalid time "${s}", expected YYYY-MM-DD HH:mm`) : t
  }
  const [, front, body] = src.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/) ?? fail('missing frontmatter')
  const meta: Record<string, string> = {}
  for (const line of front.split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  if (!meta.title) fail('missing title')
  if (!IMPACTS.includes(meta.impact)) fail(`impact must be one of ${IMPACTS.join(', ')}`)
  const impact = meta.impact as Impact

  const [desc, ...sections] = body.split(/^## +/m)
  const updates = sections
    .map((section) => {
      const [head, ...rest] = section.split('\n')
      const [status, ...when] = head.trim().split(/\s+/)
      if (!STATUSES.includes(status as Status)) fail(`unknown status "${status}"`)
      return { status: status as Status, ts: time(when.join(' ')), html: markdown(rest.join('\n')) }
    })
    .sort((a, b) => b.ts - a.ts)

  const done = updates.find((u) => u.status === 'resolved' || u.status === 'completed')?.ts
  const start = meta.start ? time(meta.start) : (updates.at(-1)?.ts ?? fail('needs a start time or at least one update'))
  const end = impact === 'maintenance' ? Math.min(meta.end ? time(meta.end) : fail('maintenance needs an end time'), done ?? Infinity) : done

  return {
    id,
    title: meta.title,
    impact,
    components: (meta.components ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    start,
    ...(end !== undefined && { end }),
    html: markdown(desc),
    updates,
  }
}
