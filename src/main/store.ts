import { app, safeStorage } from 'electron'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  defaultGeneralConfig,
  parseGeneralConfig,
  parseLocalServerConfig,
  type GeneralConfig,
  type LocalServerConfig
} from '../shared/config'
import { normalizeURL, type Connection } from '../shared/connections'

export interface Credential {
  userId: string
  token: string
  expiresAt: number | null
  sessionId?: string
  refreshToken?: string
  refreshExpiresAt?: number
}

export class Store {
  connections: Connection[] = []
  selected: string | null = null
  general: GeneralConfig = { ...defaultGeneralConfig }
  localServer: LocalServerConfig = { version: '', autoUpdate: true }
  credentials: Record<string, Credential> = {}
  persistentCredentials = false
  private queue: Promise<void> = Promise.resolve()
  private directory = join(app.getPath('userData'), 'data')

  async load(): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    try {
      const config = JSON.parse(await readFile(join(this.directory, 'config.json'), 'utf8'))
      this.general = parseGeneralConfig(config)
      if (config.localServer) this.localServer = parseLocalServerConfig(config.localServer)
      if (!Array.isArray(config.connections)) throw new Error('Invalid connection configuration')
      this.connections = config.connections.map((value: Connection) => {
        if (!/^[a-f0-9-]{36}$/i.test(value.id) || typeof value.name !== 'string') {
          throw new Error('Invalid saved connection')
        }
        return { id: value.id, name: value.name, url: normalizeURL(value.url) }
      })
      if (new Set(this.connections.map((c) => c.id)).size !== this.connections.length) {
        throw new Error('Duplicate connection identifiers')
      }
      this.selected = this.connections.some((c) => c.id === config.selected)
        ? config.selected
        : null
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    this.persistentCredentials = await safeStorage.isAsyncEncryptionAvailable()
    if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
      this.persistentCredentials = false
    }
    if (!this.persistentCredentials) return
    try {
      const encrypted = await readFile(join(this.directory, 'credentials.enc'))
      const decrypted = await safeStorage.decryptStringAsync(encrypted)
      const values = JSON.parse(decrypted.result)
      for (const connection of this.connections) {
        const value = values[connection.id]
        if (value && typeof value.token === 'string' && typeof value.userId === 'string') {
          this.credentials[connection.id] = value
        }
      }
      if (decrypted.shouldReEncrypt) await this.saveCredentials()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  private write(name: string, content: () => Promise<string | Buffer>): Promise<void> {
    const operation = this.queue.then(async () => {
      const temporary = join(this.directory, name + '.' + randomUUID() + '.tmp')
      try {
        await writeFile(temporary, await content(), { mode: 0o600, flag: 'wx' })
        await rename(temporary, join(this.directory, name))
      } finally {
        await rm(temporary, { force: true })
      }
    })
    this.queue = operation.catch(() => {})
    return operation
  }

  saveConfig(): Promise<void> {
    const value = JSON.stringify({
      ...this.general,
      connections: this.connections,
      selected: this.selected,
      localServer: this.localServer
    })
    return this.write('config.json', async () => value)
  }

  saveCredentials(): Promise<void> {
    if (!this.persistentCredentials) return Promise.resolve()
    const value = JSON.stringify(this.credentials)
    return this.write('credentials.enc', () => safeStorage.encryptStringAsync(value))
  }
}
