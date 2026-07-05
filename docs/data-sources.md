# Data sources

All sources are free and unauthenticated. That's the deal: zero cost, but none
of them owe us stability, which is why there's a fallback chain and per-row
source tracking in the CSV.

## HRTA Gold API (primary)

```
GET https://hrtagold.id/api/v1/brandings/price/daily
```

HRTA Gold is PT Hartadinata Abadi's retail platform and the maker of EMASKU
gold bars (the old emasku.co.id domain 301-redirects there). The endpoint is
the same one their own price page calls. Public JSON, no auth, no key:

```json
{
  "code": 200,
  "data": [{
    "series": "Gold",
    "is_origin": true,
    "created_at": "2026-07-04T11:16:55+07:00",
    "prices": [
      { "gramasi": 1, "price": 2504000, "buyback_price": 2376000 },
      { "gramasi": 5, "price": 12340000, "buyback_price": 11880000 }
    ]
  }]
}
```

Every bar size from 0.1g to 100g, buy and buyback, with the price's own
timestamp. Updates roughly once a day, late morning WIB.

Quirks worth knowing:

- The bare domain `https://hrtagold.id/` returns HTTP 500. The `/id/...` pages
  and the API path work fine. Don't let a failing homepage fool you into
  thinking the API is down.
- `created_at` is the price publication time and is what we dedupe on, so
  ticking more often than the source updates costs nothing.
- We send a browser-ish User-Agent; the API didn't require it at build time,
  but it costs nothing and scrapers get blocked for less.

## EmasKITA page (fallback)

```
GET https://emaskita.id/Harga_emas
```

EmasKITA is another Hartadinata brand with a server-rendered price page: plain
HTML tables, one per product line (KENCANA GOLD, EMASKITA MICRO, EMASKITA SMALL
BAR). Each row is a weight cell like `1 gr` followed by price cells shaped as
`<div>Rp.</div><div>2,504,000</div>` for basic, NPWP, non-NPWP and buyback.

The parser (`sources/emaskita.ts`) splits the page on section headers, keeps
only `EMASKITA*` sections (KENCANA GOLD repeats the same weights at different
prices and would collide), and takes the first number as the buy price and the
last as buyback. Note the fallback prices are EmasKITA-branded bars, not EMASKU.
They are close cousins from the same refiner, usually within a rupiah rounding of each
other, and the CSV records which source each row came from.

If both sources fail, the tick logs the error and gives up until the next
scheduled slot; the bot itself keeps running.

## Aneka Logam (Antam prices)

```
GET https://www.anekalogam.co.id/id
```

Aneka Logam is a Jakarta gold dealer whose homepage server-renders LM Antam
prices per gram for the current production year: a `buy-sell-rate` block with
Harga Jual and Harga Beli in `tprice` spans, plus a note naming the year
("Harga berlaku untuk LM Antam produksi tahun 2026"). The parser
(`sources/anekalogam.ts`) reads those two numbers and sanity-checks them
(buyback must sit below sell, price must be plausible per gram).

Because the quote is per gram, Antam maps to a single 1g series in the bot;
Antam targets are per-gram targets. The page also describes older production
variants (pre-2025 with/without the mind.id logo, 2018 packaging), but their
buyback prices load via JavaScript and are not scrapable with a plain fetch.
If they ever expose those as server-rendered HTML or a public endpoint,
year-variant tracking becomes a small addition.

If Aneka Logam is down, the tick simply proceeds without Antam prices; EMASKU
watches are unaffected, and Antam watches skip that round.

## Yahoo Finance (context and backfill)

```
GET https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=1y&interval=1d
GET https://query1.finance.yahoo.com/v8/finance/chart/IDR=X?range=1y&interval=1d
```

- `GC=F`: COMEX gold futures, USD per troy ounce. Not spot exactly, but moves
  with it closely enough for trend attribution and backfill. (`XAUUSD=X`, the
  actual spot symbol, no longer resolves on Yahoo.)
- `IDR=X`: USD/IDR.

Used in two places: the digest's "driver" line (last two closes of each) and
the `backfill` command (a year of both). This is Yahoo's unofficial chart API.
It has been stable for years, but it's unofficial. Both uses degrade gracefully:
the digest drops the driver line, and backfill refuses to write anything with
fewer than 30 overlapping days rather than produce garbage history.

## metalpriceapi.com (optional, world spot snapshot)

```
GET https://api.metalpriceapi.com/v1/latest?api_key=...&base=USD&currencies=IDR,XAU
```

One call returns both world gold (`USDXAU`, USD per troy oz) and USD/IDR.
Stored as one row per WIB day in the `spot` table and surfaced as the
"World gold $X/oz" and "Mover" lines in /analyze.

The free plan is 100 calls/month, so calls are strictly rationed: only
scheduled jobs (tick/digest) may call it, only when today's row is missing
(≤31 successful calls/month), and a `spot_calls` ledger hard-stops at 80
attempts/month as a failsafe. /analyze reads the stored rows only. No key
configured means this source is simply skipped.

## Sources considered and rejected

| Source | Why not |
|---|---|
| logammulia.com (Antam) | Blocks non-browser clients with 403 |
| pegadaian.co.id | Prices load via client-side JS, would need a headless browser |
| harga-emas.org | Scrapable, but aggregates the same data we get first-hand |
| goldapi.io / metals.dev | Free tiers are ~100 requests/month, too tight, and spot-only |
