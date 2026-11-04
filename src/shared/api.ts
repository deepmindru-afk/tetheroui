import type { UpdateState } from './updater'

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
}

export interface TetherAPI {
  getAppInfo: () => Promise<AppInfo>
  getUpdateState: () => Promise<UpdateState>
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  onUpdateState: (callback: (state: UpdateState) => void) => () => void
}
