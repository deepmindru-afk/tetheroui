<script lang="ts">
  /* eslint-disable svelte/no-at-html-tags -- Icons are static SVG imports from Iconoir. */
  import { onMount } from 'svelte'
  import { tooltip } from './actions/tooltip'
  import Settings from './components/Settings.svelte'
  import Terminal from './components/Terminal.svelte'
  import TetherBackground from './components/TetherBackground.svelte'
  import TerminalIcon from 'iconoir/icons/terminal.svg?raw'
  import NavArrowDownIcon from 'iconoir/icons/nav-arrow-down.svg?raw'
  import SettingsIcon from 'iconoir/icons/settings.svg?raw'
  import XmarkIcon from 'iconoir/icons/xmark.svg?raw'
  import type { AppInfo } from '../../shared/api'
  import type { GeneralConfig } from '../../shared/config'
  import { normalizeURL, type Connection, type ConnectionState } from '../../shared/connections'

  let state = $state<ConnectionState>({
    connections: [],
    selected: null,
    title: 'Tether',
    terminalStatus: 'stopped',
    errors: {},
    persistentCredentials: true
  })
  let appInfo = $state<AppInfo | null>(null)
  let windowVisible = $state(true)
  let settingsOpen = $state(false)
  let settingsTab = $state('general')
  let terminalOpen = $state(false)
  let terminalTab = $state<'service' | 'shell'>('service')
  let openTerminalInstalled = $state(false)
  const openTerminalRunning = $derived(state.terminalStatus === 'started')
  const activeTerminalTab = $derived(openTerminalRunning ? terminalTab : 'shell')
  const terminalStatusLabel = $derived(
    !openTerminalInstalled && state.terminalStatus === 'stopped'
      ? 'Not installed'
      : {
          started: 'Running',
          starting: 'Starting',
          stopping: 'Stopping',
          stopped: 'Stopped',
          failed: 'Failed'
        }[state.terminalStatus]
  )
  let viewportHeight = $state(680)
  let panelHeight = $state(160)
  const maxDockHeight = $derived(Math.min(1000, Math.max(108, viewportHeight - 160)))
  const dockHeight = $derived(Math.min(panelHeight, maxDockHeight))
  let drag: { target: HTMLElement; pointerId: number; y: number; height: number } | null = null

  function resizeTerminal(height: number): void {
    panelHeight = Math.max(108, Math.min(maxDockHeight, height))
  }

  function endResize(): void {
    if (!drag) return
    const { target, pointerId } = drag
    drag = null
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
  }

  function startResize(event: PointerEvent): void {
    if (event.button !== 0) return
    event.preventDefault()
    endResize()
    const target = event.currentTarget as HTMLElement
    // Keep receiving movement when the pointer crosses the embedded WebUI.
    target.setPointerCapture(event.pointerId)
    drag = { target, pointerId: event.pointerId, y: event.clientY, height: dockHeight }
  }

  $effect(() => {
    void window.api.setTerminalHeight(terminalOpen ? dockHeight : 0).catch((cause) => {
      error = String(cause)
    })
  })
  let name = $state('')
  let url = $state('')
  let error = $state('')
  let busy = $state(false)
  let removing = $state<string | null>(null)
  let editing = $state<string | null>(null)
  let addressInput = $state<HTMLInputElement>()
  let setupDialog: HTMLDialogElement
  const selected = $derived(
    state.connections.find((connection) => connection.id === state.selected)
  )

  async function run(operation: () => Promise<unknown>): Promise<void> {
    busy = true
    error = ''
    try {
      await operation()
    } catch (cause) {
      error = String(cause).replace(/^Error: /, '')
    } finally {
      busy = false
    }
  }

  async function toggleSettings(open: boolean, tab = 'general'): Promise<void> {
    await run(async () => {
      await window.api.setSettingsOpen(open)
      if (open) settingsTab = tab
      settingsOpen = open
    })
  }

  async function addConnection(installTerminal = false): Promise<void> {
    state = await window.api.addConnection({ name, url, installTerminal })
    name = ''
    url = ''
  }

  function editConnection(connection: Connection): void {
    editing = connection.id
    removing = null
    error = ''
    name = connection.name
    url = connection.url
    addressInput?.focus()
  }

  function cancelEdit(): void {
    editing = null
    name = ''
    url = ''
    error = ''
  }

  function finishSetup(installTerminal: boolean): void {
    if (busy) return
    setupDialog.close()
    void run(() => addConnection(installTerminal))
  }

  onMount(() => {
    const unsubscribeVisibility = window.api.onWindowVisibility((visible) => {
      windowVisible = visible
    })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    let theme: GeneralConfig['theme'] = 'system'
    let receivedConfig = false
    let receivedRuntime = false
    const unsubscribeRuntime = window.api.onRuntimeState((runtime) => {
      receivedRuntime = true
      openTerminalInstalled = Boolean(runtime.version)
      if (!openTerminalInstalled) terminalTab = 'shell'
    })
    const applyTheme = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.classList.toggle('light', !dark)
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    }
    const unsubscribeConfig = window.api.onConfigChanged((config) => {
      receivedConfig = true
      theme = config.theme
      applyTheme()
    })
    applyTheme()
    media.addEventListener('change', applyTheme)
    void run(async () => {
      const [connections, info, config, runtime] = await Promise.all([
        window.api.listConnections(),
        window.api.getAppInfo(),
        window.api.getConfig(),
        window.api.getRuntimeState()
      ])
      state = connections
      appInfo = info
      if (!receivedRuntime) {
        openTerminalInstalled = Boolean(runtime.version)
        if (!openTerminalInstalled) terminalTab = 'shell'
      }
      if (!receivedConfig) {
        theme = config.theme
        applyTheme()
      }
    })
    const unsubscribe = window.api.onConnectionState((value) => {
      state = value
    })
    return () => {
      endResize()
      unsubscribe()
      unsubscribeConfig()
      unsubscribeRuntime()
      unsubscribeVisibility()
      media.removeEventListener('change', applyTheme)
    }
  })
