![pantau-emas](docs/pantau-emas.png)

# PantauEmas

A free Telegram bot that watches Indonesian physical gold (EMASKU) prices for
you and your friends. Everyone sets their own buy targets in their own language
(English or Bahasa Indonesia), and the bot pings each person the moment the
price drops into their zone. No trading, no prediction, just "it's cheap, go
get it."

## Project overview

The problem: gold shops publish a new price every day, and unless you check
manually you never know you missed your buy price until it's back up.

PantauEmas is a multi-user bot that solves it with four pieces:

- **Ladder targets per user**: everyone sets their own buy levels through a
  chat wizard (/watch, pick a brand and size, type a price). A rung fires once
  with an urgent push, then re-arms after the price recovers, so it never spams.
- **Two brands**: EMASKU (every bar size, via HRTA Gold's API) and LM Antam
  (per gram, current production, via Aneka Logam). Watch either or both.
- **Dip detection**: a 2%+ drop below the 14-day high gets flagged to everyone
  watching that bar size, even when it lands between their rungs. Targets are
  guesses; this catches what they miss.
- **Morning digest**: a daily summary per user with a cheapness read: what
  share of the last 90 days were more expensive than today, the trend, the
  buy/buyback spread, whether world gold or the rupiah moved the price, and a
  one-word verdict (CHEAP / NEUTRAL / EXPENSIVE).
- **Price history**: every size HRTA sells gets logged daily, and a one-time
  `backfill` command reconstructs about a year of history per size so the
  analysis works from day one.

One price check serves every user: the HRTA Gold API returns all bar sizes in
a single call, so 1 user or 500 costs the same three requests a day.
Everything runs on free tiers.

More detail in [`docs/`](docs/):
[architecture](docs/architecture.md) ·
[telegram bot](docs/telegram-bot.md) ·
[how it works](docs/how-it-works.md) ·
[data sources](docs/data-sources.md) ·
[configuration](docs/configuration.md) ·
[deployment](docs/deployment.md) ·
[troubleshooting](docs/troubleshooting.md)

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 22.5+, TypeScript (run via `tsx`, no build step) |
| Dependencies | Zero at runtime. Native `fetch` for HTTP, `node:sqlite` for storage |
| Bot | Raw Telegram Bot API client, long polling, inline keyboards, no SDK |
| i18n | English + Bahasa Indonesia, per-user, switchable with /language |
| Extra pushes | Per-user [ntfy](https://ntfy.sh) topics via /ntfy: guided setup, one-tap topic copy, urgent priority on target hits |
| Storage | SQLite at `data/pantauemas.db` (users, watches, prices, backfill) |
| Scheduler | Built-in WIB clock loop inside the bot process |
| Market data | HRTA Gold API, EmasKITA HTML (fallback), Aneka Logam (Antam), Yahoo Finance (gold + USD/IDR) |
| Container | Docker + docker compose, `node:22-alpine` |
| Tests | Node's built-in test runner (25 tests, in-memory SQLite) |

## Setup and run

Needs Node 22.5+ (or just Docker).

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. Then:

```sh
npm install
cp .env.example .env    # paste TELEGRAM_BOT_TOKEN
npm run backfill        # once: seeds ~1y of price history for every size
npm run bot             # long-running: bot + scheduled checks
```

Open your bot in Telegram, hit /start, pick a language, and set a target with
/watch. That's the whole onboarding, for you and anyone you share the bot with.

Other commands:

```sh
npm run tick     # one price check right now (fires due alerts)
npm run digest   # send the morning summary right now
npm test         # unit tests
```

Without `TELEGRAM_BOT_TOKEN` set, messages print to stdout instead of sending.
Handy for poking at it locally.

## Deploy

On a VPS with Docker:

```sh
git clone <your-repo-url> && cd pantauemas
cp .env.example .env       # paste the bot token
npm install && npm run backfill
docker compose up -d --build
docker logs -f pantauemas
```

All state lives in `./data/pantauemas.db`, mounted into the container, so
restarts and rebuilds lose nothing. One rule: never run two instances with the
same bot token, they'll fight over updates. Full guide in
[docs/deployment.md](docs/deployment.md).

---

Made with ❤️ and 🎵 by **rbayuokt**
