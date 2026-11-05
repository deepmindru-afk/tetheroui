import { contextBridge, ipcRenderer } from 'electron'
import type { TetherAuthBridge } from '../shared/connections'

let managed = false

const bridge: TetherAuthBridge = {
  version: 1,
  signedIn: (token) => {
    managed = true
    return ipcRenderer.invoke('tether:login', token)
  },
  refresh: (force) => {
    managed = true
    return ipcRenderer.invoke('tether:refresh', force)
  },
  signedOut: () => ipcRenderer.invoke('tether:logout'),
  onToken: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, access): void => callback(access)
    ipcRenderer.on('tether:token', listener)
    return () => ipcRenderer.removeListener('tether:token', listener)
  }
}

if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('tether', bridge)
  // Old WebUI versions have no bridge hooks. Observe their existing token lifecycle.
  let previous: string | null = null
  let working = false
  window.addEventListener('DOMContentLoaded', () => {
    const timer = setInterval(async () => {
      if (working || managed) return
      const token = localStorage.getItem('token')
      if (token === previous) return
      const old = previous
      previous = token
      working = true
      try {
        if (token) await ipcRenderer.invoke('tether:login', token)
        else if (old) await bridge.signedOut()
      } catch {
        // WebUI owns displaying authentication failures; never log credentials.
      } finally {
        working = false
      }
    }, 2000)
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true })
  })
}
