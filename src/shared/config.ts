export interface LocalServerConfig {
  enabled: boolean
  version: string
  autoUpdate: boolean
  env?: Record<string, string>
}

export interface GeneralConfig {
  deviceName: string
  theme: 'system' | 'light' | 'dark'
  startMinimized: boolean
  runInBackground: boolean
  showMenuBarIcon: boolean
  globalShortcut: string
}

export const defaultGeneralConfig: GeneralConfig = {
  deviceName: '',
  theme: 'system',
  startMinimized: false,
  runInBackground: true,
  showMenuBarIcon: true,
  globalShortcut: 'CommandOrControl+Shift+T'
}

export function parseGeneralConfig(value: unknown): GeneralConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid settings')
  const config = { ...defaultGeneralConfig, ...value } as GeneralConfig
  if (
    typeof config.deviceName !== 'string' ||
    config.deviceName.trim().length > 100 ||
    Array.from(config.deviceName).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
  )
    throw new Error('Device name must be at most 100 characters without control characters.')
  if (!['system', 'light', 'dark'].includes(config.theme)) throw new Error('Invalid appearance')
  for (const key of ['startMinimized', 'runInBackground', 'showMenuBarIcon'] as const) {
    if (typeof config[key] !== 'boolean') throw new Error(`Invalid setting: ${key}`)
  }
  if (
    typeof config.globalShortcut !== 'string' ||
    config.globalShortcut.length > 200 ||
    config.globalShortcut.includes('\0')
  )
    throw new Error('Invalid keyboard shortcut')
  return {
    deviceName: config.deviceName.trim(),
    theme: config.theme,
    startMinimized: config.startMinimized,
    runInBackground: config.runInBackground,
    showMenuBarIcon: config.showMenuBarIcon,
    globalShortcut: config.globalShortcut.trim()
  }
}

export interface AppConfig extends GeneralConfig {
  localServer: LocalServerConfig
}

export interface RuntimeState {
  version: string | null
  status: string
  busy: boolean
  error: string
}

export function parseLocalServerConfig(value: unknown): LocalServerConfig {
  if (!value || typeof value !== 'object') throw new Error('Invalid Open Terminal settings')
  const config = value as LocalServerConfig
  if (config.enabled !== undefined && typeof config.enabled !== 'boolean')
    throw new Error('Invalid Open Terminal settings')
  if (typeof config.version !== 'string' || typeof config.autoUpdate !== 'boolean')
    throw new Error('Invalid Open Terminal settings')
  const version = config.version.trim() === 'latest' ? '' : config.version.trim()
  if (version && !/^[a-zA-Z0-9][a-zA-Z0-9.!+_-]{0,99}$/.test(version))
    throw new Error('Enter an Open Terminal version or leave it blank for latest.')
  const env = config.env
  if (env !== undefined) {
    if (!env || typeof env !== 'object' || Array.isArray(env))
      throw new Error('Invalid environment variables')
    const names = new Set<string>()
    for (const [name, value] of Object.entries(env)) {
      if (
        !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) ||
        typeof value !== 'string' ||
        value.includes('\0')
      )
        throw new Error('Environment variables need a valid name and text value.')
      const normalized = name.toUpperCase()
      if (names.has(normalized)) throw new Error(`Duplicate environment variable: ${name}`)
      names.add(normalized)
      if (
        [
          'OPEN_TERMINAL_API_KEY',
          'OPEN_TERMINAL_API_KEY_FILE',
          'OPEN_TERMINAL_HOST',
          'OPEN_TERMINAL_PORT',
          'OPEN_TERMINAL_ISOLATED',
          'OPEN_TERMINAL_CONFIG',
          'OPEN_TERMINAL_CONFIG_PATH',
          'OPEN_TERMINAL_MULTI_USER',
          'OPEN_TERMINAL_ENABLE_NOTEBOOKS',
          'OPEN_TERMINAL_CORS_ALLOWED_ORIGINS',
          'OPEN_TERMINAL_LOG_DIR'
        ].includes(normalized)
      )
        throw new Error(`${name} is managed by Tether.`)
    }
  }
  return {
    enabled: config.enabled ?? false,
    version,
    autoUpdate: config.autoUpdate,
    ...(env === undefined ? {} : { env: { ...env } })
  }
}
