import type { TetherAPI } from '../shared/api'
import type { SpotlightAPI } from '../shared/spotlight'

declare global {
  interface Window {
    api: TetherAPI
    spotlight: SpotlightAPI
  }
}

export {}
