<script lang="ts">
  /* eslint-disable svelte/no-at-html-tags -- Icons are static SVG imports from Iconoir. */
  import { onMount } from 'svelte'
  import { Terminal, type ITheme } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import '@xterm/xterm/css/xterm.css'
  import CopyIcon from 'iconoir/icons/copy.svg?raw'
  import CheckIcon from 'iconoir/icons/check.svg?raw'

  import type { TerminalTarget } from '../../../shared/terminal'

  let { target, readonly = true }: { target: TerminalTarget; readonly?: boolean } = $props()
  let container: HTMLDivElement
  let terminal: Terminal | undefined
  let copied = $state(false)
  let error = $state('')
  let copyTimer: ReturnType<typeof setTimeout>

  async function copy(): Promise<void> {
    if (!terminal) return
    const buffer = terminal.buffer.active
    const lines: string[] = []
    for (let i = 0; i < buffer.length; i++)
      lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
    try {
      await navigator.clipboard.writeText(lines.join('\n').trimEnd())
      copied = true
      clearTimeout(copyTimer)
      copyTimer = setTimeout(() => (copied = false), 1500)
    } catch {
      error = 'Could not copy terminal output.'
    }
  }

  onMount(() => {
    const theme = (): ITheme => {
      const style = getComputedStyle(container)
      return {
        background: style.backgroundColor,
        foreground: style.color,
        selectionBackground: style.getPropertyValue('--terminal-selection').trim()
      }
    }
    const term = new Terminal({
      disableStdin: readonly,
      cursorBlink: !readonly,
      cursorStyle: 'bar',
      cursorInactiveStyle: 'none',
      fontSize: 11,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
      lineHeight: 1,
      scrollback: 10000,
      convertEol: readonly,
      theme: theme()
    })
    terminal = term
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    let attachment: number | undefined
    const fitTerminal = (): void => {
      if (!container.clientWidth || !container.clientHeight) return
      fit.fit()
      if (attachment !== undefined) window.api.resizeTerminal(attachment, term.cols, term.rows)
    }
    const resize = new ResizeObserver(fitTerminal)
    resize.observe(container)
    const colors = new MutationObserver(() => {
      term.options.theme = theme()
    })
    colors.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    attachment = window.api.connectTerminal(target, (message, consumed) => {
      if (message.type === 'reset') term.write('\x1bc', fitTerminal)
      else term.write(message.data, consumed)
    })
    const input = term.onData((data) => {
      if (!readonly && attachment !== undefined) window.api.writeTerminal(attachment, data)
    })
    fitTerminal()
    if (!readonly) term.focus()
    return () => {
      if (attachment !== undefined) window.api.disconnectTerminal(attachment)
      attachment = undefined
      input.dispose()
      clearTimeout(copyTimer)
      resize.disconnect()
      colors.disconnect()
      terminal = undefined
      term.dispose()
    }
  })
</script>

<div class="terminal-viewer" bind:this={container}></div>
{#if error}<div class="terminal-error" role="status">{error}</div>{/if}
<button
  class="copy-output"
  aria-label="Copy terminal output"
  title={copied ? 'Copied' : 'Copy terminal output'}
  onclick={copy}
>
  <span aria-hidden="true" class="inline-flex size-[12px] [&>svg]:size-full"
    >{@html copied ? CheckIcon : CopyIcon}</span
  >
</button>

<style>
  .terminal-viewer {
    --terminal-selection: #00000020;
    position: absolute;
    inset: 0;
    background: #fff;
    color: #37373a;
  }
  :global(.dark) .terminal-viewer {
    --terminal-selection: #ffffff30;
    background: #000;
    color: #ceced0;
  }
  .terminal-viewer :global(.xterm) {
    padding: 4px 0 4px 8px;
  }
  .copy-output {
    position: absolute;
    top: 2px;
    right: 14px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--bar-muted);
  }
  .copy-output:hover {
    color: var(--bar-foreground);
  }
  .terminal-error {
    position: absolute;
    bottom: 0;
    padding: 2px 8px;
    background: var(--bar-background);
    color: var(--text-danger);
    font-size: 11px;
  }
</style>
