import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allMessages, BOT_COMMANDS, SUPPORTED_LANGS, t } from '../src/bot/i18n.js'

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{([a-z_]+)\}/gi)].map((m) => m[1]!).sort()
}

test('every message key has every supported language', () => {
  for (const [key, variants] of Object.entries(allMessages())) {
    for (const lang of SUPPORTED_LANGS) {
      const text = variants[lang]
      assert.ok(typeof text === 'string' && text.length > 0, `${key} is missing ${lang}`)
    }
  }
})

test('placeholders match across languages', () => {
  for (const [key, variants] of Object.entries(allMessages())) {
    const reference = placeholders(variants.en)
    for (const lang of SUPPORTED_LANGS) {
      assert.deepEqual(placeholders(variants[lang]), reference, `${key} placeholders differ in ${lang}`)
    }
  }
})

test('no em dashes anywhere in the copy', () => {
  for (const [key, variants] of Object.entries(allMessages())) {
    for (const lang of SUPPORTED_LANGS) {
      assert.ok(!variants[lang].includes('\u2014'), `${key} (${lang}) contains an em dash`)
    }
  }
})

test('t() substitutes parameters', () => {
  const text = t('id', 'watch_saved', { size: '1g', target: 'Rp 2.450.000', price: 'Rp 2.504.000', gap: '2,2%' })
  assert.ok(text.includes('Rp 2.450.000'))
  assert.ok(!text.includes('{'))
})

test('bot command menus exist for both languages with the same commands', () => {
  const en = BOT_COMMANDS.en.map((c) => c.command)
  const id = BOT_COMMANDS.id.map((c) => c.command)
  assert.deepEqual(id, en)
})
