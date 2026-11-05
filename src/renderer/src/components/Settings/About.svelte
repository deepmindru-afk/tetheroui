<script lang="ts">
  /* eslint-disable svelte/no-at-html-tags -- Changelog text is escaped before formatting; icons are static SVG imports. */
  import { onMount } from 'svelte'
  import RefreshIcon from 'iconoir/icons/refresh.svg?raw'
  import XmarkIcon from 'iconoir/icons/xmark.svg?raw'
  import changelog from '../../../../../CHANGELOG.md?raw'
  import type { AppInfo } from '../../../../shared/api'
  import type { UpdateState } from '../../../../shared/updater'

  let info = $state<AppInfo | null>(null)
  let terminalVersion = $state<string | null>(null)
  let update = $state<UpdateState>({ status: 'idle' })
  let error = $state('')
  let changelogDialog: HTMLDialogElement
  const notes = changelog.replace(/^# Changelog\s*/i, '').trim()
  const formattedNotes = notes
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith('## ')) return `<h3>${line.slice(3)}</h3>`
      if (line.startsWith('### ')) return `<h4>${line.slice(4)}</h4>`
      if (line.startsWith('- ')) return `<li>${line.slice(2)}</li>`
      return line.trim() ? `<p>${line}</p>` : ''
    })
    .join('')
    .replace(/(?:<li>.*?<\/li>)+/g, '<ul>$&</ul>')

  async function run(operation: () => Promise<void>): Promise<void> {
    error = ''
    try {
      await operation()
    } catch (cause) {
      error = String(cause).replace(/^Error: /, '')
    }
  }

  onMount(() => {
    let disposed = false
    let receivedUpdate = false
    const unsubscribe = window.api.onUpdateState((value) => {
      receivedUpdate = true
      update = value
    })
    void Promise.all([
      window.api.getAppInfo(),
      window.api.getRuntimeState(),
      window.api.getUpdateState()
    ])
      .then(([app, runtime, state]) => {
        if (disposed) return
        info = app
        terminalVersion = runtime.version
        if (!receivedUpdate) update = state
      })
      .catch((cause) => {
        error = String(cause).replace(/^Error: /, '')
      })
    return () => {
      disposed = true
      unsubscribe()
    }
  })
</script>

<div class="flex flex-col">
  <div class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px]">
    <div>
      <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
        Tether version
      </div>
      <button
        onclick={() => changelogDialog.showModal()}
        class="mt-0.5 inline-block text-[11px] leading-[16px] text-[oklch(0.51_0_0)] transition-colors hover:text-[oklch(0.2_0_0)] dark:text-[oklch(0.77_0_0)] dark:hover:text-white"
        >Read changelog</button
      >
    </div>
    <div class="text-[12px]">{info?.version ?? '…'}</div>
  </div>
  {#if terminalVersion}
    <div class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px]">
      <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
        Open Terminal version
      </div>
      <div class="text-[12px]">{terminalVersion}</div>
    </div>
  {/if}
  <div class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px]">
    <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
      Platform
    </div>
    <div class="text-[12px]">{info?.platform ?? '…'}</div>
  </div>
  <div class="pt-1">
    <div class="flex items-center justify-between gap-[16px]">
      <div>
        <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
          Software update
        </div>
        <div
          class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5"
          role="status"
        >
          {#if update.status === 'unsupported'}
            {update.reason === 'managed'
              ? 'Updates are managed by your package manager.'
              : 'Updates are available in packaged builds.'}
          {:else if update.status === 'up-to-date'}
            Tether is up to date.
          {:else if update.status === 'available'}
            Version {update.version} is available.
          {:else if update.status === 'downloaded'}
            Restart to install version {update.version}.
          {:else if update.status === 'downloading'}
            Downloading… {Math.round(update.percent ?? 0)}%
          {:else if update.status === 'error'}
            {update.error}
          {/if}
        </div>
      </div>
      {#if update.status !== 'unsupported'}
        <button
          class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white"
          disabled={update.status === 'checking' || update.status === 'downloading'}
          onclick={() =>
            run(
              update.status === 'available'
                ? window.api.downloadUpdate
                : update.status === 'downloaded'
                  ? window.api.installUpdate
                  : window.api.checkForUpdates
            )}
        >
          {#if update.status === 'checking'}<span
              aria-hidden="true"
              class="inline-flex size-[12px] animate-spin [&>svg]:size-full"
              >{@html RefreshIcon}</span
            >{/if}
          {update.status === 'checking'
            ? 'Checking…'
            : update.status === 'available'
              ? 'Download update'
              : update.status === 'downloaded'
                ? 'Restart to update'
                : update.status === 'downloading'
                  ? 'Downloading…'
                  : 'Check for updates'}
        </button>
      {/if}
    </div>
  </div>
  <div class="pt-3">
    <button
      class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] dark:hover:text-white"
      onclick={() =>
        window.open('https://github.com/open-webui/tether', '_blank', 'noopener,noreferrer')}
      >View on GitHub</button
    >
  </div>
  {#if error}<p role="alert" class="mt-2 text-[11px] text-red-600 dark:text-red-400 break-words">
      {error}
    </p>{/if}
  <p class="mt-6 text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)]">
    Copyright © {new Date().getFullYear()} Open WebUI Inc.
  </p>
</div>

<dialog
  bind:this={changelogDialog}
  aria-label="Changelog"
  class="m-auto max-h-[calc(100dvh-64px)] w-[calc(100%-48px)] max-w-[560px] flex-col overflow-hidden rounded-[24px] border-none bg-white p-0 text-[#171717] shadow-2xl open:flex backdrop:bg-black/40 backdrop:backdrop-blur-sm dark:bg-[oklch(0.2_0_0)] dark:text-white"
  oncancel={(event) => {
    event.preventDefault()
    event.stopPropagation()
    changelogDialog.close()
  }}
  onkeydown={(event) => {
    if (event.key === 'Escape') event.stopPropagation()
  }}
  onclick={(event) => {
    if (event.target === changelogDialog) changelogDialog.close()
  }}
>
  <div class="flex shrink-0 items-center justify-between gap-4 px-[20px] pt-[20px] pb-[12px]">
    <h2 class="text-[14px] leading-[20px] font-medium">Changelog</h2>
    <button
      class="inline-flex size-[24px] items-center justify-center rounded-[8px] text-gray-500 hover:text-gray-900 dark:hover:text-white"
      aria-label="Close changelog"
      onclick={() => changelogDialog.close()}
    >
      <span aria-hidden="true" class="inline-flex size-[14px] [&>svg]:size-full"
        >{@html XmarkIcon}</span
      >
    </button>
  </div>
  <div class="min-h-0 overflow-y-auto px-[20px] pb-[20px] text-[12px] leading-[18px] select-text">
    {#if notes}
      <div
        class="[&_h3]:mt-[20px] [&_h3]:font-medium [&_h3:first-child]:mt-0 [&_h4]:mt-[10px] [&_h4]:mb-[4px] [&_h4]:font-medium [&_ul]:list-disc [&_ul]:pl-[16px] [&_li+li]:mt-[2px] [&_p]:mt-[6px] [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 dark:[&_code]:bg-white/5"
      >
        {@html formattedNotes}
      </div>
    {:else}
      <p class="text-gray-500 dark:text-gray-400">No release notes yet.</p>
    {/if}
  </div>
</dialog>
