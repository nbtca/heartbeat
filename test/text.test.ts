import assert from 'node:assert/strict'
import { test } from 'node:test'
import { label, LANGS, TEXT } from '../src/text.ts'

test('a monitor without a translation keeps its English name', () => {
  assert.equal(label({ name: 'Website', zh: '官网' }, TEXT.zh), '官网')
  assert.equal(label({ name: 'Website', zh: '官网' }, TEXT.en), 'Website')
  assert.equal(label({ name: 'Object storage' }, TEXT.zh), 'Object storage')
})

test('links carry the language prefix', () => {
  assert.equal(TEXT.en.dir, '')
  assert.equal(TEXT.zh.dir, '/zh')
  assert.equal(TEXT.en.name, 'English')
  assert.equal(TEXT.zh.name, '中文')
})

test('durations and counts follow the language', () => {
  assert.equal(TEXT.en.duration(60), '1 minute')
  assert.equal(TEXT.en.duration(180), '3 minutes')
  assert.equal(TEXT.en.duration(3600), '1 hour')
  assert.equal(TEXT.en.duration(7500), '2 hours, 5 minutes')
  assert.equal(TEXT.zh.duration(180), '3分钟')
  assert.equal(TEXT.zh.duration(7500), '2小时5分钟')
  assert.equal(TEXT.en.count(1), '1 service')
  assert.equal(TEXT.en.count(7), '7 services')
  assert.equal(TEXT.zh.count(7), '7 项')
})

test('both languages cover every key', () => {
  const keys = (o: object) => Object.keys(o).sort()
  assert.deepEqual(keys(TEXT.en), keys(TEXT.zh))
  for (const l of LANGS) {
    for (const [k, v] of Object.entries(TEXT[l])) assert.ok(v !== undefined && v !== '' + undefined, `${l}.${k} is missing`)
  }
})
