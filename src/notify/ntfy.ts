export interface NtfyMessage {
  title: string
  body: string
  priority: 'urgent' | 'default' | 'low'
}

// Priority 5 bypasses quiet hours on the phone, 3 is a normal ping, 2 is silent-ish.
const PRIORITY_MAP: Record<NtfyMessage['priority'], number> = { urgent: 5, default: 3, low: 2 }

export async function sendNtfy(
  server: string,
  topic: string,
  msg: NtfyMessage,
  token?: string,
): Promise<void> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  // JSON publishing instead of header-based, so non-ASCII in titles survives.
  const res = await fetch(server, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic,
      title: msg.title,
      message: msg.body,
      priority: PRIORITY_MAP[msg.priority],
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`ntfy returned HTTP ${res.status}: ${await res.text()}`)
}
