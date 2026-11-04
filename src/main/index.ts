import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { join } from 'node:path'
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

app.setName('Tether')
log.initialize()
log.errorHandler.startCatching()

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

function showMainWindow(): void {
  if (!mainWindow) createMainWindow()
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.show()
  mainWindow?.focus()
}

function openExternal(url: string): void {
  if (!['https:', 'http:'].includes(new URL(url).protocol)) return
  void shell.openExternal(url).catch((error) => log.warn('Could not open link:', error))
}

function createMainWindow(): void {
  const window = new BrowserWindow({
    title: 'Tether',
    width: 960,
    height: 680,
    minWidth: 480,
    minHeight: 360,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#171717',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWindow = window
  optimizer.watchWindowShortcuts(window)
  window.once('ready-to-show', () => window.show())
  window.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      window.hide()
    }
  })
  window.on('closed', () => {
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

function registerIPC(): void {
  const handle = (channel: string, callback: () => unknown): void => {
    ipcMain.handle(channel, (event) => {
      if (
        event.sender !== mainWindow?.webContents ||
        event.senderFrame !== event.sender.mainFrame
      ) {
        throw new Error('Unknown IPC sender')
      }
      return callback()
    })
  }
  handle(
    'app:info',
    (): AppInfo => ({
      name: app.name,
      version: app.getVersion(),
      platform: process.platform
    })
  )
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

  tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  tray.setToolTip('Tether')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Tether', click: showMainWindow },
      updateItem,
      { type: 'separator' },
      { label: 'Quit Tether', click: () => app.quit() }
    ])
  )
  tray.on('click', showMainWindow)
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
  app.on('before-quit', () => {
    quitting = true
  })
  app.on('will-quit', () => {
    tray?.destroy()
    tray = null
  })
  app
    .whenReady()
    .then(() => {
      electronApp.setAppUserModelId('com.openwebui.tether')
      app.dock?.setIcon(icon)
      app.setAboutPanelOptions({
        applicationName: 'Tether',
        applicationVersion: app.getVersion(),
        copyright: 'Copyright © 2026 Open WebUI Inc.',
        website: 'https://github.com/open-webui/tether',
        iconPath: icon
      })
      registerIPC()
      createMenus()
      createMainWindow()
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
