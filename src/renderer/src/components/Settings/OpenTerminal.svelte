<script lang="ts">
  import { onMount } from 'svelte'
  import { parseLocalServerConfig, type RuntimeState } from '../../../../shared/config'

  const id = $props.id()
  // Suggestions only; arbitrary variable names and values remain editable.
  const suggestions: Record<string, string[]> = {
    OPEN_TERMINAL_ENABLE_TERMINAL: ['true', 'false'],
    OPEN_TERMINAL_ENABLE_BROWSER: ['true', 'false'],
    OPEN_TERMINAL_ENABLE_DESKTOP: ['true', 'false'],
    OPEN_TERMINAL_EXECUTE_TIMEOUT: ['60', '120', '300'],
    OPEN_TERMINAL_MAX_SESSIONS: ['16', '32', '64'],
    OPEN_TERMINAL_FILE_BROWSER_ROOT: ['home', '/'],
    OPEN_TERMINAL_BROWSER_EXECUTABLE: [],
    OPEN_TERMINAL_BROWSER_NO_SANDBOX: ['false', 'true'],
    OPEN_TERMINAL_TERM: ['xterm-256color', 'xterm'],
    OPEN_TERMINAL_ENABLE_SYSTEM_PROMPT: ['true', 'false'],
    OPEN_TERMINAL_SYSTEM_PROMPT: [],
    OPEN_TERMINAL_EXECUTE_DESCRIPTION: [],
    OPEN_TERMINAL_INFO: [],
    OPEN_TERMINAL_BINARY_MIME_PREFIXES: ['image', 'image,audio', 'image,audio,video'],
    OPEN_TERMINAL_MAX_LOG_SIZE: ['50000000'],
    OPEN_TERMINAL_LOG_RETENTION: ['604800'],
    OPEN_TERMINAL_LOG_FLUSH_INTERVAL: ['0', '1'],
    OPEN_TERMINAL_LOG_FLUSH_BUFFER: ['0'],
    OPEN_TERMINAL_SESSION_CWD_TTL: ['604800'],
    OPEN_TERMINAL_UVICORN_LOOP: ['auto', 'asyncio', 'uvloop'],
    OPEN_TERMINAL_UVICORN_TIMEOUT_KEEP_ALIVE: []
  }

  function focusNew(node: HTMLInputElement, empty: boolean): void {
    if (empty) node.focus()
  }

  let version = $state('')
  let enabled = $state(false)
  let autoUpdate = $state(false)
  let env = $state<{ name: string; value: string }[]>([])
  let restarting = $state(false)
  let runtime = $state<RuntimeState>({ version: null, status: '', busy: false, error: '' })
  let loaded = $state(false)
  let installing = $state(false)
  let uninstalling = $state(false)
  let error = $state('')
  let saving: Promise<void> = Promise.resolve()
  const busy = $derived(runtime.busy || installing || uninstalling || restarting || !loaded)

  async function save(): Promise<void> {
    const entries = env.filter((row) => row.name.trim() || row.value)
    const names = entries.map((row) => row.name.trim().toUpperCase())
    if (new Set(names).size !== names.length)
      throw new Error('Environment variable names must be unique.')
    const config = {
      localServer: parseLocalServerConfig({
        enabled,
        version,
        autoUpdate,
        env: Object.fromEntries(entries.map((row) => [row.name.trim(), row.value]))
      })
    }
    saving = saving.catch(() => {}).then(() => window.api.setConfig(config))
    return saving
  }

  function saveSettings(): void {
    error = ''
    void save().catch((cause) => {
      error = String(cause).replace(/^Error: /, '')
    })
  }

  async function restart(): Promise<void> {
    restarting = true
    error = ''
    try {
      await save()
      await window.api.restartTerminal()
    } catch (cause) {
      error = String(cause).replace(/^Error: /, '')
    } finally {
      restarting = false
    }
  }

  async function install(): Promise<void> {
    installing = true
    error = ''
    try {
      await save()
      await window.api.installPackage()
      runtime = await window.api.getRuntimeState()
      enabled = (await window.api.getConfig()).localServer.enabled
    } catch (cause) {
      error = String(cause).replace(/^Error: /, '')
    } finally {
      installing = false
    }
  }

  async function uninstall(): Promise<void> {
    uninstalling = true
    error = ''
    try {
      await saving.catch(() => {})
      await window.api.uninstallPackage()
    } catch (cause) {
      error = String(cause).replace(/^Error: /, '')
    } finally {
      try {
        runtime = await window.api.getRuntimeState()
        enabled = (await window.api.getConfig()).localServer.enabled
      } catch (cause) {
        error = String(cause).replace(/^Error: /, '')
      }
      uninstalling = false
    }
  }

  onMount(() => {
    let disposed = false
    const unsubscribe = window.api.onRuntimeState((state) => {
      runtime = state
    })
    void Promise.all([window.api.getConfig(), window.api.getRuntimeState()])
      .then(([config, state]) => {
        if (disposed) return
        version = config.localServer.version
        enabled = config.localServer.enabled
        autoUpdate = config.localServer.autoUpdate
        env = Object.entries(config.localServer.env ?? {}).map(([name, value]) => ({ name, value }))
        runtime = state
        loaded = true
      })
      .catch((cause) => {
        error = String(cause).replace(/^Error: /, '')
      })
    return () => {
      disposed = true
      unsubscribe()
    }
  })

  import Switch from '../common/Switch.svelte'
