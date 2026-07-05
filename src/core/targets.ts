/**
 * Ladder logic: a rung fires once when the price closes at or below it, then
 * stays quiet until the price climbs back above the rung plus a small buffer.
 * The buffer keeps a price oscillating right at the rung from spamming
 * fire/re-arm every tick.
 */
export function evaluateRung(
  price: number,
  target: number,
  fired: boolean,
  rearmBufferPct: number,
): 'fire' | 'rearm' | 'none' {
  if (!fired && price <= target) return 'fire'
  if (fired && price >= target * (1 + rearmBufferPct / 100)) return 'rearm'
  return 'none'
}

/** The next rung below the given target, if any. */
export function nextTargetBelow(target: number, targets: number[]): number | null {
  const below = targets.filter((t) => t < target)
  return below.length ? Math.max(...below) : null
}

/** Closest target under the current price, i.e. the next buy level to wait for. */
export function nearestTargetBelowPrice(price: number, targets: number[]): number | null {
  const below = targets.filter((t) => t < price)
  return below.length ? Math.max(...below) : null
}
