# The Telegram bot

Everything user-facing happens in Telegram. This doc covers the commands, the
conversation flows, and how the bilingual copy works.

## Commands

Menu order is deliberate: /price sits first because checking the price is the
most frequent thing anyone does.

| Command | What it does |
|---|---|
| /price | Current prices for the sizes you watch (or sensible defaults), plus a button that expands to the full board: every size of every source, one block per source, so Antam's price differences between Logam Mulia, IndoGold, Galeri 24 and Aneka Logam stay visible |
| /analyze | Pick a brand and size, get a statistical buy-timing read: 90-day range, percentile, trend, and a transparent 4-signal checklist with a verdict |
| /watch | Wizard: pick a brand and size, type a target price |
| /targets | List your targets with status, tap one to remove it |
| /digest | Toggle the morning summary on or off |
| /ntfy | Personal ntfy topic for urgent pushes that break silent mode |
| /language | Switch between English and Bahasa Indonesia anytime |
| /help | Command list plus how alerts behave |
| /donate | Saweria link for anyone who wants to help with server costs |
| /start | Onboarding. New users pick a language first, then get a short intro |
| /cancel | Back out of a half-finished wizard |

The command menu (the / button in Telegram) is registered in both languages;
Telegram picks the right one based on the user's app language.

## The /watch wizard

Up to four steps, hard to get wrong:

1. **Brand picker**: EMASKU or Antam. EMASKU comes in every bar size; Antam
   watches track the 1g bar (the per-gram reference every source quotes), so
   picking Antam skips the size step entirely. The full /price board still
   lists every Antam denomination the sources return.
2. **Size picker** (EMASKU only): inline keyboard, 0.1g to 100g.
3. **Target prompt**: shows the current price and buyback for the chosen gold
   as context, then asks for a number. Accepts `2450000`, `2.450.000`,
   `2,450,000`, even `Rp 2450000`.
4. **Confirmation**: echoes the saved target and how far the price has to fall.

Guardrails, because typed prices attract typos:

- Input that is not a number gets a friendly retry, not an error dump.
- A value wildly off the current price (below 30% or above 200%) is treated as
  a probable missing/extra zero and bounced back with the current price shown.
- A target above the current price is allowed (maybe intentional) but the bot
  warns it will fire on the very next check.
- Duplicates are caught, and there's a per-user cap of 15 targets.

State for the wizard (waiting for a typed price) lives in memory. If the bot
restarts mid-wizard, the user just taps /watch again; nothing breaks.

## The /analyze view

Same brand/size picker as /watch, but instead of setting a target it answers
"is now a decent time to buy?" with statistics only, no prediction. The
message leads with the verdict and a buy-confidence percentage, then breaks
the detail into scannable sections (💰 price, 🏷 today by source, 📈 last 90
days with a text gauge of where today sits in the range, 🌍 world market,
🎯 signals):

- Buy confidence: a 0-100% blend of the same statistics behind the signals -
  cheaper-than percentile (40%), position in the 90-day range (30%), distance
  from the 7-day average (15%), and dip depth off the 14-day high (15%).
  Continuous where the checklist is yes/no, so two "3/4" days can still read
  62% vs 85%.
- By source (brands with 2+ live sources, i.e. Antam): the same size quoted
  by every source that responded, sorted cheapest first with the premium over
  the cheapest, plus which source pays the best buyback today. The verdict
  itself stays single because the history behind the statistics is one daily
  series; what differs between sources is today's price, and that's what the
  block shows.
- Context: current price and spread, the 90-day low/high, the cheaper-than
  percentile, the 7d-vs-30d trend, and how far today sits below the 14-day
  high. With `METALPRICE_API_KEY` set, also world gold and USD/IDR with a
  day-over-day "mover" attribution - read from the daily snapshot the
  scheduler stores, never fetched per tap (the free plan is 100 calls/month;
  see [configuration](configuration.md)).
- A checklist of four yes/no signals, each shown with a ✅/⬜ so the verdict is
  never a black box: cheaper than 60%+ of the last 90 days, in the bottom 35%
  of the 90-day range, at or below the 7-day average, and dipped 1%+ off the
  14-day high.
