const tip = Object.assign(document.createElement('div'), { className: 'tip', hidden: true })
document.body.append(tip)
let current = null

function show(el, text, x, top, bottom) {
  current = el
  tip.textContent = text
  tip.hidden = false
  const { width, height } = tip.getBoundingClientRect()
  const left = Math.min(Math.max(8, x - width / 2), innerWidth - width - 8)
  tip.style.transform = `translate(${left}px, ${top - height - 10 > 0 ? top - height - 10 : bottom + 10}px)`
}

function hide() {
  tip.hidden = true
  current = null
  for (const c of document.querySelectorAll('.cursor')) c.hidden = true
}

addEventListener('pointerover', (e) => {
  const el = e.target instanceof Element && e.target.closest('[data-tip]')
  if (!el) return
  const r = el.getBoundingClientRect()
  show(el, el.dataset.tip, r.left + r.width / 2, r.top, r.bottom)
})

addEventListener('pointerout', (e) => {
  if (current && !current.contains(e.relatedTarget)) hide()
})

addEventListener('pointermove', (e) => {
  const plot = e.target instanceof Element && e.target.closest('[data-chart]')
  if (!plot) return
  plot.data ??= JSON.parse(plot.dataset.chart)
  const { times, series } = plot.data
  const r = plot.getBoundingClientRect()
  const i = Math.round(((e.clientX - r.left) / r.width) * (times.length - 1))
  if (i < 0 || i >= times.length) return
  const x = (i / (times.length - 1)) * 100
  const cursor = plot.querySelector('.cursor')
  cursor.hidden = false
  cursor.style.left = `${x}%`
  show(plot, [times[i], ...series.map((s) => `${s.label} ${s.text[i]}`)].join('\n'), r.left + (x / 100) * r.width, r.top, r.bottom)
})

addEventListener('click', (e) => {
  for (const d of document.querySelectorAll('details.lang[open]')) if (!d.contains(e.target)) d.open = false
})

addEventListener('scroll', hide, { passive: true })

const rtf = new Intl.RelativeTimeFormat(document.documentElement.lang || 'en', { numeric: 'auto' })
const ago = (s) => (s < 60 ? rtf.format(-s, 'second') : s < 3600 ? rtf.format(-Math.floor(s / 60), 'minute') : rtf.format(-Math.floor(s / 3600), 'hour'))

function clock() {
  for (const el of document.querySelectorAll('[data-since]')) {
    el.textContent = ago(Math.max(0, Math.round(Date.now() / 1000 - Number(el.dataset.since))))
  }
}

async function refresh() {
  if (document.hidden) return
  const res = await fetch(location.href, { cache: 'no-store' }).catch(() => null)
  if (!res?.ok) return
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const main = document.querySelector('main')
  const next = doc.querySelector('main')
  if (!main || !next) return
  const style = document.querySelector('style')
  const restyle = doc.querySelector('style')
  if (style && restyle && style.textContent !== restyle.textContent) style.textContent = restyle.textContent
  for (const d of main.querySelectorAll('details[open][data-key]')) {
    next.querySelector(`details[data-key="${CSS.escape(d.dataset.key)}"]`)?.setAttribute('open', '')
  }
  const pulse = next.querySelector('.pulse')
  pulse?.classList.remove('intro')
  if (pulse && pulse.dataset.latest !== main.querySelector('.pulse')?.dataset.latest) pulse.classList.add('fresh')
  hide()
  main.replaceWith(next)
  document.title = doc.title
  clock()
}

clock()
refresh()
setInterval(clock, 1000)
setInterval(refresh, 60_000)
document.addEventListener('visibilitychange', refresh)
