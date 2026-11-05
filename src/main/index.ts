import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  shell,
  Tray
} from 'electron'
import { isAbsolute, join } from 'node:path'
import { homedir } from 'node:os'
import { stat } from 'node:fs/promises'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import log from 'electron-log'
import icon from '../../resources/icon.png?asset'
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  initUpdater,
  installUpdate
} from './updater'
import type { AppInfo } from '../shared/api'
import { parseGeneralConfig, parseLocalServerConfig, type AppConfig } from '../shared/config'

import { Connections } from './connections'
import { Spotlight } from './spotlight'
import { setTooltip } from './tooltip'
import { attachContextMenu } from './contextMenu'

app.setName('Tether')
const connections = new Connections((theme) => saveConfig({ theme }, false))
log.initialize()
log.errorHandler.startCatching()

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let shutdownStarted = false
let resetting = false
const registeredShortcuts = { globalShortcut: '', spotlightShortcut: '' }
const shortcutKeys = ['globalShortcut', 'spotlightShortcut'] as const
const spotlight = new Spotlight(connections, showMainWindow, () => mainWindow?.hide())
const openSpotlight = (): void => {
  void spotlight.toggle().catch((error) => log.warn('Could not open Spotlight:', error))
}
let savingConfig: Promise<void> = Promise.resolve()

function showMainWindow(): void {
  if (!mainWindow) createMainWindow()
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.show()
  mainWindow?.webContents.send('window:visibility', true)
  mainWindow?.focus()
}

function openExternal(url: string): void {
  if (!['https:', 'http:'].includes(new URL(url).protocol)) return
  void shell.openExternal(url).catch((error) => log.warn('Could not open link:', error))
}

function createMainWindow(show = true): void {
  const window = new BrowserWindow({
    title: 'Tether',
    width: 960,
    height: 680,
    minWidth: 480,
    minHeight: 360,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 10, y: 10 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#f5f5f7',
    ...(process.platform !== 'darwin'
      ? {
          titleBarOverlay: {
            height: 32,
            color: '#00000000',
            symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#000000'
          }
        }
      : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      sandbox: true
    }
  })
  mainWindow = window
  const visibilityChanged = (): void => {
    // Native visibility can settle after the event, and macOS also emits hide on occlusion.
    setImmediate(() => {
      if (!window.isDestroyed())
        window.webContents.send('window:visibility', window.isVisible() && !window.isMinimized())
    })
  }
  window.on('show', visibilityChanged)
  window.on('hide', visibilityChanged)
  window.on('minimize', visibilityChanged)
  window.on('restore', visibilityChanged)
  connections.attach(window)
  optimizer.watchWindowShortcuts(window)
  attachContextMenu(window.webContents)
  window.once('ready-to-show', () => {
    if (show) window.show()
  })
  window.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      if (connections.store.general.runInBackground) {
        window.hide()
        visibilityChanged()
      } else app.quit()
    }
  })
  const updateTheme = (): void => {
    window.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#f5f5f7')
    if (process.platform !== 'darwin')
      window.setTitleBarOverlay({
        symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#000000'
      })
  }
  nativeTheme.on('updated', updateTheme)
  window.on('closed', () => {
    nativeTheme.removeListener('updated', updateTheme)
    mainWindow = null
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    openExternal(url)
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer exited:', details)
  })

  const loading =
    is.dev && process.env.ELECTRON_RENDERER_URL
      ? window.loadURL(process.env.ELECTRON_RENDERER_URL)
      : window.loadFile(join(__dirname, '../renderer/index.html'))
  void loading.catch((error) => log.error('Could not load Tether:', error))
}

