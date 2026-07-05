export type Lang = 'en' | 'id'

/** Gold brands the bot tracks. EMASKU has many bar sizes; Antam is tracked per gram. */
export type Brand = 'emasku' | 'antam'

export type PriceSource = 'hrta' | 'emaskita' | 'anekalogam' | 'logammulia' | 'indogold' | 'galeri24'

export interface SizePrice {
  gramasi: number
  price: number
  buybackPrice: number
}

export interface BrandPrices {
  brand: Brand
  source: PriceSource
  /** Where the buyback figures came from, when not the same as `source`. */
  buybackSource?: PriceSource
  /** Price timestamp from the source (ISO). Falls back to fetch time when the source has none. */
  createdAt: string
  sizes: SizePrice[]
}

export interface Market {
  fetchedAt: string
  /** Brands that responded this fetch; a brand whose source is down is simply absent. */
  brands: BrandPrices[]
  /**
   * One raw quote per source that responded, unmerged, so the full price
   * board can list Antam per source and /analyze can compare them.
   * Sell-only quotes (official Logam Mulia) carry buybackPrice 0.
   */
  sourceQuotes?: BrandPrices[]
}

export interface DayPrice {
  /** WIB date, YYYY-MM-DD */
  date: string
  price: number
  buybackPrice?: number
  synthetic?: boolean
}

export interface UserRow {
  chatId: string
  lang: Lang
  digestEnabled: boolean
  ntfyTopic: string | null
  createdAt: string
}

export interface WatchRow {
  id: number
  chatId: string
  brand: Brand
  gramasi: number
  target: number
  firedAt: string | null
  firedPrice: number | null
}

export interface DipStateRow {
  brand: Brand
  gramasi: number
  date: string
  price: number
  refHigh: number
}

export interface DipEvent {
  refHigh: number
  dropPct: number
}

export interface DriverInfo {
  goldChangePct: number
  fxChangePct: number
}

export interface AnalysisReport {
  sampleDays: number
  /** Share of the last ~90 days that were MORE expensive than today */
  cheaperThanPct: number | null
  ma7: number | null
  ma30: number | null
  trend: 'down' | 'up' | 'flat' | null
  spreadPct: number
  verdict: 'CHEAP' | 'NEUTRAL' | 'EXPENSIVE' | null
  driver?: DriverInfo
}

/** One yes/no buy check; the copy layer turns the key into a translated label. */
export interface TimingSignal {
  key: 'percentile' | 'range' | 'momentum' | 'dip'
  pass: boolean
}

export interface TimingReport {
  report: AnalysisReport
  low90: number | null
  high90: number | null
  /** Where today sits in the 90-day range: 0 = at the low, 100 = at the high. */
  rangePosPct: number | null
  /** How far today is below the 14-day high, in percent (0 = at the high). */
  dropFromHigh14Pct: number | null
  /** Signals with enough history to evaluate; empty when the series is too short. */
  signals: TimingSignal[]
  score: number
  maxScore: number
  timing: 'good' | 'ok' | 'wait' | null
  /**
   * 0-100 "how much does today look like a buy day", a weighted blend of the
   * same statistics behind the signals (percentile, range position, momentum,
   * dip depth). Null whenever timing is null.
   */
  confidencePct: number | null
}
