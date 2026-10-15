export type Region = 'cn' | 'global'
export const REGIONS: Region[] = ['cn', 'global']

export interface Monitor {
  id: string
  name: string
  zh?: string
  role: string
  roleZh?: string
  http?: string
  tcp?: string
  minecraft?: boolean
  head?: boolean
  status?: number
  expect?: string
  every?: number
  slowMs?: number
  regions?: Region[]
}

export interface Group {
  name: string
  zh?: string
  items: Monitor[]
  infra?: boolean
}

export type Outcome = 'ok' | 'slow' | 'fail'

export interface Result {
  o: Outcome
  ms: number
  err?: string
  cert?: number
  players?: [online: number, max: number]
}

export type Results = Record<string, Result>

export interface Tick {
  region: Region
  ts: number
  results: Results
}

export type State = 'operational' | 'degraded' | 'partial' | 'major' | 'maintenance' | 'nodata'