function saveConfig(value: unknown, syncTheme = true): Promise<void> {
  const operation = savingConfig.then(async () => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid settings')
    const patch = value as Partial<AppConfig>
    const store = connections.store
    const previous = store.general
    const previousServer = store.localServer
    const next = parseGeneralConfig({ ...previous, ...patch })
    const localServer =
      'localServer' in patch ? parseLocalServerConfig(patch.localServer) : previousServer
    if (localServer.enabled !== previousServer.enabled)
      throw new Error('Install Open Terminal from Settings to enable it.')
    if (localServer.homeDirectory && localServer.homeDirectory !== previousServer.homeDirectory) {
      if (!isAbsolute(localServer.homeDirectory))
        throw new Error('Enter an absolute home directory path.')
      const directory = await stat(localServer.homeDirectory).catch(() => null)
      if (!directory?.isDirectory())
        throw new Error('Choose an existing folder for the home directory.')
    }
    const changed = shortcutKeys.filter(
      (key) =>
        next[key] !== previous[key] || (key in patch && next[key] !== registeredShortcuts[key])
    )
    const reserved: string[] = []
    try {
      for (const key of changed) {
        if (next[key]) {
          registerShortcut(next[key], key === 'globalShortcut' ? showMainWindow : openSpotlight)
          reserved.push(next[key])
        }
      }
      store.general = next
      store.localServer = localServer
      await store.saveConfig()
    } catch (error) {
      store.general = previous
      store.localServer = previousServer
      for (const accelerator of reserved) globalShortcut.unregister(accelerator)
      throw error
    }
    for (const key of changed) {
      if (registeredShortcuts[key]) globalShortcut.unregister(registeredShortcuts[key])
      registeredShortcuts[key] = next[key]
    }
    nativeTheme.themeSource = next.theme
    mainWindow?.webContents.send('config:changed', {
      ...store.general,
      localServer: store.localServer
    })
    if (syncTheme && 'theme' in patch) connections.syncTheme(next.theme)
    updateTray()
    if (next.deviceName !== previous.deviceName) connections.updateDeviceName()
  })
  savingConfig = operation.catch(() => {})
  return operation
}

function registerIPC(): void {
  const handle = (channel: string, callback: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (
        event.sender !== mainWindow?.webContents ||
        event.senderFrame !== event.sender.mainFrame
      ) {
        throw new Error('Unknown IPC sender')
      }
      if (quitting) throw new Error('Tether is shutting down.')
      return callback(...args)
    })
  }
  handle('app:reset', async () => {
    if (resetting || !mainWindow) return
    resetting = true
    try {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        message: 'Factory reset?',
        detail:
          'This will remove Tether’s installed runtimes and packages, settings, saved connections, and local sign-in data. Tether will restart. Your hosted WebUI data and personal files will not be deleted.',
        buttons: ['Cancel', 'Reset'],
        defaultId: 0,
        cancelId: 0
      })
      if (response !== 1 || quitting) return
      quitting = true
      await savingConfig
      if (process.platform !== 'linux') app.setLoginItemSettings({ openAtLogin: false })
      await connections.reset()
      await mainWindow.webContents.session.clearStorageData()
      await mainWindow.webContents.session.clearCache()
      app.relaunch()
      app.quit()
    } catch (error) {
      quitting = false
      log.error('Factory reset failed:', error)
      throw new Error('Factory reset failed. Quit and reopen Tether to try again. ' + String(error))
    } finally {
      resetting = false
    }
  })
  handle('spotlight:open', () => spotlight.toggle())
  handle('window:tooltip', (value) => setTooltip(mainWindow, value))
  handle('window:visibility', () => !!mainWindow?.isVisible() && !mainWindow.isMinimized())
  handle(
    'app:info',
    (): AppInfo => ({
      deviceName: connections.store.deviceName,
      homeDirectory: homedir(),
      name: app.name,
      version: app.getVersion(),
      platform: process.platform
    })
  )
  handle(
    'config:get',
    (): AppConfig => ({ ...connections.store.general, localServer: connections.store.localServer })
  )
  handle('dialog:directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      defaultPath: connections.store.localServer.homeDirectory || homedir()
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  handle('config:set', (value) => saveConfig(value))
  handle(
    'app:launchAtLogin:get',
    () => process.platform !== 'linux' && app.getLoginItemSettings().openAtLogin
  )
  handle('app:launchAtLogin:set', (enabled) => {
    if (typeof enabled !== 'boolean') throw new Error('Invalid launch at login setting')
    if (process.platform === 'linux')
      throw new Error('Launch at login is not supported on this platform.')
    app.setLoginItemSettings({ openAtLogin: enabled })
    const actual = app.getLoginItemSettings().openAtLogin
    if (actual !== enabled)
      throw new Error('Could not change launch at login. Check your system settings.')
    return actual
  })
  handle('update:state', getUpdateState)
  handle('update:check', checkForUpdates)
  handle('update:download', downloadUpdate)
  handle('update:install', installUpdate)
}

