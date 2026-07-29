export type ScopedRequestTicket = Readonly<{
  generation: number
  expectedServerUrl: string | null
}>

function normalizeServerUrlForComparison(value: string | null | undefined): string {
  const trimmed = value?.trim() || ''
  if (!trimmed) {
    return ''
  }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(withScheme)
    parsed.hash = ''
    parsed.search = ''
    if (!parsed.pathname.endsWith('/')) {
      parsed.pathname = `${parsed.pathname}/`
    }
    return parsed.toString()
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

export class LatestScopedRequestGate {
  private generation = 0

  begin(expectedServerUrl?: string | null): ScopedRequestTicket {
    this.generation += 1
    return {
      generation: this.generation,
      expectedServerUrl:
        expectedServerUrl === undefined ? null : normalizeServerUrlForComparison(expectedServerUrl),
    }
  }

  invalidate(): void {
    this.generation += 1
  }

  isCurrent(ticket: ScopedRequestTicket): boolean {
    return ticket.generation === this.generation
  }

  accepts(ticket: ScopedRequestTicket, actualServerUrl: string | null | undefined): boolean {
    if (!this.isCurrent(ticket)) {
      return false
    }
    return (
      ticket.expectedServerUrl === null ||
      ticket.expectedServerUrl === normalizeServerUrlForComparison(actualServerUrl)
    )
  }
}

export type SessionScope = Readonly<{
  serverUrl: string
  userId: string
  accessToken: string
  refreshToken: string
}>

export function createSessionScope(session: {
  server_url: string
  access_token: string
  refresh_token: string
  user: { user_id: string } | null
}): SessionScope {
  return {
    serverUrl: normalizeServerUrlForComparison(session.server_url),
    userId: session.user?.user_id.trim() || '',
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  }
}

export function sessionMatchesScope(
  session: {
    server_url: string
    access_token: string
    refresh_token: string
    user: { user_id: string } | null
  } | null,
  scope: SessionScope,
): boolean {
  if (!session?.access_token.trim() || !session.refresh_token.trim()) {
    return false
  }
  if (normalizeServerUrlForComparison(session.server_url) !== scope.serverUrl) {
    return false
  }
  if (session.access_token !== scope.accessToken || session.refresh_token !== scope.refreshToken) {
    return false
  }
  return !scope.userId || session.user?.user_id.trim() === scope.userId
}
