import { randomBytes } from 'node:crypto'
import type { Config } from '../config.js'
import type { Db } from '../core/db.js'
import { buildTimingReport } from '../core/analysis.js'
import {
  addWatch, deleteWatch, ensureUser, getUser, listWatches, MAX_WATCHES_PER_USER, mergedDaily, setLang, setNtfyTopic, toggleDigest,
} from '../core/store.js'
import { brandPrices, fetchMarket, priceOf } from '../sources/market.js'
import type { Brand, Lang, Market } from '../types.js'
import { gram, log, parsePriceInput, pct, rupiah } from '../util.js'
import type { InlineButton, TelegramApi, TgUpdate } from './api.js'
import { BOT_COMMANDS, t } from './i18n.js'
import { allPricesMessage, analyzeMessage, BRAND_LABEL, comboLabel, priceMessage, targetsMessage } from './copy.js'

const DONATION_URL = 'https://saweria.co/rbayuokt'

/** Every EMASKU size HRTA sells, used for the /watch picker. */
const EMASKU_SIZES = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100]

/** Sizes shown by /price when the user has no watches yet. */
const DEFAULT_PRICE_COMBOS: Array<{ brand: Brand; gramasi: number }> = [
  { brand: 'emasku', gramasi: 0.5 },
  { brand: 'emasku', gramasi: 1 },
  { brand: 'emasku', gramasi: 5 },
  { brand: 'antam', gramasi: 1 },
]

const LANG_KEYBOARD: InlineButton[][] = [
  [
    { text: '🇬🇧 English', callback_data: 'lang:en' },
    { text: '🇮🇩 Bahasa Indonesia', callback_data: 'lang:id' },
  ],
]

const BRAND_KEYBOARD: InlineButton[][] = [
  [
    { text: `🥇 ${BRAND_LABEL.emasku}`, callback_data: 'brand:emasku' },
    { text: `🏅 ${BRAND_LABEL.antam}`, callback_data: 'brand:antam' },
  ],
]

/** Same picker as /watch, but its callbacks run an analysis instead of the wizard. */
const ANALYZE_BRAND_KEYBOARD: InlineButton[][] = [
  [
    { text: `🥇 ${BRAND_LABEL.emasku}`, callback_data: 'abrand:emasku' },
    { text: `🏅 ${BRAND_LABEL.antam}`, callback_data: 'abrand:antam' },
  ],
]

function sizeKeyboard(prefix: 'size' | 'asize' = 'size'): InlineButton[][] {
  const buttons = EMASKU_SIZES.map((g) => ({ text: gram(g), callback_data: `${prefix}:${g}` }))
  return [buttons.slice(0, 5), buttons.slice(5)]
}

function newNtfyTopic(): string {
  return `pantauemas-${randomBytes(6).toString('hex')}`
}

interface PendingTarget {
  brand: Brand
  gramasi: number
}

export class BotHandlers {
  /** Chats mid-way through the /watch wizard, waiting for a typed price. */
  private pending = new Map<string, PendingTarget>()
  /** Last market fetch, reused for wizard context so /watch doesn't hit the APIs every tap. */
  private cachedMarket: Market | null = null
  private cachedAt = 0

  constructor(
    private readonly api: TelegramApi,
    private readonly db: Db,
    private readonly config: Config,
  ) {}

  async registerCommands(): Promise<void> {
    await this.api.setMyCommands(BOT_COMMANDS.en)
    await this.api.setMyCommands(BOT_COMMANDS.id, 'id')
  }

  private async market(): Promise<Market | null> {
    const maxAgeMs = 15 * 60 * 1000
    if (this.cachedMarket && Date.now() - this.cachedAt < maxAgeMs) return this.cachedMarket
    try {
      this.cachedMarket = await fetchMarket()
      this.cachedAt = Date.now()
      return this.cachedMarket
    } catch (err) {
      log(`market fetch for bot reply failed: ${err}`)
      return this.cachedMarket
    }
  }