function createMenus(): void {
  const checkUpdates = (): void => {
    showMainWindow()
    void checkForUpdates()
  }
  const updateItem = { label: 'Check for Updates…', click: checkUpdates }
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Tether',
      submenu: [
        { label: 'About Tether', click: () => app.showAboutPanel() },
        updateItem,
        { type: 'separator' },
        ...(process.platform === 'darwin'
          ? ([
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' }
            ] as Electron.MenuItemConstructorOptions[])
          : []),
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Window',
      submenu: [
        { label: 'Show Tether', click: showMainWindow },
        { label: 'Open Spotlight', click: openSpotlight },
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Tether on GitHub',
          click: () => openExternal('https://github.com/open-webui/tether')
        },
        {
          label: 'Open Logs',
          click: () => {
            void shell.openPath(app.getPath('logs'))
          }
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  updateTray()
}

function updateTray(): void {
  if (process.platform === 'darwin' && !connections.store.general.showMenuBarIcon) {
    tray?.destroy()
    tray = null
    return
  }
  if (tray) return
  tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  tray.setToolTip('Tether')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Tether', click: showMainWindow },
      { label: 'Open Spotlight', click: openSpotlight },
      {
        label: 'Check for Updates…',
        click: () => {
          showMainWindow()
          void checkForUpdates()
        }
      },
      { type: 'separator' },
      { label: 'Quit Tether', click: () => app.quit() }
    ])
  )
  tray.on('click', showMainWindow)
}

function registerShortcut(accelerator: string, callback: () => void): void {
  try {
    if (globalShortcut.register(accelerator, callback)) return
  } catch {
    /* Report invalid accelerators and registration conflicts consistently. */
  }
  throw new Error(
    `Could not register shortcut "${accelerator}". It may be invalid or used by another application.`
  )
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (app.isReady()) showMainWindow()
  })
  app.on('activate', () => {
    if (app.isReady()) showMainWindow()
  })
  app.on('before-quit', (event) => {
    if (shutdownStarted) return
    event.preventDefault()
    shutdownStarted = true
    quitting = true
    spotlight.destroy()
    void connections.stop().finally(() => app.quit())
  })
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    tray?.destroy()
    tray = null
  })
  app
    .whenReady()
    .then(async () => {
      electronApp.setAppUserModelId('com.openwebui.tether')
      app.dock?.setIcon(icon)
      app.setAboutPanelOptions({
        applicationName: 'Tether',
        applicationVersion: app.getVersion(),
        copyright: `Copyright © ${new Date().getFullYear()} Open WebUI Inc.`,
        website: 'https://github.com/open-webui/tether',
        iconPath: icon
      })
      await connections.initialize()
      nativeTheme.themeSource = connections.store.general.theme
      spotlight.initialize()
      for (const key of shortcutKeys) {
        const accelerator = connections.store.general[key]
        if (!accelerator) continue
        try {
          registerShortcut(accelerator, key === 'globalShortcut' ? showMainWindow : openSpotlight)
          registeredShortcuts[key] = accelerator
        } catch (error) {
          log.warn(error)
          if (Notification.isSupported())
            new Notification({
              title: 'Tether shortcut',
              body: String(error).replace(/^Error: /, '')
            }).show()
        }
      }
      registerIPC()
      createMenus()
      createMainWindow(!connections.store.general.startMinimized)
      initUpdater(
        (channel, state) => {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, state)
        },
        true,
        () => {
          quitting = true
        }
      )
      log.info('Tether started', { version: app.getVersion(), platform: process.platform })
    })
    .catch((error) => {
      log.error('Could not start Tether:', error)
      app.exit(1)
    })
}
