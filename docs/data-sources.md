# Data sources

All sources are free and unauthenticated. That's the deal: zero cost, but none
of them owe us stability, which is why each brand has a fallback chain and
every stored price row records the source it came from.

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

## Antam prices (four sources)

Antam retail prices differ visibly between shops (on one 2026 day the 1g bar
was Rp 2.670.000 official, Rp 2.738.000 at IndoGold, Rp 2.777.000 at
Galeri 24), so the bot reads up to four sources and labels every number with
where it came from.

The strategy, implemented in `sources/market.ts`: all four are fetched in
parallel, then split two ways.

The **merged quote** drives alerts, /watch and storage:

1. **Logam Mulia (official)** provides the sell prices whenever it responds.
2. The highest-priority shop that responded — **IndoGold → Galeri 24 → Aneka
   Logam** — fills in the buyback figures, since the official table publishes
   none. The `prices` table records both (`source`, `buyback_source`), and
   messages credit both ("Sumber: Logam Mulia (resmi), IndoGold").
3. When the official fetch fails, that shop quote is used wholesale. When
   every shop fails, Antam is skipped for that round (the message layer needs
   a buyback figure); EMASKU watches are unaffected.

The **raw per-source quotes** are kept alongside (`Market.sourceQuotes`) and
power the display: /price lists a watched Antam size as its own block with
every source, cheapest first (the full board does the same for every size),
and /analyze adds a "today by source" section — same size quoted by every
live source, cheapest first, plus who pays the best buyback. Watches and
/analyze verdicts stay per-gram (1g) for Antam.

### Logam Mulia — official, via Jina Reader

```
GET https://r.jina.ai/https://www.logammulia.com/id/harga-emas-hari-ini
```

logammulia.com is PT Antam's own shop and the authoritative daily price
(updated ~08:30 WIB), but it sits behind Akamai, which rejects anything that
isn't a real browser at the TLS-fingerprint level — plain fetches get 403 no
matter the headers. Jina Reader (r.jina.ai) is a free rendering proxy that
returns the page as markdown; the parser (`sources/logammulia.ts`) reads the
plain "Emas Batangan" table (harga dasar column, every denomination from 0.5g
to 1kg) and stops before the themed sections (Gift Series, Imlek, Batik) that
repeat weights at premium prices. Buyback is behind a login, hence the shop
merge above.

The keyless Jina tier easily covers the bot's few calls a day; an optional
`JINA_API_KEY` raises the rate limit. This is the one source reached through
a third-party proxy, so it's deliberately the one the chain can live without.

### IndoGold — first buyback source

```
GET  https://www.indogold.id/harga-emas-hari-ini      (session cookie + token)
POST https://www.indogold.id/home/get_data_pricelist  (form={"product":"LM_1"})
```

IndoGold is a licensed online gold dealer. Its price table loads via an AJAX
endpoint guarded by a per-session `simulasi-token` embedded in the page's
inline script, so `sources/indogold.ts` does a two-step fetch: GET the page to
collect the cookie and token, then POST the pricelist form. The JSON answer
covers every retail size (0.5–100g), sell and buyback, for three production
years; the parser keeps the newest year. Two requests per tick with a browser
User-Agent and Referer look exactly like a normal page view.

### Galeri 24 — second buyback source

```
GET https://galeri24.co.id/harga-emas
```

Galeri 24 is Pegadaian's gold retailer. The page is server-rendered: one block
per vendor anchored as `<div id="ANTAM">`, rows of weight / Harga Jual / Harga
Buyback for 0.5–100g. `sources/galeri24.ts` cuts out the ANTAM block (ignoring
ANTAM MULIA RETRO and the UBS blocks) and scans the flattened text.

### Aneka Logam — last resort

```
GET https://www.anekalogam.co.id/id
```

Aneka Logam is a Jakarta gold dealer whose homepage server-renders LM Antam
prices for the current production year, but only per gram: a `buy-sell-rate`
block with Harga Jual and Harga Beli in `tprice` spans, plus a note naming the
year ("Harga berlaku untuk LM Antam produksi tahun 2026"). It was the bot's
original (and sole) Antam source; it now sits last in the shop chain because
a 1g-only quote shrinks the merged size list to a single row.

One honest caveat: when the official source flaps (say, the proxy times out
one tick and recovers the next), the Antam series briefly reflects a shop's
price level, which runs 2–4% above official. The dip detector's threshold is
2%, so a flap can in principle read as a dip. In practice sources publish once
a day and the prices table keeps one row per day (last tick wins), so the
window is small — but if a dip alert ever looks odd, check the `source` column
for that date first.

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
| logammulia.com, fetched directly | Akamai blocks non-browser TLS fingerprints with 403 (full browser headers, HTTP/2 and Googlebot UA all bounce); used via Jina Reader instead |
| pegadaian.co.id | Prices load via client-side JS, would need a headless browser |
| harga-emas.org | Now a Pluang-owned Next.js app; the Antam table renders client-side and its data endpoint isn't discoverable from the static chunks |
| goldapi.io / metals.dev | Free tiers are ~100 requests/month, too tight, and spot-only |
