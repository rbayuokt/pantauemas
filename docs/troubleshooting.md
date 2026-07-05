# Troubleshooting

Symptoms first, likely causes after. Every run logs to stdout with ISO
timestamps, so `docker logs pantauemas` is always the first stop. One noise
you can ignore: Node prints an ExperimentalWarning for `node:sqlite`; it's
harmless.

## The bot doesn't respond to messages

- **`no TELEGRAM_BOT_TOKEN set` in the logs**: the `.env` isn't being read
  (wrong directory, or compose missing `env_file`) or the token line is empty.
- **`409` errors repeating**: two instances are polling with the same token.
  Find the other one (`docker ps`, old systemd unit, a dev session on your
  laptop) and stop it. Telegram only feeds one poller per token.
- **`Telegram getUpdates failed: Unauthorized`**: the token is wrong or was
  revoked in BotFather.
- Responds to /start but not /watch taps: check the logs for
  `update handling failed`; the error text names the broken spot.

## Alerts not arriving

- Run a manual check and read the output:
  `docker exec pantauemas npx tsx src/index.ts tick`
- `no alerts this tick` is usually correct: nobody's rung was crossed and no
  dip triggered. A rung that already fired stays quiet until the price
  recovers past the re-arm buffer; users can see the 🔕 state in /targets.
- `send to <chat> failed: ... 403`: that user blocked the bot. Their loss,
  everyone else is unaffected.
- Dip alerts specifically need 3+ days of history for that size. Run
  `backfill` if the database is fresh.

## Both price sources failing

`HRTA failed (...), falling back to EmasKITA` followed by an EmasKITA error
means no prices this tick; the scheduler retries at the next slot. To diagnose:

```sh
curl -s -A "Mozilla/5.0" https://hrtagold.id/api/v1/brandings/price/daily | head -c 300
```

- Empty or HTTP error → HRTA changed or is down. Remember the bare domain
  `https://hrtagold.id/` 500s normally; only the API path matters.
- API fine but PantauEmas errors → response shape changed; the error message
  names what's missing (`no Gold series`, `no price rows parsed`).
- EmasKITA parser returning nothing → their HTML changed. The parser is ~30
  lines in `src/sources/emaskita.ts`; compare against the live page.

## Digest problems

- **Nobody got one**: digests only go to users with /digest on AND at least
  one target. `digest sent to 0 user(s)` with active users means everyone
  toggled it off or has empty watchlists.
- **Missing percentile/verdict lines**: fewer than 20 days of history for that
  size. Run `npm run backfill`.
- **Missing the mover line**: Yahoo was unreachable at digest time; the log
  says `driver data unavailable`. Harmless and self-healing.

## Database things

- Inspect it directly, it's just SQLite:
  `sqlite3 data/pantauemas.db 'SELECT * FROM watches'`
- Manually re-arm a rung:
  `sqlite3 data/pantauemas.db "UPDATE watches SET fired_at=NULL, fired_price=NULL WHERE id=7"`
- Wrong or stale backfill calibration after a long downtime: rerun
  `npm run backfill`, it regenerates every size wholesale.
- Deleting `data/pantauemas.db` nukes users and targets too, not just history.
  Don't, unless you mean it.

## Time and schedule

All schedule strings are WIB (UTC+7, no DST). The loop logs its plan at boot
and before every sleep:

```
schedule: ticks at 09:15, 12:15, 17:15 WIB, digest at 08:00 WIB
next tick at 2026-07-05T02:15:00.000Z
```

That `next tick` line is UTC; 02:15 UTC is 09:15 WIB. If times look seven
hours off, they're probably correct and just displayed in UTC.
