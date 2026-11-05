import { contextBridge, ipcRenderer } from 'electron'
import type { TetherBridge } from '../shared/connections'

let managed = false

const bridge: TetherBridge = {
  version: 1,
  onEvent: (callback) => {
    const listener = async (
      _event: Electron.IpcRendererEvent,
      id: string,
      event
    ): Promise<void> => {
      let error = ''
      try {
        await callback(event)
      } catch (cause) {
        error = String(cause).slice(0, 500)
      }
      await ipcRenderer.invoke('tether:event:ack', id, error).catch(() => {})
    }
    ipcRenderer.on('tether:event', listener)
    void ipcRenderer.invoke('tether:event:ready', true).catch(() => {})
    return () => {
      ipcRenderer.removeListener('tether:event', listener)
      void ipcRenderer.invoke('tether:event:ready', false).catch(() => {})
    }
  },
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
