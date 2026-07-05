# How it works

A walkthrough of what happens on each run and the reasoning behind the
thresholds. Numbers in parentheses are defaults; all tunable via env vars
([configuration.md](configuration.md)).

## The tick

A tick runs a few times a day (09:15, 12:15, 17:15 WIB) plus once at process
start, and does four things:

1. **Fetch prices.** HRTA Gold API first; if that throws, the EmasKITA page.
   One call carries every bar size.
2. **Store them.** One row per day per size in the `prices` table (same-day
   re-checks replace the row). HRTA publishes once a day, so most ticks
   rewrite identical numbers; the extra ticks exist to catch the daily update
   early, not to collect intraday data.
3. **Walk every user's ladder.** See below. Users get at most one message per
   size per tick, with all their crossed rungs combined.
4. **Run the dip detector** per watched size, and notify watchers who didn't
   already get a target hit for that size.

## Ladder targets

Each user's ladder is rows in the `watches` table, managed entirely through
the /watch and /targets commands. The rules, implemented in `core/targets.ts`:

- A rung **fires** when the price is at or below it and it hasn't fired yet.
  Firing is recorded on the row (`fired_at`, `fired_price`).
- A fired rung **re-arms** when the price recovers above `target * 1.005`
  (0.5% buffer). Without the buffer, a price oscillating right at the rung
  would fire, re-arm, and fire again every tick.
- One big drop through several rungs fires all of them in one tick, combined
  into a single message, highest first.

Lifecycle of a rung: armed → fired (one loud push) → silent → price recovers
past the buffer → armed again. One ping per genuine visit to a price level,
not one per tick spent there.

## Dip detection

The ladder only knows the prices a user predicted. The dip detector
(`core/dip.ts`) catches unpredicted drops:

- Reference = the highest daily price in the last (14) days, today excluded.
- A drop of (2%)+ below that reference raises a dip alert.
- **Episode logic** stops it from re-alerting all the way down: after an
  alert, the next one only fires when the price is at least another 1% lower.
  The episode closes once the drop shrinks back under half the threshold.
- Needs at least 3 days of history; before that it stays quiet.

The episode is tracked **per bar size, not per user** (the price series is
global, so the episode is too). Who gets the message is decided at send time:
everyone watching that size, minus anyone who just got a target hit for it.

## The morning digest

Once a day (08:00 WIB), sent silently to every user who keeps /digest on and
has at least one target. Each watched size gets a block, built by
`core/analysis.ts` from that size's merged daily history (real rows win over
backfilled ones on the same date):

- **Cheaper-than %**: the share of the last (90) days with a higher price than
  today. The headline number: "cheaper than 82% of the last 90 days" means
  only 1 in 5 recent days was a better deal. Needs 20+ days of history.
- **Verdict**: CHEAP at 70%+, EXPENSIVE at 30% or below, NEUTRAL in between.
  Deliberately coarse; it's a nudge, not a signal service.
- **Trend**: 7-day vs 30-day moving average with a 0.2% dead zone.
- **Spread**: `(price - buyback) / price`, the real round-trip cost of owning
  physical gold. A widening spread is a caution sign on its own.
- **Mover**: local price per gram is roughly
  `world gold (USD/oz) / 31.1035 * USD/IDR + retail premium`, so the digest
  compares day-over-day changes in `GC=F` and `IDR=X` and names whichever
  moved more (1.5x dominance rule; both under 0.15% reads as flat). "Cheaper
  because the rupiah strengthened" and "cheaper because gold fell" are
  different situations.
- **Nearest target**: the next armed rung below today's price and the gap to
  it.

The analysis layer returns data; the rendering (and translation) happens in
`bot/copy.ts`, so the math stays language-agnostic.

## Backfill

Percentiles over 90 days are useless on day one, so `backfill` manufactures
history for **every size HRTA sells**:

1. Fetch a year of daily closes for world gold (`GC=F`, USD/oz) and USD/IDR
   (`IDR=X`) from Yahoo.
2. Convert to a raw IDR series per size: `close / 31.1034768 * fx * grams`.
3. Scale each size's series so its latest day equals that size's real price
   today. The per-size factor bakes in that size's retail premium (small bars
   carry a visibly bigger premium per gram; at build time 0.1g ran ~29% over
   raw metal value while 100g ran ~1%).
4. Write to the `backfill` table.

Synthetic rows are only used where no real row exists for that date, so the
synthetic history dissolves as real logged prices accumulate. Rerun `backfill`
anytime; it regenerates wholesale.

Honest caveat: the backfilled series assumes each premium was constant over
the year, which it wasn't exactly. It's good enough for "is today in the cheap
half of the year", which is all it's used for.

## Scheduling

The schedule loop computes the next tick/digest occurrence in WIB, sleeps
until then, runs, repeats. An immediate tick also runs at startup so a
container restart never misses the day's price. WIB is UTC+7 with no daylight
saving, so the math is a fixed offset, no timezone library needed.

## Data shapes

All state is SQLite at `data/pantauemas.db`. The interesting rows:

```
users:     chat_id='123456789', lang='id', digest_enabled=1
watches:   chat_id='123456789', gramasi=1, target=2450000, fired_at=NULL
prices:    date='2026-07-05', gramasi=1, price=2504000, buyback=2376000, source='hrta'
backfill:  date='2025-09-12', gramasi=1, price=2143210
dip_state: gramasi=1, date='2026-07-12', price=2410000, ref_high=2465000
```

Wizard progress (waiting for a typed target price) is deliberately in memory
only; a restart mid-wizard costs the user one extra /watch tap.
