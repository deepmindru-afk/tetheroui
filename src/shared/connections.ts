import type { ServiceStatus } from './terminal'
import type { GeneralConfig } from './config'
import type { TetherEvent } from './events'

export interface Connection {
  id: string
  name: string
  url: string
}

export interface ConnectionState {
  connections: Connection[]
  selected: string | null
  title: string
  terminalStatus: ServiceStatus
  webuiConnected: boolean
  errors: Record<string, string>
  persistentCredentials: boolean
}

export interface AccessToken {
  token: string
  expiresAt: number | null
}

export interface TetherBridge {
  version: 1
  signedIn(token: string): Promise<AccessToken>
  refresh(force?: boolean): Promise<AccessToken | null>
  signedOut(): Promise<void>
  onToken(callback: (access: AccessToken | null) => void): () => void
  onEvent(
    callback: (
      event: TetherEvent | { type: 'theme:update'; data: { theme: GeneralConfig['theme'] } }
    ) => Promise<void>
  ): () => void
}

export function normalizeURL(value: string): string {
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Enter an HTTP or HTTPS WebUI address without embedded credentials.')
  }
  if (url.search || url.hash) throw new Error('Use the WebUI address without a query or fragment.')
  return url.href.replace(/\/+$/, '')
}

export function endpoint(url: string, path: string): string {
  return url.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '')
}

export function belongsToConnection(address: string, connectionURL: string): boolean {
  try {
    const actual = new URL(address)
    const expected = new URL(connectionURL)
    const root = expected.pathname.replace(/\/+$/, '')
    return (
      actual.origin === expected.origin &&
      (actual.pathname === root || actual.pathname.startsWith(root + '/'))
    )
  } catch {
    return false
  }
}
