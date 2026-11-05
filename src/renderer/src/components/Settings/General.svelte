<script lang="ts">
  /* eslint-disable svelte/no-at-html-tags -- Icons are static SVG imports from Iconoir. */
  import { onMount } from 'svelte'
  import NavArrowDownIcon from 'iconoir/icons/nav-arrow-down.svg?raw'
  import XmarkIcon from 'iconoir/icons/xmark.svg?raw'
  import Switch from '../common/Switch.svelte'
  import { defaultGeneralConfig, type GeneralConfig } from '../../../../shared/config'

  let config = $state<GeneralConfig>({ ...defaultGeneralConfig })
  let platform = $state('')
  let launchAtLogin = $state(false)
  let loaded = $state(false)
  let busy = $state(false)
  let recording = $state(false)
  let advancedOpen = $state(false)
  let resetting = $state(false)
  let error = $state('')
  const toggles = [
    {
      key: 'startMinimized',
      label: 'Start minimized',
      description: 'Start Tether without opening a window.'
    },
    {
      key: 'runInBackground',
      label: 'Run in background',
      description: 'Keep Tether running when you close the window.'
    },
    {
      key: 'showMenuBarIcon',
      label: 'Show menu bar icon',
      description: 'Show Tether in the macOS menu bar.'
    }
  ] as const

  onMount(() => {
    let disposed = false
    void Promise.all([
      window.api.getConfig(),
      window.api.getAppInfo(),
      window.api.getLaunchAtLogin()
    ])
      .then(([saved, info, login]) => {
        if (disposed) return
        config = saved
        platform = info.platform
        launchAtLogin = login
        loaded = true
      })
      .catch((cause) => {
        if (!disposed) error = String(cause).replace(/^Error: /, '')
      })
    return () => {
      disposed = true
    }
  })

  async function save(patch: Partial<GeneralConfig>): Promise<void> {
    const previous = config
    config = { ...config, ...patch }
    busy = true
    error = ''
    try {
      await window.api.setConfig(patch)
      config = await window.api.getConfig()
    } catch (cause) {
      config = previous
      error = String(cause).replace(/^Error: /, '')
    } finally {
      busy = false
    }
  }

  async function setLaunchAtLogin(enabled: boolean): Promise<void> {
    const previous = launchAtLogin
    launchAtLogin = enabled
    busy = true
    error = ''
    try {
      launchAtLogin = await window.api.setLaunchAtLogin(enabled)
    } catch (cause) {
      launchAtLogin = previous
      error = String(cause).replace(/^Error: /, '')
    } finally {
      busy = false
    }
  }

  async function reset(): Promise<void> {
    resetting = true
    error = ''
    try {
      await window.api.resetApp()
    } catch (cause) {
      error = String(cause).replace(/^Error: /, '')
    } finally {
      resetting = false
    }
  }

  function recordShortcut(event: KeyboardEvent): void {
    if (!recording) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      recording = false
      return
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      recording = false
      void save({ globalShortcut: '' })
      return
    }
    if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return
    const parts: string[] = []
    if (event.metaKey || event.ctrlKey) parts.push('CommandOrControl')
    if (event.altKey) parts.push('Alt')
    if (event.shiftKey) parts.push('Shift')
    const keys: Record<string, string> = {
      Space: 'Space',
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right',
      Enter: 'Return',
      Backquote: '`',
      Minus: '-',
      Equal: '=',
      BracketLeft: '[',
      BracketRight: ']',
      Backslash: '\\',
      Semicolon: ';',
      Quote: "'",
      Comma: ',',
      Period: '.',
      Slash: '/'
    }
    const key =
      keys[event.code] ??
      (event.code.startsWith('Key')
        ? event.code.slice(3)
        : event.code.startsWith('Digit')
          ? event.code.slice(5)
          : event.key)
    parts.push(key)
    recording = false
    void save({ globalShortcut: parts.join('+') })
  }

  const shortcut = $derived(
    config.globalShortcut
      .replace(/CommandOrControl/g, platform === 'darwin' ? '⌘' : 'Ctrl')
      .replace(/Alt/g, platform === 'darwin' ? '⌥' : 'Alt')
      .replace(/Shift/g, platform === 'darwin' ? '⇧' : 'Shift')
      .replace(/\+/g, ' + ')
  )
</script>

