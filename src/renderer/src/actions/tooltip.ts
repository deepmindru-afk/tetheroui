import tippy, { type Instance, type Props } from 'tippy.js'
import type { ActionReturn } from 'svelte/action'
import 'tippy.js/dist/tippy.css'

let active: Instance | null = null

function sync(instance: Instance): void {
  if (!instance.state.isVisible) return
  active = instance
  const box = instance.popper.querySelector('.tippy-box')!
  const { x, y, width, height } = box.getBoundingClientRect()
  void window.api
    .setTooltip({ text: box.textContent ?? '', x, y, width, height })
    .catch(console.warn)
}

function hide(instance: Instance): void {
  if (active !== instance) return
  active = null
  void window.api.setTooltip(null).catch(console.warn)
}

export function tooltip(
  node: HTMLElement,
  content: string | Partial<Props>
): ActionReturn<string | Partial<Props>> {
  const options: Partial<Props> = {
    placement: 'top',
    theme: 'dark',
    arrow: false,
    offset: [0, 4],
    onMount: sync,
    onAfterUpdate: (instance) => {
      if (active === instance) requestAnimationFrame(() => sync(instance))
    },
    onHide: hide,
    onDestroy: hide,
    ...(typeof content === 'string' ? { content } : content)
  }

  const instance = tippy(node, options)

  return {
    update(newContent: string | Partial<Props>) {
      const newOptions: Partial<Props> =
        typeof newContent === 'string' ? { content: newContent } : newContent
      instance.setProps(newOptions)
    },
    destroy() {
      instance.destroy()
    }
  }
}
