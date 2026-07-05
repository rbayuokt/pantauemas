import { log } from '../util.js'

/** Exactly one of callback_data / copy_text / url must be set (Telegram API rule). */
export interface InlineButton {
  text: string
  callback_data?: string
  copy_text?: { text: string }
  url?: string
}

export interface TgUser {
  id: number
  language_code?: string
}

export interface TgMessage {
  message_id: number
  from?: TgUser
  chat: { id: number }
  text?: string
}

export interface TgCallbackQuery {
  id: string
  from: TgUser
  message?: TgMessage
  data?: string
}

export interface TgUpdate {
  update_id: number
  message?: TgMessage
  callback_query?: TgCallbackQuery
}

export interface SendOptions {
  keyboard?: InlineButton[][]
  silent?: boolean
}

/**
 * Raw Telegram Bot API client over fetch, no SDK. Long polling via getUpdates.
 * With no token configured, sends are logged to stdout instead, which is the
 * dry-run mode used by tests and local poking.
 */
export class TelegramApi {
  constructor(private readonly token: string | null) {}

  get isLive(): boolean {
    return this.token !== null
  }

  private async call<T>(method: string, payload: Record<string, unknown>): Promise<T | null> {
    if (!this.token) {
      log(`[dry-run] ${method}: ${JSON.stringify(payload).slice(0, 400)}`)
      return null
    }
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      // Long polls need to outlive the poll timeout.
      signal: AbortSignal.timeout(method === 'getUpdates' ? 70_000 : 20_000),
    })
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string }
    if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`)
    return json.result ?? null
  }

  async sendMessage(chatId: string, text: string, opts: SendOptions = {}): Promise<void> {
    await this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_notification: opts.silent ?? false,
      ...(opts.keyboard ? { reply_markup: { inline_keyboard: opts.keyboard } } : {}),
    })
  }

  async answerCallback(callbackId: string, text?: string): Promise<void> {
    await this.call('answerCallbackQuery', { callback_query_id: callbackId, ...(text ? { text } : {}) })
  }

  async setMyCommands(commands: Array<{ command: string; description: string }>, langCode?: string): Promise<void> {
    await this.call('setMyCommands', { commands, ...(langCode ? { language_code: langCode } : {}) })
  }

  /**
   * Yields updates forever. Network errors back off and retry; a second bot
   * instance polling the same token shows up here as a 409 loop, which we
   * surface loudly since it means two containers are fighting.
   */
  async *poll(): AsyncGenerator<TgUpdate> {
    if (!this.token) {
      log('no TELEGRAM_BOT_TOKEN set, bot polling disabled (scheduler still runs)')
      return
    }
    let offset = 0
    for (;;) {
      try {
        const updates = await this.call<TgUpdate[]>('getUpdates', {
          offset,
          timeout: 50,
          allowed_updates: ['message', 'callback_query'],
        })
        for (const update of updates ?? []) {
          offset = Math.max(offset, update.update_id + 1)
          yield update
        }
      } catch (err) {
        const msg = String(err)
        log(`getUpdates error, retrying in 5s: ${msg}`)
        if (msg.includes('409')) log('409 usually means another bot instance is running with this token')
        await new Promise((r) => setTimeout(r, 5000))
      }
    }
  }
}