<div class="general-settings">
  <div class="setting-row">
    <div>
      <label class="setting-label" for="appearance">Appearance</label>
      <p class="setting-description">Choose how Tether looks.</p>
    </div>
    <div class="select-wrapper">
      <select
        id="appearance"
        class="setting-input"
        value={config.theme}
        disabled={!loaded || busy}
        onchange={(event) => save({ theme: event.currentTarget.value as GeneralConfig['theme'] })}
      >
        <option value="system">Auto</option><option value="light">Light</option><option value="dark"
          >Dark</option
        >
      </select>
      <span aria-hidden="true" class="select-chevron inline-flex [&>svg]:size-full"
        >{@html NavArrowDownIcon}</span
      >
    </div>
  </div>
  {#if platform !== 'linux'}
    <div class="setting-row">
      <div>
        <div class="setting-label">Launch at login</div>
        <p class="setting-description">Open Tether when you sign in to your computer.</p>
      </div>
      <Switch
        checked={launchAtLogin}
        label="Launch at login"
        disabled={!loaded || busy}
        onchange={setLaunchAtLogin}
      />
    </div>
  {/if}
  {#each toggles as setting (setting.key)}
    {#if setting.key !== 'showMenuBarIcon' || platform === 'darwin'}
      <div class="setting-row">
        <div>
          <div class="setting-label">{setting.label}</div>
          <p class="setting-description">{setting.description}</p>
        </div>
        <Switch
          checked={config[setting.key]}
          label={setting.label}
          disabled={!loaded || busy}
          onchange={(value) => save({ [setting.key]: value })}
        />
      </div>
    {/if}
  {/each}
  <div class="setting-row">
    <div>
      <div class="setting-label">Open Tether shortcut</div>
      <p class="setting-description">Bring Tether to the foreground from any app.</p>
    </div>
    <div class="shortcut-controls">
      <button
        class="shortcut-button"
        class:animate-pulse={recording}
        aria-label="Open Tether shortcut"
        aria-pressed={recording}
        disabled={!loaded || busy}
        onclick={() => {
          recording = true
          error = ''
        }}
        onkeydown={recordShortcut}
        onblur={() => (recording = false)}
      >
        {recording ? 'Press a shortcut…' : shortcut || 'Disabled'}
      </button>
      {#if config.globalShortcut && !recording}
        <button
          class="clear-shortcut"
          aria-label="Clear shortcut"
          title="Clear shortcut"
          disabled={!loaded || busy}
          onclick={() => save({ globalShortcut: '' })}
        >
          <span aria-hidden="true" class="inline-flex size-[12px] [&>svg]:size-full"
            >{@html XmarkIcon}</span
          >
        </button>
      {/if}
    </div>
  </div>
  <div class="pt-1">
    <button
      class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
      aria-expanded={advancedOpen}
      aria-controls="advanced-settings"
      onclick={() => (advancedOpen = !advancedOpen)}
    >
      <span
        aria-hidden="true"
        class="inline-flex size-[12px] shrink-0 items-center justify-center leading-none transition-transform duration-200 [&>svg]:size-full"
        class:-rotate-90={!advancedOpen}>{@html NavArrowDownIcon}</span
      >
      <span class="setting-label">Advanced</span>
    </button>
    {#if advancedOpen}
      <div id="advanced-settings" class="flex flex-col">
        <div class="setting-row">
          <div>
            <div class="setting-label">Factory reset</div>
            <p class="setting-description">Remove runtimes, packages, data &amp; connections</p>
          </div>
          <button class="reset-button" disabled={!loaded || busy || resetting} onclick={reset}
            >{resetting ? 'Resetting…' : 'Reset'}</button
          >
        </div>
      </div>
    {/if}
  </div>
  {#if error}<p
      class="mt-2 text-[11px] leading-[16px] text-red-600 dark:text-red-400 break-words select-text"
      role="alert"
    >
      {error}
    </p>{/if}
</div>

<style>
  .reset-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 12px;
    line-height: 16px;
    color: oklch(0.69 0 0);
    transition: color 150ms;
  }
  .reset-button:hover {
    color: oklch(0.2 0 0);
  }
  :global(.dark) .reset-button:hover {
    color: white;
  }
  .reset-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .general-settings {
    display: flex;
    flex-direction: column;
  }
  .setting-row {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-block: 7px;
  }
  .setting-row > :first-child {
    min-width: 0;
  }
  .setting-row > :last-child {
    flex-shrink: 0;
  }
  .setting-label {
    font-size: 12px;
    line-height: 16px;
    font-weight: 400;
    color: #171717;
  }
  .setting-description {
    font-size: 11px;
    line-height: 16px;
    color: oklch(0.51 0 0);
    margin-top: 2px;
  }
  :global(.dark) .setting-label {
    color: #fff;
  }
  :global(.dark) .setting-description {
    color: oklch(0.77 0 0);
  }
  .select-wrapper {
    position: relative;
    display: inline-flex;
    max-width: 100%;
  }
  .setting-input {
    appearance: none;
    outline: none !important;
    transition: border-color 150ms;
    min-width: 100px;
    height: 28px;
    max-width: 100%;
    border-radius: 8px;
    border: 1px solid oklch(0.94 0 0 / 0.5);
    background: oklch(0.98 0 0 / 0.4);
    padding: 0 32px 0 10px;
    font-size: 12px;
    line-height: 16px;
    color: oklch(0.42 0 0);
  }
  .setting-input:focus {
    border-color: #60a5fa;
  }
  :global(.dark) .setting-input:focus {
    border-color: #3b82f6;
  }
  .select-chevron {
    pointer-events: none;
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 14px;
    height: 14px;
    color: oklch(0.77 0 0);
  }
  :global(.dark) .setting-input {
    border-color: #ffffff0a;
    background: #ffffff08;
    color: oklch(0.85 0 0);
  }
  :global(.dark) .select-chevron {
    color: oklch(0.69 0 0);
  }
  .shortcut-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 65%;
  }
  .shortcut-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 80px;
    padding: 0;
    white-space: nowrap;
    font-size: 12px;
    line-height: 16px;
    color: oklch(0.69 0 0);
    transition: color 150ms;
  }
  .shortcut-button:hover {
    color: oklch(0.2 0 0);
  }
  :global(.dark) .shortcut-button:hover {
    color: #fff;
  }
  .clear-shortcut {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: oklch(0.69 0 0);
  }
  .clear-shortcut:hover {
    color: oklch(0.2 0 0);
  }
  :global(.dark) .clear-shortcut:hover {
    color: #fff;
  }
  .setting-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  @media (max-width: 640px) {
    .setting-row {
      gap: 12px;
    }
  }
</style>
