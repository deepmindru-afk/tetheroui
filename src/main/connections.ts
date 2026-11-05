import {
  app,
  ipcMain,
  session,
  shell,
  WebContentsView,
  type BrowserWindow,
  type IpcMainInvokeEvent
} from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  belongsToConnection,
  endpoint,
  normalizeURL,
  type AccessToken,
  type Connection,
  type ConnectionState
} from '../shared/connections'
import { homedir } from 'node:os'
import type { TerminalTarget } from '../shared/terminal'
import { ManagedService } from './process/managedService'
import { spawnPty } from './process/nativePty'
import { attachTerminal } from './process/terminalChannel'
import { Sessions } from './sessions'
import { OpenTerminal, type TerminalHandle } from './terminal'
import { Relay } from './relay'
import { Store } from './store'
import type { RuntimeState } from '../shared/config'

interface LocalConnection {
  relay?: Relay
  handle?: TerminalHandle
  retry?: ReturnType<typeof setTimeout>
  starting?: boolean
  relayError?: string
  terminalError?: string
}

export class Connections {
  readonly store = new Store()
  readonly sessions = new Sessions(
    this.store,
    (id, token) => this.tokenChanged(id, token),
    (id, message) => this.fail(id, message)
  )
  private terminal = new OpenTerminal(
    () => this.store.localServer,
    (state) => this.runtimeChanged(state)
  )
  private updatingRuntime = false
  private local = new Map<string, LocalConnection>()
  private terminalHeight = 0
  private localShell = new ManagedService(spawnPty, true)
  private settingsOpen = false
  private stopped = false
  private views = new Map<string, WebContentsView>()
  private titles = new Map<string, string>()
  private errors: Record<string, string> = {}
  private window?: BrowserWindow

  async initialize(): Promise<void> {
    await this.store.load()
    this.sessions.start()
    for (const id of Object.keys(this.store.credentials)) void this.ensureLocal(id)
  }

  attach(window: BrowserWindow): void {
    this.window = window
    window.on('resize', () => this.layout())
    window.webContents.on('did-start-loading', () => {
      this.settingsOpen = false
      this.terminalHeight = 0
      this.layout()
    })
    this.registerIPC()
    if (this.store.selected)
      void this.select(this.store.selected).catch((error) =>
        this.fail(this.store.selected!, String(error))
      )
  }

  private state(): ConnectionState {
    const selected = this.store.connections.find((item) => item.id === this.store.selected)
    return {
      connections: this.store.connections,
      selected: this.store.selected,
      title: this.settingsOpen
        ? 'Settings'
        : (selected && this.titles.get(selected.id)) || selected?.name || 'Tether',
      errors: this.errors,
      persistentCredentials: this.store.persistentCredentials
    }
  }

  private emit(): void {
    if (this.window && !this.window.isDestroyed())
      this.window.webContents.send('connections:state', this.state())
  }

  private fail(id: string, message: string): void {
    this.errors[id] = message
    this.emit()
  }

  private tokenChanged(id: string, access: AccessToken | null): void {
    delete this.errors[id]
    if (access) {
      this.local.get(id)?.relay?.updateToken(access.token)
      void this.ensureLocal(id)
    } else {
      const local = this.local.get(id)
      this.local.delete(id)
      clearTimeout(local?.retry)
      local?.relay?.stop()
      void local?.handle?.stop()
    }
    const view = this.views.get(id)
    const connection = this.store.connections.find((item) => item.id === id)
    if (view && connection && belongsToConnection(view.webContents.getURL(), connection.url)) {
      view.webContents.send('tether:token', access)
    }
    this.emit()
  }

  private shellSender(event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>): void {
    if (event.sender !== this.window?.webContents || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Unknown IPC sender')
    }
  }

  private guestSender(event: IpcMainInvokeEvent): string {
    for (const [id, view] of this.views) {
      const connection = this.store.connections.find((item) => item.id === id)
      if (
        event.sender === view.webContents &&
        event.senderFrame === event.sender.mainFrame &&
        connection &&
        belongsToConnection(event.senderFrame.url, connection.url)
      )
        return id
    }
    throw new Error('Unknown WebUI sender')
  }