</script>

{#snippet globe()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <ellipse cx="12" cy="12" rx="4" ry="9" />
    <path d="M3 12h18" />
  </svg>
{/snippet}

{#snippet plus()}
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
{/snippet}

<svelte:window bind:innerHeight={viewportHeight} onblur={endResize} />

<svelte:head>
  <title>{state.title}</title>
</svelte:head>

<div class="shell" style:--titlebar-height={appInfo?.platform === 'darwin' ? '28px' : '32px'}>
  <header class="titlebar" title={selected?.url}>
    <span>{state.title}</span>
    <button
      class="refresh-button"
      aria-label="Refresh"
      use:tooltip={'Refresh'}
      disabled={!state.selected || busy}
      onclick={() => run(() => window.api.reloadConnection())}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6" />
      </svg>
    </button>
  </header>

  <main>
    {#if !state.selected}
      <TetherBackground paused={!windowVisible} />
      <div class="connection-page" class:welcome={state.connections.length === 0}>
        {#if state.connections.length}
          <h1>Connections</h1>
          <div class="saved-connections">
            {#each state.connections as connection (connection.id)}
              <section aria-label={connection.name}>
                <div class="connection-row">
                  <button
                    class="open-connection"
                    disabled={busy}
                    onclick={() => run(() => window.api.selectConnection(connection.id))}
                  >
                    <span class="connection-icon">{@render globe()}</span>
                    <span class="connection-details">
                      <span class="connection-name">{connection.name}</span>
                      <span class="connection-url" title={connection.url}>{connection.url}</span>
                    </span>
                  </button>
                  <button
                    class="text-button"
                    disabled={busy}
                    aria-pressed={editing === connection.id}
                    onclick={() => editConnection(connection)}>Edit</button
                  >
                  <button
                    class="text-button remove-button"
                    disabled={busy}
                    aria-expanded={removing === connection.id}
                    onclick={() => (removing = removing === connection.id ? null : connection.id)}
                    >Remove</button
                  >
                </div>
                {#if removing === connection.id}
                  <div class="remove-confirmation">
                    <p>Remove this connection and sign out?</p>
                    <div class="confirmation-actions">
                      <button class="text-button" disabled={busy} onclick={() => (removing = null)}
                        >Cancel</button
                      >
                      <button
                        class="text-button"
                        disabled={busy}
                        onclick={() =>
                          run(async () => {
                            await window.api.removeConnection(connection.id)
                            if (editing === connection.id) cancelEdit()
                            removing = null
                          })}>Remove and sign out</button
                      >
                    </div>
                  </div>
                {/if}
                {#if state.errors[connection.id]}
                  <p class="message" role="status">{state.errors[connection.id]}</p>
                {/if}
              </section>
            {/each}
          </div>
          <h2>{editing ? 'Edit connection' : 'Add connection'}</h2>
        {:else}
          <h1>Connect to Open WebUI</h1>
          <p class="intro">Enter your Open WebUI address to get started.</p>
        {/if}

        <form
          onsubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              normalizeURL(url.trim())
              if (editing) {
                state = await window.api.updateConnection(editing, { name, url })
                cancelEdit()
              } else if (state.connections.length === 0 && !openTerminalInstalled)
                setupDialog.showModal()
              else await addConnection()
            })
          }}
        >
          <div class="field">
            <label for="url">Open WebUI address</label>
            <input
              id="url"
              bind:this={addressInput}
              type="url"
              bind:value={url}
              placeholder="https://chat.example.com"
              required
              spellcheck="false"
              autocapitalize="off"
            />
          </div>
          <div class="field">
            <label for="name">Name <span class="optional">optional</span></label>
            <input id="name" bind:value={name} maxlength="100" placeholder="My WebUI" />
          </div>
          {#if editing && url.trim() !== state.connections.find((connection) => connection.id === editing)?.url}
            <p class="message">Changing the address will sign you out of this connection.</p>
          {/if}
          <div class="form-actions">
            {#if editing}
              <button type="button" class="text-button" disabled={busy} onclick={cancelEdit}
                >Cancel</button
              >
            {/if}
            <button class="primary" disabled={busy}>
              {editing ? (busy ? 'Saving…' : 'Save') : busy ? 'Connecting…' : 'Connect'}
              {#if !editing}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 12h16m-6-6 6 6-6 6" />
                </svg>
              {/if}
            </button>
          </div>
        </form>
        {#if !state.persistentCredentials}
          <p class="message" role="status">
            Secure credential storage is unavailable. Sign-in will last until Tether quits.
          </p>
        {/if}
        {#if error}<p class="message destructive" role="alert">{error}</p>{/if}
        {#if !openTerminalInstalled}
          <section class="terminal-setup" aria-label="Open Terminal">
            <div>
              <h2>Open Terminal</h2>
              <p>Let Open WebUI run commands and work with files on this computer.</p>
            </div>
            <button
              class="text-button"
              disabled={busy}
              onclick={() => toggleSettings(true, 'terminal')}>Set up</button
            >
          </section>
        {/if}
      </div>
    {/if}
  </main>

  <footer class="connection-bar">
    {#if terminalOpen}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="resize-edge"
        role="separator"
        aria-label="Resize terminal"
        aria-orientation="horizontal"
        aria-valuenow={dockHeight}
        aria-valuemin={108}
        aria-valuemax={maxDockHeight}
        tabindex="0"
        onpointerdown={startResize}
        onpointermove={(event) => {
          if (drag) resizeTerminal(drag.height + drag.y - event.clientY)
        }}
        onpointerup={endResize}
        onpointercancel={endResize}
        onlostpointercapture={endResize}
        onkeydown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            resizeTerminal(dockHeight + (event.key === 'ArrowUp' ? 20 : -20))
          }
        }}
      ></div>
    {/if}
    <button class="manage-button" aria-label="Settings" onclick={() => toggleSettings(true)}>
      <span class="inline-flex size-[12px] shrink-0 [&>svg]:size-full" aria-hidden="true"
        >{@html SettingsIcon}</span
      >Settings
    </button>
    <nav aria-label="WebUI connections">
      {#each state.connections as connection (connection.id)}
        <button
          class="connection-tab"
          class:active={state.selected === connection.id}
          aria-current={state.selected === connection.id ? 'page' : undefined}
          use:tooltip={connection.url}
          disabled={busy}
          onclick={() => run(() => window.api.selectConnection(connection.id))}
        >
          <span class="tab-label">{connection.name}</span>
          {#if state.errors[connection.id]}<span
              class="error-indicator"
              aria-label="Connection needs attention"
            ></span>{/if}
        </button>
        {#if state.selected === connection.id}
          <button
            class="browser-button"
            aria-label="Open in browser"
            use:tooltip={'Open in browser'}
            onclick={() => window.open(connection.url, '_blank', 'noopener,noreferrer')}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </button>
        {/if}
      {/each}
    </nav>
    {#if state.connections.length}
      <button
        class="add-button"
        aria-label="Add connection"
        use:tooltip={'Add connection'}
        disabled={busy}
        onclick={() => run(() => window.api.selectConnection(null))}>{@render plus()}</button
      >
    {/if}
    <button
      class="bar-space"
      aria-expanded={terminalOpen}
      aria-controls="terminal-output"
      aria-label={terminalOpen ? 'Collapse terminal' : 'Expand terminal'}
      onclick={() => (terminalOpen = !terminalOpen)}
    ></button>
    <button
      class="manage-button"
      class:active={terminalOpen}
      aria-label="Inspect terminal"
      use:tooltip={terminalStatusLabel}
      aria-expanded={terminalOpen}
      aria-controls="terminal-output"
      onclick={() => (terminalOpen = !terminalOpen)}
    >
      <span class="inline-flex size-[12px] shrink-0 [&>svg]:size-full" aria-hidden="true"
        >{@html TerminalIcon}</span
      >
      {#if openTerminalInstalled || state.terminalStatus !== 'stopped'}
        <span
          class="terminal-status"
          data-status={state.terminalStatus}
          role="status"
          aria-label={terminalStatusLabel}
        ></span>
      {/if}
    </button>
    {#if appInfo?.version}
      <button
        class="version"
        use:tooltip={'About Tether'}
        onclick={() => toggleSettings(true, 'about')}
      >
        v{appInfo.version}
      </button>
    {/if}
    <button
      class="terminal-toggle"
      aria-expanded={terminalOpen}
      aria-controls="terminal-output"
      aria-label={terminalOpen ? 'Collapse terminal' : 'Expand terminal'}
      use:tooltip={terminalOpen ? 'Collapse terminal' : 'Expand terminal'}
      onclick={() => (terminalOpen = !terminalOpen)}
    >
      <span
        class="inline-flex h-full w-[12px] items-center justify-center shrink-0 leading-none [&>svg]:size-[12px]"
        class:rotate-180={!terminalOpen}
        aria-hidden="true">{@html NavArrowDownIcon}</span
      >
    </button>
  </footer>
  {#if terminalOpen}
    <section
      id="terminal-output"
      class="terminal-output"
      style:height={`${dockHeight}px`}
      aria-label={activeTerminalTab === 'shell'
        ? 'Shell'
        : selected
          ? `Open Terminal: ${selected.name}`
          : 'Open Terminal setup'}
    >
      <nav class="terminal-tabs" aria-label="Terminal views">
        {#if openTerminalRunning}
          <button
            class:active={activeTerminalTab === 'service'}
            aria-pressed={activeTerminalTab === 'service'}
            onclick={() => (terminalTab = 'service')}>Open Terminal</button
          >
        {/if}
        <button
          class:active={activeTerminalTab === 'shell'}
          aria-pressed={activeTerminalTab === 'shell'}
          onclick={() => (terminalTab = 'shell')}>Shell</button
        >
      </nav>
      <div class="terminal-pane">
        {#if activeTerminalTab === 'shell'}<Terminal target={{ type: 'shell' }} readonly={false} />
        {:else}{#key state.selected}<Terminal
              target={{ type: 'service', id: state.selected }}
            />{/key}{/if}
      </div>
    </section>
  {/if}
</div>

{#if settingsOpen}<Settings bind:settingsTab onClose={() => void toggleSettings(false)} />{/if}

<dialog
  bind:this={setupDialog}
  aria-labelledby="setup-title"
  aria-describedby="setup-description"
  class="m-auto w-[calc(100%-48px)] max-w-[400px] rounded-[24px] border-none bg-white p-[20px] text-[#171717] shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm dark:bg-[oklch(0.2_0_0)] dark:text-white"
  onclick={(event) => {
    if (event.target === setupDialog) setupDialog.close()
  }}
  onkeydown={(event) => {
    if (event.key === 'Escape') setupDialog.close()
  }}
>
  <div class="mb-[12px] flex items-center justify-between gap-4">
    <h2 id="setup-title" class="mb-0!">Set up Open Terminal?</h2>
    <button
      class="inline-flex size-[24px] items-center justify-center rounded-[8px] text-gray-500 hover:text-gray-900 dark:hover:text-white"
      aria-label="Close setup"
      onclick={() => setupDialog.close()}
    >
      <span aria-hidden="true" class="inline-flex size-[14px] [&>svg]:size-full"
        >{@html XmarkIcon}</span
      >
    </button>
  </div>
  <p id="setup-description" class="text-[12px] leading-[18px] text-gray-600 dark:text-gray-400">
    Enable local capabilities in Open WebUI. You can also set this up later in Settings.
  </p>
  <div class="mt-[20px] flex items-center justify-end gap-[16px]">
    <button class="text-button" disabled={busy} onclick={() => finishSetup(false)}>Not now</button>
    <button class="primary" disabled={busy} onclick={() => finishSetup(true)}
      >Install and connect</button
    >
  </div>
</dialog>

<style>
  .terminal-tabs {
    display: flex;
    height: 24px;
    font-size: 11px;
    color: var(--bar-muted);
  }
  .terminal-tabs button {
    padding: 0 8px;
  }
  .terminal-tabs button:hover,
  .terminal-tabs button.active {
    color: var(--bar-foreground);
  }
  .terminal-tabs button.active {
    font-weight: 500;
  }
  .terminal-pane {
    position: absolute;
    inset: 24px 0 0;
  }
  .terminal-output {
    position: relative;
    flex-shrink: 0;
    min-height: 0;
    background: var(--bar-background);
  }
  .shell {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .titlebar {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--titlebar-height);
    flex-shrink: 0;
    padding-inline: max(80px, calc(100vw - env(titlebar-area-width, 100vw) + 8px));
    -webkit-app-region: drag;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary);
  }
  .titlebar span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  main {
    position: relative;
    isolation: isolate;
    display: flex;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 32px 24px;
  }
  .connection-page {
    position: relative;
    width: 100%;
    max-width: 400px;
    margin: auto;
  }
  .welcome {
    max-width: 320px;
  }
  h1,
  h2 {
    font-size: 14px;
    line-height: 20px;
    font-weight: 500;
    margin: 0 0 16px;
  }
  .welcome h1 {
    font-size: 18px;
    line-height: 24px;
    margin-bottom: 6px;
  }
  .intro {
    margin-bottom: 24px;
    color: var(--text-secondary);
    font-size: 12px;
  }
  .saved-connections {
    margin-bottom: 28px;
  }
  .terminal-setup {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 28px;
  }
  .terminal-setup h2 {
    margin-bottom: 4px;
    font-size: 12px;
  }
  .terminal-setup p {
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 16px;
  }
  .terminal-setup button {
    flex-shrink: 0;
    margin-left: auto;
  }
  section + section {
    margin-top: 12px;
  }
  .connection-row {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .open-connection {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    gap: 10px;
    text-align: left;
    padding: 4px 0;
  }
  .connection-icon {
    display: flex;
    flex-shrink: 0;
    color: var(--text-secondary);
  }
  .connection-icon svg {
    width: 16px;
    height: 16px;
  }
  .connection-details {
    min-width: 0;
  }
  .connection-name {
    display: block;
    font-size: 12px;
    line-height: 16px;
  }
  .connection-url {
    display: block;
    font-size: 11px;
    line-height: 16px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .open-connection:hover .connection-name {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .field + .field {
    margin-top: 14px;
  }
  label {
    display: block;
    font-size: 12px;
    line-height: 16px;
    margin-bottom: 6px;
  }
  .optional {
    color: var(--text-placeholder);
  }
  input {
    width: 100%;
    height: 28px;
    border: 1px solid var(--input-border);
    border-radius: 8px;
    background: var(--input-background);
    padding: 0 8px;
    font-size: 12px;
    line-height: 16px;
    color: inherit;
    transition: border-color 150ms;
  }
  input::placeholder {
    color: var(--text-placeholder);
  }
  input:focus {
    border-color: var(--focus);
    outline: none;
  }
  .form-actions {
    display: flex;
    gap: 16px;
    justify-content: flex-end;
    margin-top: 20px;
  }
  .primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    border-radius: 8px;
    min-height: 28px;
    padding: 5px 12px;
    background: var(--primary-background);
    color: var(--primary-text);
    font-size: 12px;
    font-weight: 500;
  }
  .primary svg {
    width: 12px;
    height: 12px;
  }
  .primary:hover:not(:disabled) {
    opacity: 0.85;
  }
  .primary:active:not(:disabled) {
    transform: scale(0.98);
  }
  .text-button {
    font-size: 12px;
    line-height: 16px;
    color: var(--text-secondary);
  }
  .text-button:hover:not(:disabled) {
    color: var(--text-primary);
  }
  .remove-button {
    flex-shrink: 0;
  }
  .remove-confirmation {
    padding: 10px 0 6px 26px;
    font-size: 11px;
    color: var(--text-secondary);
  }
  .confirmation-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 8px;
  }
  .destructive {
    color: var(--text-danger);
  }
  .message {
    font-size: 11px;
    line-height: 16px;
    color: var(--text-secondary);
    margin-top: 12px;
    overflow-wrap: anywhere;
    user-select: text;
  }
  .message.destructive {
    color: var(--text-danger);
  }
  .connection-bar {
    position: relative;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    height: 24px;
    min-width: 0;
    background: var(--bar-background);
    color: var(--bar-muted);
    font-size: 11px;
  }
  .resize-edge {
    position: absolute;
    top: 0;
    inset-inline: 0;
    height: 6px;
    z-index: 1;
    cursor: ns-resize;
    touch-action: none;
  }
  .resize-edge:focus-visible {
    outline: 1px solid var(--bar-muted);
    outline-offset: -3px;
  }
  .connection-bar button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 100%;
    flex-shrink: 0;
  }
  .connection-bar button:hover:not(:disabled),
  .connection-bar button.active {
    color: var(--bar-foreground);
  }
  .connection-bar button.active {
    font-weight: 500;
  }
  .connection-bar button:focus-visible {
    outline: 1px solid currentColor;
    outline-offset: -3px;
  }
  .connection-bar svg {
    width: 12px;
    height: 12px;
  }
  .manage-button {
    padding: 0 8px;
  }
  .terminal-status {
    width: 5px;
    height: 5px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--bar-muted);
  }
  .terminal-status[data-status='started'] {
    background: #22c55e;
  }
  .terminal-status[data-status='starting'],
  .terminal-status[data-status='stopping'] {
    background: #d99a19;
  }
  .terminal-status[data-status='failed'] {
    background: #ef4444;
  }
  .terminal-status[data-status='stopped'] {
    width: 7px;
    height: 7px;
    background: transparent;
    border: 1px dotted var(--bar-muted);
  }
  nav {
    display: flex;
    align-self: stretch;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .connection-tab {
    padding: 0 8px;
    white-space: nowrap;
  }
  .tab-label {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .error-indicator {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #d99a19;
  }
  .browser-button {
    width: 20px;
    padding-right: 4px;
  }
  .terminal-toggle {
    width: 18px;
    margin-right: 4px;
    padding: 0;
    line-height: 0;
  }
  .refresh-button {
    position: absolute;
    top: 0;
    right: max(
      8px,
      calc(100vw - env(titlebar-area-width, 100vw) - env(titlebar-area-x, 0px) + 8px)
    );
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 100%;
    padding: 0;
    -webkit-app-region: no-drag;
  }
  .refresh-button:hover:not(:disabled) {
    color: var(--text-primary);
  }
  .refresh-button svg,
  .browser-button svg {
    width: 10px;
    height: 10px;
  }
  .add-button {
    width: 24px;
  }
  .bar-space {
    flex: 1;
    min-width: 28px;
    padding: 0;
    min-width: 8px;
  }
  .version {
    flex-shrink: 0;
    padding: 0 8px;
    -webkit-app-region: no-drag;
  }
  @media (prefers-reduced-motion: reduce) {
    input {
      transition: none;
    }
    .primary:active:not(:disabled) {
      transform: none;
    }
  }
  @media (max-height: 460px) {
    main {
      padding-block: 16px;
    }
    .intro {
      margin-bottom: 16px;
    }
  }
</style>
