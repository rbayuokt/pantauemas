import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface Config {
  telegramToken: string | null
  tickTimes: string[]
  digestTime: string
  dataDir: string
  rearmBufferPct: number
  dipLookbackDays: number
  dipThresholdPct: number
  /** ntfy server used for every user's personal topic (self-hostable) */
  ntfyServer: string
  ntfyToken?: string
}

// Tiny .env loader so we stay zero-dependency. Existing env vars win.
function loadDotEnv(path = '.env'): void {
  const full = resolve(process.cwd(), path)
  if (!existsSync(full)) return
  for (const line of readFileSync(full, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = value
  }
}

function num(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw)
  return raw !== undefined && Number.isFinite(parsed) ? parsed : fallback
}

export function loadConfig(): Config {
  loadDotEnv()
  const e = process.env
  return {
    telegramToken: e.TELEGRAM_BOT_TOKEN || null,
    tickTimes: (e.TICK_TIMES ?? '09:15,12:15,17:15').split(',').map((s) => s.trim()).filter(Boolean),
    digestTime: e.DIGEST_TIME ?? '08:00',
    dataDir: e.DATA_DIR ?? 'data',
    rearmBufferPct: num(e.REARM_BUFFER_PCT, 0.5),
    dipLookbackDays: num(e.DIP_LOOKBACK_DAYS, 14),
    dipThresholdPct: num(e.DIP_THRESHOLD_PCT, 2),
    ntfyServer: e.NTFY_SERVER ?? 'https://ntfy.sh',
    ntfyToken: e.NTFY_TOKEN || undefined,
  }
}
