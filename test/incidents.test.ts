import assert from 'node:assert/strict'
import { test } from 'node:test'
import { markdown, parseIncident } from '../src/incidents.ts'

const t = (s: string) => Date.parse(`${s.replace(' ', 'T')}:00+08:00`) / 1000

test('parses an incident with its update timeline', () => {
  const i = parseIncident(
    '2026-09-10-repair',
    `---
title: 维修预约无法提交
impact: major
components: repair, api
---

## identified 2026-09-10 21:43
数据库连接池耗尽。

## resolved 2026-09-10 23:24
已扩容，服务恢复。
`,
  )
  assert.equal(i.title, '维修预约无法提交')
  assert.deepEqual(i.components, ['repair', 'api'])
  assert.deepEqual(
    i.updates.map((u) => u.status),
    ['resolved', 'identified'],
  )
  assert.equal(i.start, t('2026-09-10 21:43'))
  assert.equal(i.end, t('2026-09-10 23:24'))
  assert.equal(i.updates[0].html, '<p>已扩容，服务恢复。</p>')
})

test('an unresolved incident has no end', () => {
  const i = parseIncident('x', '---\ntitle: x\nimpact: minor\ncomponents: api\n---\n## investigating 2026-09-10 21:43\n排查中\n')
  assert.equal(i.end, undefined)
})

test('maintenance uses its declared window and ends early when completed', () => {
  const src = '---\ntitle: 断电\nimpact: maintenance\ncomponents: mc\nstart: 2026-09-20 08:00\nend: 2026-09-20 12:00\n---\n机房电路改造。\n'
  const planned = parseIncident('m', src)
  assert.equal(planned.start, t('2026-09-20 08:00'))
  assert.equal(planned.end, t('2026-09-20 12:00'))
  assert.equal(planned.html, '<p>机房电路改造。</p>')
  assert.equal(parseIncident('m', `${src}\n## completed 2026-09-20 10:30\n提前完成。\n`).end, t('2026-09-20 10:30'))
})

test('rejects malformed files with the file name in the error', () => {
  assert.throws(() => parseIncident('a', 'no frontmatter'), /incidents\/a\.md: missing frontmatter/)
  assert.throws(() => parseIncident('b', '---\ntitle: x\nimpact: huge\n---\n'), /impact must be one of/)
  assert.throws(() => parseIncident('c', '---\ntitle: x\nimpact: minor\n---\n## fixed 2026-09-10 10:00\n'), /unknown status "fixed"/)
  assert.throws(() => parseIncident('d', '---\ntitle: x\nimpact: minor\n---\n## resolved yesterday\n'), /invalid time/)
  assert.throws(() => parseIncident('e', '---\ntitle: x\nimpact: maintenance\nstart: 2026-09-20 08:00\n---\n'), /needs an end time/)
})

test('markdown escapes HTML and supports links, code, and lists', () => {
  assert.equal(markdown('<script>x</script>'), '<p>&lt;script&gt;x&lt;/script&gt;</p>')
  assert.equal(markdown('见 [公告](https://nbtca.space/a?b=1&c=2) 和 `api`'), '<p>见 <a href="https://nbtca.space/a?b=1&amp;c=2">公告</a> 和 <code>api</code></p>')
  assert.equal(markdown('- 一\n- 二\n\n第二段\n换行'), '<ul><li>一</li><li>二</li></ul><p>第二段<br>换行</p>')
  assert.equal(markdown('[x](javascript:alert(1))'), '<p>[x](javascript:alert(1))</p>')
})