  async handleUpdate(update: TgUpdate): Promise<void> {
    try {
      if (update.callback_query) await this.onCallback(update.callback_query.id, String(update.callback_query.message?.chat.id ?? update.callback_query.from.id), update.callback_query.data ?? '')
      else if (update.message?.text) await this.onMessage(String(update.message.chat.id), update.message.text.trim())
    } catch (err) {
      log(`update handling failed: ${err}`)
      const chatId = update.message ? String(update.message.chat.id) : update.callback_query ? String(update.callback_query.from.id) : null
      if (chatId) {
        const lang = getUser(this.db, chatId)?.lang ?? 'en'
        await this.api.sendMessage(chatId, t(lang, 'error_generic')).catch(() => {})
      }
    }
  }

  private async onMessage(chatId: string, text: string): Promise<void> {
    if (text.startsWith('/')) {
      const command = text.split(/[\s@]/)[0]!.toLowerCase()
      await this.onCommand(chatId, command)
      return
    }
    const pending = this.pending.get(chatId)
    if (pending) {
      await this.onTargetInput(chatId, text, pending)
      return
    }
    const lang = ensureUser(this.db, chatId).lang
    await this.api.sendMessage(chatId, t(lang, 'unknown'))
  }

  private async onCommand(chatId: string, command: string): Promise<void> {
    const existing = getUser(this.db, chatId)
    const user = ensureUser(this.db, chatId)
    const lang = user.lang

    switch (command) {
      case '/start':
        if (!existing) {
          await this.api.sendMessage(chatId, t('en', 'choose_lang'), { keyboard: LANG_KEYBOARD })
        } else {
          await this.api.sendMessage(chatId, t(lang, 'welcome_back'))
        }
        return
      case '/help':
        await this.api.sendMessage(chatId, t(lang, 'help'))
        return
      case '/watch':
        this.pending.delete(chatId)
        await this.api.sendMessage(chatId, t(lang, 'watch_pick_brand'), { keyboard: BRAND_KEYBOARD })
        return
      case '/targets': {
        const watches = listWatches(this.db, chatId)
        if (!watches.length) {
          await this.api.sendMessage(chatId, t(lang, 'targets_empty'))
        } else {
          const { text, keyboard } = targetsMessage(lang, watches)
          await this.api.sendMessage(chatId, text, { keyboard })
        }
        return
      }
      case '/price': {
        const market = await this.market()
        if (!market) {
          await this.api.sendMessage(chatId, t(lang, 'error_generic'))
          return
        }
        const watched = listWatches(this.db, chatId)
        const combos = watched.length
          ? [...new Map(watched.map((w) => [`${w.brand}:${w.gramasi}`, { brand: w.brand, gramasi: w.gramasi }])).values()]
          : DEFAULT_PRICE_COMBOS
        await this.api.sendMessage(chatId, priceMessage(lang, market, combos), {
          keyboard: [[{ text: t(lang, 'price_btn_all'), callback_data: 'price:all' }]],
        })
        return
      }
      case '/analyze':
        await this.api.sendMessage(chatId, t(lang, 'analyze_pick_brand'), { keyboard: ANALYZE_BRAND_KEYBOARD })
        return
      case '/digest': {
        const enabled = toggleDigest(this.db, chatId)
        await this.api.sendMessage(chatId, enabled ? t(lang, 'digest_on', { time: this.config.digestTime }) : t(lang, 'digest_off'))
        return
      }
      case '/ntfy': {
        const topic = user.ntfyTopic ?? newNtfyTopic()
        if (!user.ntfyTopic) setNtfyTopic(this.db, chatId, topic)
        await this.sendNtfyIntro(chatId, lang, topic)
        return
      }
      case '/donate':
        await this.api.sendMessage(chatId, t(lang, 'donate_message'), {
          keyboard: [[{ text: t(lang, 'donate_btn'), url: DONATION_URL }]],
        })
        return
      case '/language':
        await this.api.sendMessage(chatId, t(lang, 'choose_lang'), { keyboard: LANG_KEYBOARD })
        return
      case '/cancel': {
        const hadPending = this.pending.delete(chatId)
        await this.api.sendMessage(chatId, t(lang, hadPending ? 'cancel_done' : 'cancel_nothing'))
        return
      }
      default:
        await this.api.sendMessage(chatId, t(lang, 'unknown'))
    }
  }

