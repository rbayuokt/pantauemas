# Configuration

One file: `.env`. Targets, languages and digest preferences are not config
anymore; users manage those themselves in the chat.

## Environment variables

### Required

| Var | Notes |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From [@BotFather](https://t.me/BotFather). Without it the bot can't poll; `tick`/`digest` runs print messages to stdout instead of sending (dry-run mode, useful locally). |

### Schedule (all times WIB, UTC+7)

| Var | Default | Notes |
|---|---|---|
| `TICK_TIMES` | `09:15,12:15,17:15` | Comma-separated `HH:MM` price checks. HRTA publishes late morning, so one tick before, one after, one end-of-day is a sensible spread. |
| `DIGEST_TIME` | `08:00` | The silent morning summary, sent to every user who keeps /digest on. |

A tick also runs immediately at startup, so a restart never misses the day's
price.

### Alert tuning (applies to all users)

| Var | Default | What it controls |
|---|---|---|
| `REARM_BUFFER_PCT` | `0.5` | How far above a fired rung the price must recover before that rung can fire again. Raise it if choppy prices cause re-fires. |
| `DIP_LOOKBACK_DAYS` | `14` | Window for the dip detector's reference high. |
| `DIP_THRESHOLD_PCT` | `2` | Drop from that high that counts as a dip. At gold's usual volatility, 2% over two weeks is a real move; 1% would ping monthly noise. |

### ntfy (optional, self-host only)

Users enable ntfy themselves with /ntfy; the bot generates a personal random
topic per user. These vars only matter if you point everyone at your own ntfy
server instead of the public one:

| Var | Default | |
|---|---|---|
| `NTFY_SERVER` | `https://ntfy.sh` | Your server if you self-host. |
| `NTFY_TOKEN` | - | Bearer token for auth-enabled servers, used for all publishes. |

### Paths

| Var | Default | |
|---|---|---|
| `DATA_DIR` | `data` | Where `pantauemas.db` lives. |

## Per-user settings (managed in chat, stored in the db)

| Setting | Command | Default |
|---|---|---|
| Language | /language | Chosen at onboarding (en or id) |
| Targets | /watch, /targets | None; capped at 15 per user |
| Morning digest | /digest | On (but nothing sends until they have a target) |
| ntfy channel | /ntfy | Off; enabling generates a personal random topic |

## Notification behavior per event

| Event | Telegram | ntfy (if the user enabled it) |
|---|---|---|
| Target hit | Loud | Urgent priority, breaks through quiet hours |
| Dip alert | Loud (skipped if a hit already fired for that size) | Normal priority |
| Morning digest | Silent (`disable_notification`) | Not sent |

The intent: a target hit should interrupt you, the digest never should.
