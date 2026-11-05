<script lang="ts">
  /* eslint-disable svelte/no-at-html-tags -- Icons are static SVG imports from Iconoir. */
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import NavArrowLeftIcon from 'iconoir/icons/nav-arrow-left.svg?raw'
  import SearchIcon from 'iconoir/icons/search.svg?raw'
  import InfoCircleIcon from 'iconoir/icons/info-circle.svg?raw'
  import TerminalIcon from 'iconoir/icons/terminal.svg?raw'
  import OpenTerminal from './Settings/OpenTerminal.svelte'
  import General from './Settings/General.svelte'
  import SettingsIcon from 'iconoir/icons/settings.svg?raw'
  import About from './Settings/About.svelte'

  let {
    onClose,
    settingsTab = $bindable('general')
  }: { onClose: () => void; settingsTab?: string } = $props()
  let dialog: HTMLDialogElement
  let search = $state('')
  let showSearch = $state(false)
  const tabs = [
    {
      id: 'general',
      label: 'General',
      icon: SettingsIcon,
      group: null,
      keywords:
        'device name appearance theme auto light dark login minimized background menu bar icon keyboard shortcut spotlight screenshot clipboard advanced factory reset'
    },
    {
      id: 'terminal',
      label: 'Open Terminal',
      icon: TerminalIcon,
      group: 'Services',
      keywords:
        'version latest install update auto-update local tools environment variables restart home directory folder'
    },
    {
      id: 'about',
      label: 'About',
      icon: InfoCircleIcon,
      group: null,
      keywords: 'Tether version platform software update changelog GitHub'
    }
  ]
  const filteredTabs = $derived(
    tabs.filter((tab) =>
      `${tab.label} ${tab.keywords}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    )
  )
  onMount(() => {
    dialog.showModal()
  })
</script>

<dialog
  bind:this={dialog}
  aria-label="Settings"
  class="fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-transparent p-[16px] open:flex open:items-center open:justify-center sm:p-[24px] lg:p-[32px]"
  oncancel={(event) => {
    event.preventDefault()
    onClose()
  }}
  onclick={(event) => {
    if (event.target === dialog) onClose()
  }}
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }}
>
  <div
    class="w-full h-[calc(100dvh-64px)] max-h-[calc(100dvh-64px)] rounded-[32px] overflow-hidden shadow-2xl"
  >
    <div
      class="flex h-full w-full min-h-0 flex-col bg-white text-[12px] leading-[16px] text-[oklch(0.2_0_0)] md:flex-row dark:bg-[oklch(0.2_0_0)] dark:text-[oklch(0.85_0_0)] dark:[color-scheme:dark] [&_:is(button,input,select,textarea):focus-visible]:outline-2 [&_:is(button,input,select,textarea):focus-visible]:outline-offset-2 [&_:is(button,input,select,textarea):focus-visible]:outline-blue-500 motion-reduce:[&_*]:transition-none motion-reduce:[&_*]:animate-none"
      in:fade={{ duration: 150 }}
    >
      <nav class="flex min-w-0 shrink-0 flex-col md:min-h-0 md:w-[208px]" aria-label="Settings">
        <div class="m-1 flex shrink-0 items-center gap-1 md:mb-0">
          <button
            type="button"
            class="flex h-[28px] flex-1 items-center gap-[6px] rounded-[8px] px-[8px] text-gray-800 transition-colors duration-75 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            onclick={onClose}
          >
            <span class="inline-flex size-[12px] shrink-0 [&>svg]:size-full" aria-hidden="true"
              >{@html NavArrowLeftIcon}</span
            >
            Back
          </button>
          <button
            type="button"
            class="flex size-[28px] shrink-0 items-center justify-center rounded-[8px] text-[oklch(0.51_0_0)] hover:text-[oklch(0.42_0_0)] md:hidden dark:text-[oklch(0.69_0_0)] dark:hover:text-[oklch(0.85_0_0)]"
            aria-label="Search settings"
            aria-expanded={showSearch || !!search}
            aria-controls="settings-search"
            onclick={() => (showSearch = !showSearch)}
          >
            <span class="inline-flex size-[14px] [&>svg]:size-full" aria-hidden="true"
              >{@html SearchIcon}</span
            >
          </button>
        </div>

        <div
          class="relative mx-[4px] mb-[2px] h-[28px] shrink-0 md:mt-[4px] md:flex {showSearch ||
          search
            ? 'flex'
            : 'hidden'}"
        >
          <span
            class="pointer-events-none absolute left-[8px] top-1/2 inline-flex size-[14px] -translate-y-1/2 [&>svg]:size-full"
            aria-hidden="true">{@html SearchIcon}</span
          >
          <input
            id="settings-search"
            aria-label="Search settings"
            class="h-[28px] min-h-[28px] max-w-full rounded-[8px] border border-[oklch(0.94_0_0/0.5)] outline-hidden! bg-[oklch(0.98_0_0/0.4)] px-[8px] py-0 text-[12px] leading-[16px] font-normal text-[oklch(0.42_0_0)] transition-colors duration-150 placeholder:text-[oklch(0.85_0_0)] focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-[oklch(0.85_0_0)] dark:placeholder:text-[oklch(0.42_0_0)] dark:focus:border-blue-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield] w-full min-w-0 pl-[30px]"
            bind:value={search}
            placeholder="Search settings"
            onkeydown={(event) => {
              if (event.key === 'Enter' && filteredTabs[0]) settingsTab = filteredTabs[0].id
            }}
          />
        </div>

        <div
          class="flex min-h-0 min-w-0 flex-1 gap-px overflow-x-auto p-1 max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden md:flex-col md:overflow-x-hidden md:overflow-y-auto"
        >
          {#each filteredTabs as tab, index (tab.id)}
            {#if tab.group && (index === 0 || filteredTabs[index - 1].group !== tab.group)}
              <div
                class="hidden shrink-0 px-[8px] text-[10px] text-gray-800 md:block dark:text-gray-400 {index ===
                0
                  ? 'mt-0.5'
                  : 'mt-2'} mb-0.5"
              >
                {tab.group}
              </div>
            {/if}
            <button
              type="button"
              class="flex h-[28px] shrink-0 items-center gap-[6px] rounded-[8px] px-[8px] text-left transition-colors duration-75 md:w-full {settingsTab ===
              tab.id
                ? 'bg-gray-50 font-medium text-gray-900 dark:bg-white/[0.04] dark:text-white'
                : 'text-gray-800 hover:text-gray-900 dark:text-gray-200 dark:hover:text-gray-100'}"
              aria-current={settingsTab === tab.id ? 'page' : undefined}
              onclick={() => (settingsTab = tab.id)}
            >
              <span class="inline-flex size-[14px] shrink-0 [&>svg]:size-full" aria-hidden="true"
                >{@html tab.icon}</span
              >
              {tab.label}
            </button>
          {:else}
            <div role="status" class="px-[8px] py-1 text-gray-800 dark:text-gray-400">
              No matching settings
            </div>
          {/each}
        </div>
      </nav>

      <div class="flex min-h-0 min-w-0 flex-1 flex-col p-[16px] md:px-[20px]">
        <div
          class="mb-[16px] flex shrink-0 flex-wrap items-center justify-between gap-x-[12px] gap-y-[8px]"
        >
          <h2
            id="settings-heading"
            class="text-[14px] leading-[20px] font-medium text-gray-900 dark:text-white"
          >
            {tabs.find((tab) => tab.id === settingsTab)?.label}
          </h2>
        </div>
        {#key settingsTab}
          <section
            aria-labelledby="settings-heading"
            class="min-h-0 flex-1 overflow-y-auto pr-[6px]"
          >
            {#if settingsTab === 'general'}
              <General />
            {:else if settingsTab === 'terminal'}
              <OpenTerminal />
            {:else}
              <About />
            {/if}
          </section>
        {/key}
      </div>
    </div>
  </div>
</dialog>

<style>
  dialog::backdrop {
    background: rgb(0 0 0 / 0.6);
    backdrop-filter: blur(4px);
  }
</style>
