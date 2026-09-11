import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import config from '../monitors.ts'
import { parseIncident } from '../src/incidents.ts'
import type { Group } from '../src/types.ts'

const root = join(import.meta.dirname, '..')
const monitors = (config as Group[]).flatMap((g) => g.items)
const ids = monitors.map((m) => m.id)

for (const m of monitors) {
  if (ids.indexOf(m.id) !== ids.lastIndexOf(m.id)) throw new Error(`monitors.ts: duplicate id "${m.id}"`)
  if (!m.http === !m.tcp) throw new Error(`monitors.ts: ${m.id} needs exactly one of http or tcp`)
}

const dir = join(root, 'incidents')
const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.md'))
const incidents = await Promise.all(files.map(async (f) => parseIncident(f.slice(0, -3), await readFile(join(dir, f), 'utf8'))))

for (const i of incidents) {
  for (const c of i.components) if (!ids.includes(c)) throw new Error(`incidents/${i.id}.md: unknown component "${c}"`)
}

await writeFile(join(root, 'src/incidents.gen.json'), JSON.stringify(incidents.sort((a, b) => b.start - a.start)))
