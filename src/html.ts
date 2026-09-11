import { escape } from './incidents.ts'

export class Raw {
  value: string
  constructor(value: string) {
    this.value = value
  }
}

const render = (v: unknown): string =>
  v instanceof Raw ? v.value : Array.isArray(v) ? v.map(render).join('') : v === null || v === undefined || v === false ? '' : escape(String(v))

export const raw = (s: string) => new Raw(s)

export const html = (strings: TemplateStringsArray, ...values: unknown[]) => new Raw(strings.reduce((out, s, i) => out + render(values[i - 1]) + s))