</script>

<div class="flex min-w-0 flex-col text-[#171717] dark:text-white">
  <div
    class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
  >
    <div>
      <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
        Open Terminal
      </div>
      <p
        class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5"
      >
        {runtime.version ? `v${runtime.version}` : 'Not installed'}
      </p>
    </div>
    <button
      class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
      disabled={busy}
      onclick={install}
      >{installing || (runtime.busy && !uninstalling)
        ? 'Installing…'
        : runtime.version && enabled
          ? 'Update'
          : 'Install'}</button
    >
  </div>
  <div
    class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
  >
    <div>
      <label
        for="terminal-version"
        class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">Version</label
      >
      <p
        class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5"
      >
        Leave blank for latest.
      </p>
    </div>
    <input
      id="terminal-version"
      aria-label="Open Terminal version"
      class="h-[28px] min-h-[28px] max-w-full rounded-[8px] border border-[oklch(0.94_0_0/0.5)] outline-hidden! bg-[oklch(0.98_0_0/0.4)] px-[8px] py-0 text-[12px] leading-[16px] font-normal text-[oklch(0.42_0_0)] transition-colors duration-150 placeholder:text-[oklch(0.85_0_0)] focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-[oklch(0.85_0_0)] dark:placeholder:text-[oklch(0.42_0_0)] dark:focus:border-blue-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield] w-[96px]"
      placeholder="Latest"
      bind:value={version}
      disabled={busy}
      maxlength="100"
      spellcheck="false"
      onchange={saveSettings}
    />
  </div>
  <div
    class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
  >
    <div>
      <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
        Auto-update
      </div>
      <p
        class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5"
      >
        Update on startup when using latest.
      </p>
    </div>
    <Switch
      checked={autoUpdate}
      label="Auto-update"
      disabled={busy || !!version.trim()}
      onchange={(value) => {
        autoUpdate = value
        saveSettings()
      }}
    />
  </div>
  <p
    class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5 mt-3!"
  >
    Optional. Install enables local files and commands for your connected Open WebUI instances.
    Update applies your selected version and restarts local terminals.
  </p>
  <section class="mt-5" aria-label="Environment variables">
    <div class="flex items-center justify-between gap-4 py-[7px]">
      <h3 class="text-[12px] leading-[16px] font-normal">Environment variables</h3>
      <button
        class="env-action"
        disabled={busy || env.some((row) => !row.name.trim())}
        onclick={() => {
          env = [...env, { name: '', value: '' }]
        }}>Add variable</button
      >
    </div>
    <datalist id={`${id}-names`}>
      {#each Object.keys(suggestions) as name (name)}
        {#if !env.some((row) => row.name.trim().toUpperCase() === name)}
          <option value={name}></option>
        {/if}
      {/each}
    </datalist>
    <div class="flex flex-col gap-2">
      {#each env as row, index (row)}
        {@const options = Object.hasOwn(suggestions, row.name.trim())
          ? suggestions[row.name.trim()]
          : []}
        <div class="env-row">
          <input
            class="env-input"
            aria-label={`Variable name ${index + 1}`}
            placeholder="Name"
            list={`${id}-names`}
            autocomplete="off"
            title={row.name}
            use:focusNew={!row.name}
            bind:value={row.name}
            disabled={busy}
            spellcheck="false"
            autocapitalize="off"
            onchange={saveSettings}
          />
          <input
            class="env-input"
            aria-label={`Variable value ${index + 1}`}
            placeholder="Value"
            list={options.length ? `${id}-values-${index}` : undefined}
            autocomplete="off"
            bind:value={row.value}
            disabled={busy}
            spellcheck="false"
            autocapitalize="off"
            onchange={saveSettings}
          />
          {#if options.length}
            <datalist id={`${id}-values-${index}`}>
              {#each options as option (option)}<option value={option}></option>{/each}
            </datalist>
          {/if}
          <button
            class="env-action"
            aria-label={`Remove variable ${index + 1}`}
            disabled={busy}
            onclick={() => {
              env = env.filter((_, i) => i !== index)
              saveSettings()
            }}>Remove</button
          >
        </div>
      {/each}
    </div>
    <div class="mt-2 flex items-start justify-between gap-4">
      <p class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)]">
        Saved on this device. Changes apply when Open Terminal restarts.
      </p>
      <button
        class="env-action shrink-0"
        disabled={busy || !runtime.version || !enabled}
        onclick={restart}>{restarting ? 'Restarting…' : 'Restart to apply'}</button
      >
    </div>
  </section>
  {#if runtime.version || enabled}
    <div class="mt-[10px] flex min-w-0 items-center justify-between gap-[16px] pt-[16px] pb-[7px]">
      <div>
        <div class="text-[12px] leading-[16px] font-normal">Uninstall</div>
        <p
          class="mt-0.5 text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)]"
        >
          Remove the Open Terminal package.
        </p>
      </div>
      <button class="env-action shrink-0" disabled={busy} onclick={uninstall}>
        {uninstalling ? 'Uninstalling…' : 'Uninstall'}
      </button>
    </div>
  {/if}
  {#if runtime.status}<p
      class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5 mt-2! break-words select-text"
      role="status"
    >
      {runtime.status}
    </p>{/if}
  {#if error || runtime.error}<p
      class="mt-2 text-[11px] leading-[16px] text-red-600 dark:text-red-400 break-words select-text"
      role="alert"
    >
      {error || runtime.error}
    </p>{/if}
</div>

<style>
  .env-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
  }
  .env-input {
    height: 28px;
    min-width: 0;
    width: 100%;
    border-radius: 8px;
    border: 1px solid oklch(0.94 0 0 / 0.5);
    background: oklch(0.98 0 0 / 0.4);
    padding: 0 8px;
    font-size: 12px;
    line-height: 16px;
    color: oklch(0.42 0 0);
    outline: none;
  }
  .env-input::placeholder {
    color: oklch(0.85 0 0);
  }
  .env-input:focus {
    border-color: #60a5fa;
  }
  :global(.dark) .env-input {
    border-color: #ffffff0a;
    background: #ffffff08;
    color: oklch(0.85 0 0);
  }
  :global(.dark) .env-input::placeholder {
    color: oklch(0.42 0 0);
  }
  :global(.dark) .env-input:focus {
    border-color: #3b82f6;
  }
  .env-action {
    font-size: 12px;
    line-height: 16px;
    color: oklch(0.69 0 0);
    transition: color 150ms;
  }
  .env-action:hover {
    color: oklch(0.2 0 0);
  }
  :global(.dark) .env-action:hover {
    color: white;
  }
  .env-input:disabled,
  .env-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  @media (max-width: 540px) {
    .env-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .env-input:first-child {
      grid-column: 1 / -1;
    }
  }
</style>