  private async onCallback(callbackId: string, chatId: string, data: string): Promise<void> {
    const user = ensureUser(this.db, chatId)

    if (data.startsWith('lang:')) {
      const lang = (data.slice(5) === 'id' ? 'id' : 'en') as Lang
      setLang(this.db, chatId, lang)
      await this.api.answerCallback(callbackId)
      await this.api.sendMessage(chatId, t(lang, 'lang_set'))
      if (!listWatches(this.db, chatId).length) await this.api.sendMessage(chatId, t(lang, 'welcome'))
      return
    }

    if (data.startsWith('brand:')) {
      const brand: Brand = data.slice(6) === 'antam' ? 'antam' : 'emasku'
      await this.api.answerCallback(callbackId)
      if (brand === 'antam') {
        // Antam is quoted per gram, so the size step is skipped.
        this.pending.set(chatId, { brand, gramasi: 1 })
        await this.askTarget(chatId, user.lang, brand, 1)
      } else {
        await this.api.sendMessage(chatId, t(user.lang, 'watch_pick_size'), { keyboard: sizeKeyboard() })
      }
      return
    }

    if (data.startsWith('size:')) {
      const gramasi = Number(data.slice(5))
      if (!EMASKU_SIZES.includes(gramasi)) {
        await this.api.answerCallback(callbackId)
        return
      }
      this.pending.set(chatId, { brand: 'emasku', gramasi })
      await this.api.answerCallback(callbackId)
      await this.askTarget(chatId, user.lang, 'emasku', gramasi)
      return
    }

    if (data === 'analyze:menu') {
      await this.api.answerCallback(callbackId)
      await this.api.sendMessage(chatId, t(user.lang, 'analyze_pick_brand'), { keyboard: ANALYZE_BRAND_KEYBOARD })
      return
    }

    if (data.startsWith('abrand:')) {
      const brand: Brand = data.slice(7) === 'antam' ? 'antam' : 'emasku'
      await this.api.answerCallback(callbackId)
      if (brand === 'antam') {
        // Antam is quoted per gram, same shortcut as the /watch wizard.
        await this.sendAnalysis(chatId, user.lang, brand, 1)
      } else {
        await this.api.sendMessage(chatId, t(user.lang, 'analyze_pick_size'), { keyboard: sizeKeyboard('asize') })
      }
      return
    }

    if (data.startsWith('asize:')) {
      const gramasi = Number(data.slice(6))
      await this.api.answerCallback(callbackId)
      if (EMASKU_SIZES.includes(gramasi)) await this.sendAnalysis(chatId, user.lang, 'emasku', gramasi)
      return
    }

    if (data === 'price:all') {
      await this.api.answerCallback(callbackId)
      const market = await this.market()
      await this.api.sendMessage(chatId, market ? allPricesMessage(user.lang, market) : t(user.lang, 'error_generic'))
      return
    }

    if (data === 'ntfy:off') {
      setNtfyTopic(this.db, chatId, null)
      await this.api.answerCallback(callbackId)
      await this.api.sendMessage(chatId, t(user.lang, 'ntfy_off_done'))
      return
    }

    if (data === 'ntfy:new') {
      const topic = newNtfyTopic()
      setNtfyTopic(this.db, chatId, topic)
      await this.api.answerCallback(callbackId)
      await this.api.sendMessage(chatId, t(user.lang, 'ntfy_new_done'))
      await this.sendNtfyIntro(chatId, user.lang, topic)
      return
    }

    if (data.startsWith('del:')) {
      const id = Number(data.slice(4))
      const removed = deleteWatch(this.db, chatId, id)
      await this.api.answerCallback(callbackId)
      await this.api.sendMessage(chatId, t(user.lang, removed ? 'target_deleted' : 'target_gone'))
      return
    }

    await this.api.answerCallback(callbackId)
  }

