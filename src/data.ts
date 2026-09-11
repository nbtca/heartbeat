import config from '../monitors.ts'
import generated from './incidents.gen.json'
import type { Incident } from './incidents.ts'
import type { Group, Monitor } from './types.ts'

export const groups: Group[] = config
export const monitors: Monitor[] = groups.flatMap((g) => g.items)
export const byId = new Map(monitors.map((m) => [m.id, m]))
export const incidents = generated as Incident[]
