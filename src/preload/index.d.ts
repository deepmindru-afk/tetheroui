import type { TetherAPI } from '../shared/api'

declare global {
  interface Window {
    api: TetherAPI
  }
}

export {}