- The score maps to a verdict: 3-4 green "good day to buy", 2 yellow
  "decent, not special", 0-1 red "pricey, patience pays".
- If the requested size has under 20 days of history (say the one-time
  backfill was never run), the bot backfills that one series on the spot from
  world gold and USD/IDR, exactly like `npm run backfill` does, then answers
  normally. Only if that synthesis also fails (Yahoo down) does it fall back
  to an honest "not enough history yet".

Every message ends with the source and a "statistics, not financial advice"
footnote.

## Alert behavior

- **Target hit**: sent as a normal (loud) message the moment a tick sees the
  price at or below a rung. Multiple rungs crossed in one drop arrive as one
  message, not a barrage. Includes buyback, spread, and the next rung down.
- **Dip alert**: quieter tone, sent to everyone watching that size when the
  price sits 2%+ below its 14-day high without touching their rungs. Skipped
  for anyone who already got a target hit for that size in the same tick.
- **Morning digest**: sent silently (no notification sound) around 08:00 WIB
  to users who keep it on. Users with no targets get nothing rather than nags.
- A user who blocks the bot just gets logged and skipped; nobody else's
  alerts are affected.

## ntfy per user

Telegram alerts respect silent mode; sometimes you don't want them to. /ntfy
gives each user a personal random topic (like `pantauemas-a1b2c3d4e5f6`) on
ntfy.sh. Once they subscribe to it in the ntfy app, their target hits also
arrive there with urgent priority (breaks through quiet hours) and dips with
normal priority. The digest stays Telegram-only.

The setup flow is deliberately copy-paste-proof: the message shows the steps
(install the app, subscribe, done), the topic renders as monospace, and a
**📋 Copy topic** button puts it straight on the clipboard via Telegram's
native `copy_text` button, so nobody ever types a 12-hex-char topic by hand.

Two more buttons manage the channel: turn it off, or rotate to a fresh topic
(useful if a topic name leaked; the old one simply stops receiving). Topic
names are the only access control on the free public server, hence random and
per-user. New users learn the feature exists from the welcome message and
/help; both point at /ntfy for the guided setup.

The operator can point everyone at a self-hosted ntfy with `NTFY_SERVER` and
`NTFY_TOKEN` in `.env`; users notice nothing.

## How the i18n works

All copy lives in `src/bot/i18n.ts` as one table: every key has an `en` and an
`id` string with `{placeholder}` slots. `t(lang, key, params)` renders them.
The user's language is a column on their user row, set at onboarding and
changeable anytime with /language. It applies to everything: wizard, alerts,
digest, errors.

Three tests keep the table honest:

- every key must have every supported language
- placeholders must match across languages (no missing `{price}` in one copy)
- no em dashes anywhere in the copy

### The voice

The copy is written like a friend who happens to watch gold prices, not a
bank. Short sentences, everyday words, a few emoji where they earn their spot.
The Indonesian is casual ("Gas!", "kesimpen", "waktunya serok?"), not formal
translation-ese. When editing copy, match that register; if a sentence would
sound fine in a bank's app, rewrite it.

Numbers stay Indonesian-formatted in both languages (Rp 2.504.000), because
that's how rupiah is written, full stop.

### Adding a language

1. Add the code to `SUPPORTED_LANGS` and the `Lang` type in `src/types.ts`.
2. Add the column to every message in `MESSAGES` (the completeness test lists
   every key you missed).
3. Add a button to the language keyboard in `handlers.ts` and a command menu
   entry in `BOT_COMMANDS`.

## Donations

/donate shows a short, honest pitch (free bot, small server, servers don't
accept gold) with a button to Saweria. It's linked once at the bottom of
/help and lives in the command menu; it never interrupts anyone. Keep it that
way: donation nags kill goodwill faster than server bills do.

## Privacy posture

The bot stores chat ids, language choice, and gold price targets. No names, no
usernames, no message history. Worth saying in your bot's description if you
share it beyond friends.