  private async sendAnalysis(chatId: string, lang: Lang, brand: Brand, gramasi: number): Promise<void> {
    const market = await this.market()
    const bp = market ? brandPrices(market, brand) : null
    const size = market ? priceOf(market, brand, gramasi) : null
    if (!bp || !size) {
      await this.api.sendMessage(chatId, t(lang, 'error_generic'))
      return
    }
    const timing = buildTimingReport(mergedDaily(this.db, brand, gramasi), size)
    await this.api.sendMessage(chatId, analyzeMessage(lang, brand, bp.source, size, timing), {
      keyboard: [[{ text: t(lang, 'analyze_btn_again'), callback_data: 'analyze:menu' }]],
    })
  }

  private async askTarget(chatId: string, lang: Lang, brand: Brand, gramasi: number): Promise<void> {
    const market = await this.market()
    const size = market ? priceOf(market, brand, gramasi) : null
    await this.api.sendMessage(
      chatId,
      size
        ? t(lang, 'watch_ask_target', { size: comboLabel(brand, gramasi), price: rupiah(size.price), buyback: rupiah(size.buybackPrice) })
        : t(lang, 'watch_ask_target_noprice', { size: comboLabel(brand, gramasi) }),
    )
  }

  private async sendNtfyIntro(chatId: string, lang: Lang, topic: string): Promise<void> {
    await this.api.sendMessage(chatId, t(lang, 'ntfy_intro', { topic }), {
      keyboard: [
        [{ text: t(lang, 'ntfy_btn_copy'), copy_text: { text: topic } }],
        [
          { text: t(lang, 'ntfy_btn_off'), callback_data: 'ntfy:off' },
          { text: t(lang, 'ntfy_btn_new'), callback_data: 'ntfy:new' },
        ],
      ],
    })
  }

  private async onTargetInput(chatId: string, text: string, pending: PendingTarget): Promise<void> {
    const lang = ensureUser(this.db, chatId).lang
    const value = parsePriceInput(text)
    if (value === null) {
      await this.api.sendMessage(chatId, t(lang, 'invalid_price'))
      return
    }

    const market = await this.market()
    const size = market ? priceOf(market, pending.brand, pending.gramasi) : null

    // With a live price we can catch obvious typos (missing or extra zero).
    if (size && (value < size.price * 0.3 || value > size.price * 2)) {
      await this.api.sendMessage(chatId, t(lang, 'price_out_of_range', { price: rupiah(size.price) }))
      return
    }

    const result = addWatch(this.db, chatId, pending.brand, pending.gramasi, value)
    if (result === 'duplicate') {
      this.pending.delete(chatId)
      await this.api.sendMessage(chatId, t(lang, 'watch_duplicate'))
      return
    }
    if (result === 'limit') {
      this.pending.delete(chatId)
      await this.api.sendMessage(chatId, t(lang, 'watch_limit', { max: MAX_WATCHES_PER_USER }))
      return
    }

    this.pending.delete(chatId)
    const label = comboLabel(pending.brand, pending.gramasi)
    if (size && value >= size.price) {
      await this.api.sendMessage(chatId, t(lang, 'watch_saved_above', { target: rupiah(value), price: rupiah(size.price) }))
    } else if (size) {
      const gap = ((size.price - value) / size.price) * 100
      await this.api.sendMessage(chatId, t(lang, 'watch_saved', {
        size: label, target: rupiah(value), price: rupiah(size.price), gap: pct(gap, lang),
      }))
    } else {
      await this.api.sendMessage(chatId, t(lang, 'watch_saved', {
        size: label, target: rupiah(value), price: '?', gap: '?',
      }))
    }
  }
}
