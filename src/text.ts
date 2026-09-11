import type { Impact, Status } from './incidents.ts'
import type { Region, State } from './types.ts'

export const STATE: Record<State, string> = {
  operational: '正常',
  degraded: '响应缓慢',
  partial: '部分中断',
  major: '严重中断',
  maintenance: '维护中',
  nodata: '暂无数据',
}

export const REGION: Record<Region, string> = { cn: '境内', global: '境外' }

export const STATUS: Record<Status, string> = {
  investigating: '调查中',
  identified: '已定位',
  monitoring: '观察中',
  resolved: '已解决',
  scheduled: '计划中',
  in_progress: '进行中',
  completed: '已完成',
}

export const IMPACT: Record<Impact, string> = { minor: '轻微影响', major: '较大影响', critical: '严重影响', maintenance: '计划维护' }

export const cat = (a: string, b: string) =>
  (/[\w)]$/.test(a) && /^[一-鿿]/.test(b)) || (/[一-鿿]$/.test(a) && /^[\w(]/.test(b)) ? `${a} ${b}` : a + b

export function duration(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60))
  if (m < 60) return `${m} 分钟`
  if (m < 1440) return `${Math.floor(m / 60)} 小时${m % 60 ? ` ${m % 60} 分钟` : ''}`
  return `${Math.floor(m / 1440)} 天${m % 1440 >= 60 ? ` ${Math.floor((m % 1440) / 60)} 小时` : ''}`
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', ...opts })
const dateFmt = fmt({ month: 'long', day: 'numeric', weekday: 'short' })
const timeFmt = fmt({ hour: '2-digit', minute: '2-digit', hour12: false })
const fullFmt = fmt({ year: 'numeric', month: 'long', day: 'numeric' })
const monthFmt = fmt({ year: 'numeric', month: 'long' })

export const date = (ts: number) => dateFmt.format(ts * 1000)
export const time = (ts: number) => timeFmt.format(ts * 1000)
export const fullDate = (ts: number) => fullFmt.format(ts * 1000)
export const month = (ts: number) => monthFmt.format(ts * 1000)
export const dateTime = (ts: number) => `${date(ts)} ${time(ts)}`