  private runtimeChanged(state: RuntimeState): void {
    if (this.window && !this.window.isDestroyed())
      this.window.webContents.send('runtime:state', state)
  }

  private async restartTerminal(update = false): Promise<void> {
    if (this.updatingRuntime) throw new Error('Open Terminal is already restarting or updating.')
    this.updatingRuntime = true
    let installed = false
    const entries = [...this.local.values()]
    for (const entry of entries) {
      if (!entry.relay) continue
      clearTimeout(entry.retry)
      entry.retry = undefined
      entry.handle = undefined
      entry.relay?.setService('open_terminal')
    }
    try {
      if (update) {
        if (this.stopped) return
        await this.terminal.installPackage()
      } else {
        await this.terminal.restart()
      }
      installed = true
    } finally {
      this.updatingRuntime = false
      if (installed && !this.stopped)
        for (const [id, entry] of this.local) void this.startTerminal(id, entry)
    }
  }

  private registerIPC(): void {
    ipcMain.handle('terminal:height', (event, height: number) => {
      this.shellSender(event)
      if (!Number.isFinite(height) || height < 0) throw new Error('Invalid terminal height')
      this.terminalHeight = Math.min(height, 1000)
      this.layout()
    })
    ipcMain.on('terminal:connect', (event, target: TerminalTarget, attachment: number) => {
      try {
        this.shellSender(event)
        if (
          !Number.isSafeInteger(attachment) ||
          attachment < 1 ||
          !target ||
          typeof target !== 'object'
        )
          return
        let service: ManagedService
        if (target.type === 'shell') {
          service = this.localShell
          if (service.info.status === 'stopped' || service.info.status === 'failed') {
            const env = Object.fromEntries(
              Object.entries(process.env).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === 'string' &&
                  !/^(ELECTRON_|NODE_OPTIONS$|NODE_PATH$)/i.test(entry[0])
              )
            )
            void service
              .start(async () => ({
                file:
                  process.platform === 'win32'
                    ? process.env.COMSPEC || 'cmd.exe'
                    : process.env.SHELL || '/bin/sh',
                args: process.platform === 'win32' ? [] : ['-l'],
                cwd: homedir(),
                env
              }))
              .catch(() => {
                /* ManagedService reports the failure in its output. */
              })
          }
        } else if (
          target.type === 'service' &&
          (target.id === null || this.store.connections.some((item) => item.id === target.id))
        ) {
          service = this.terminal.getService(target.id)
        } else return
        attachTerminal(service, event.sender, attachment)
      } catch {
        /* Reject requests from embedded or unknown renderers. */
      }
    })
    ipcMain.handle('settings:open', (event, open: boolean) => {
      this.shellSender(event)
      if (typeof open !== 'boolean') throw new Error('Invalid settings state')
      this.settingsOpen = open
      this.layout()
      this.emit()
    })
    ipcMain.handle('runtime:state', (event) => {
      this.shellSender(event)
      return this.terminal.getState()
    })
    ipcMain.handle('runtime:restart', (event) => {
      this.shellSender(event)
      return this.restartTerminal()
    })
    ipcMain.handle('runtime:install', (event) => {
      this.shellSender(event)
      return this.restartTerminal(true)
    })
    ipcMain.handle('connections:list', (event) => {
      this.shellSender(event)
      return this.state()
    })
    ipcMain.handle('connections:add', async (event, input: { name: string; url: string }) => {
      this.shellSender(event)
      if (
        !input ||
        typeof input.url !== 'string' ||
        typeof input.name !== 'string' ||
        input.name.length > 100
      ) {
        throw new Error('Invalid connection')
      }
      const url = normalizeURL(input.url.trim())
      const connection = { id: randomUUID(), name: input.name.trim() || new URL(url).host, url }
      this.store.connections.push(connection)
      await this.store.saveConfig()
      await this.select(connection.id)
      return this.state()
    })
    ipcMain.handle('connections:select', async (event, id: string | null) => {
      this.shellSender(event)
      await this.select(id)
    })
    ipcMain.handle('connections:reload', (event) => {
      this.shellSender(event)
      if (this.store.selected) this.views.get(this.store.selected)?.webContents.reload()
    })
    ipcMain.handle('connections:remove', async (event, id: string) => {
      this.shellSender(event)
      if (!this.store.connections.some((item) => item.id === id))
        throw new Error('Unknown connection')
      await this.sessions.signedOut(id)
      const view = this.views.get(id)
      if (view) {
        this.window?.contentView.removeChildView(view)
        const profile = view.webContents.session
        view.webContents.close()
        await profile.clearStorageData()
        await profile.clearCache()
        this.views.delete(id)
      } else {
        await session.fromPath(join(app.getPath('userData'), 'profiles', id)).clearStorageData()
      }
      this.store.connections = this.store.connections.filter((item) => item.id !== id)
      delete this.errors[id]
      this.titles.delete(id)
      await this.terminal.remove(id)
      if (this.store.selected === id) this.store.selected = this.store.connections[0]?.id ?? null
      await this.store.saveConfig()
      await this.select(this.store.selected)
    })
    ipcMain.handle('tether:login', (event, token: string) =>
      this.sessions.signedIn(this.guestSender(event), token)
    )
    ipcMain.handle('tether:refresh', (event, force?: boolean) =>
      this.sessions.refresh(this.guestSender(event), force === true)
    )
    ipcMain.handle('tether:logout', (event) => this.sessions.signedOut(this.guestSender(event)))
  }

  private async select(id: string | null): Promise<void> {
    if (id !== null && !this.store.connections.some((item) => item.id === id))
      throw new Error('Unknown connection')
    this.store.selected = id
    await this.store.saveConfig()
    if (id && !this.views.has(id))
      this.createView(this.store.connections.find((item) => item.id === id)!)
    this.layout()
    this.emit()
  }

  private createView(connection: Connection): void {
    const view = new WebContentsView({
      webPreferences: {
        session: session.fromPath(join(app.getPath('userData'), 'profiles', connection.id)),
        preload: join(__dirname, '../preload/guest.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    this.views.set(connection.id, view)
    this.window!.contentView.addChildView(view)
    view.webContents.on('page-title-updated', (_event, title, explicitSet) => {
      this.titles.set(connection.id, explicitSet ? title.trim() : '')
      if (this.store.selected === connection.id) this.emit()
    })
    const navigate = (event: Electron.Event, address: string): void => {
      if (belongsToConnection(address, connection.url)) {
        const url = new URL(address)
        const oauthRoot = new URL(endpoint(connection.url, 'oauth/')).pathname
        const suffix = url.pathname.startsWith(oauthRoot)
          ? url.pathname.slice(oauthRoot.length)
          : ''
        if (/^[a-zA-Z0-9_-]+\/login$/.test(suffix)) {
          event.preventDefault()
          void this.sessions
            .signInWithBrowser(connection.id, suffix.split('/')[0])
            .catch((error) => this.fail(connection.id, String(error)))
        }
        return
      }
      event.preventDefault()
      if (['https:', 'http:'].includes(new URL(address).protocol)) void shell.openExternal(address)
    }
    view.webContents.on('will-navigate', navigate)
    view.webContents.on('will-redirect', navigate)
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (belongsToConnection(url, connection.url)) void view.webContents.loadURL(url)
      else if (['https:', 'http:'].includes(new URL(url).protocol)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    view.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) this.fail(connection.id, description)
    })
    view.webContents.on('render-process-gone', () =>
      this.fail(connection.id, 'WebUI stopped. Select Reload from the View menu.')
    )
    void view.webContents
      .loadURL(connection.url)
      .catch(() => this.fail(connection.id, 'Could not load WebUI.'))
  }

  private layout(): void {
    if (!this.window) return
    const [width, height] = this.window.getContentSize()
    const titlebarHeight = process.platform === 'darwin' ? 28 : 32
    for (const [id, view] of this.views) {
      view.setVisible(id === this.store.selected && !this.settingsOpen)
      view.setBounds({
        x: 0,
        y: titlebarHeight,
        width,
        height: Math.max(
          0,
          height - titlebarHeight - 24 - Math.min(this.terminalHeight, Math.max(0, height - 160))
        )
      })
    }
  }

  private localChanged(id: string, entry: LocalConnection): void {
    if (this.local.get(id) !== entry || this.stopped) return
    const error = entry.relayError || entry.terminalError
    if (error) this.errors[id] = error
    else delete this.errors[id]
    this.emit()
  }

  private async ensureLocal(id: string): Promise<void> {
    if (this.stopped || this.local.has(id) || !this.sessions.credential(id)?.sessionId) return
    const connection = this.store.connections.find((item) => item.id === id)
    if (!connection) return
    const entry: LocalConnection = {}
    this.local.set(id, entry)
    try {
      const access = await this.sessions.refresh(id)
      if (!access) return
      const response = await fetch(endpoint(connection.url, 'api/config'), {
        headers: { Authorization: 'Bearer ' + access.token },
        redirect: 'error',
        signal: AbortSignal.timeout(15000)
      })
      if (!response.ok) throw new Error('Could not reach WebUI.')
      const config = (await response.json()) as { features?: { tether?: boolean } }
      if (!config.features?.tether || this.local.get(id) !== entry || this.stopped) return
      entry.relay = new Relay(connection, this.sessions, (message) => {
        entry.relayError = message
        this.localChanged(id, entry)
      })
      await entry.relay.connect()
      void this.startTerminal(id, entry)
    } catch (error) {
      if (this.local.get(id) === entry && !this.stopped) {
        entry.relayError = String(error)
        this.localChanged(id, entry)
        entry.retry = setTimeout(() => {
          this.local.delete(id)
          void this.ensureLocal(id)
        }, 30000)
      }
    }
  }

  private async startTerminal(id: string, entry: LocalConnection): Promise<void> {
    if (
      this.stopped ||
      this.updatingRuntime ||
      this.local.get(id) !== entry ||
      !entry.relay ||
      entry.starting ||
      entry.handle
    )
      return
    entry.starting = true
    clearTimeout(entry.retry)
    entry.retry = undefined
    try {
      const handle = await this.terminal.start(id, () => {})
      if (
        this.local.get(id) !== entry ||
        this.stopped ||
        this.updatingRuntime ||
        !this.sessions.credential(id)
      ) {
        await handle.stop()
        return
      }
      entry.handle = handle
      entry.terminalError = ''
      entry.relay.setService('open_terminal', (path, websocket) =>
        this.terminal.destination(id, path, websocket)
      )
      this.localChanged(id, entry)
      const unsubscribe = handle.service.subscribe((event) => {
        if (event.type !== 'state' || event.info.pid !== null || event.info.status === 'starting')
          return
        unsubscribe()
        if (entry.handle !== handle) return
        entry.handle = undefined
        entry.relay?.setService('open_terminal')
        if (this.local.get(id) === entry && !this.stopped && !this.updatingRuntime) {
          entry.terminalError = 'Open Terminal stopped. Restarting.'
          this.localChanged(id, entry)
          entry.retry = setTimeout(() => void this.startTerminal(id, entry), 5000)
        }
      })
    } catch (error) {
      if (this.local.get(id) === entry && !this.stopped && !this.updatingRuntime) {
        entry.terminalError = String(error)
        this.localChanged(id, entry)
        entry.retry = setTimeout(() => void this.startTerminal(id, entry), 30000)
      }
    } finally {
      entry.starting = false
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.sessions.stop()
    for (const local of this.local.values()) {
      clearTimeout(local.retry)
      local.relay?.stop()
    }
    await Promise.all([this.terminal.stop(), this.localShell.shutdown()])
  }
}
