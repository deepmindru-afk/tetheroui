import { clipboard, Menu, shell, type WebContents } from 'electron'

export function attachContextMenu(contents: WebContents): void {
  contents.on('context-menu', (_event, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = []

    // Spell-check suggestions (if any)
    if (params.misspelledWord && params.dictionarySuggestions?.length) {
      for (const suggestion of params.dictionarySuggestions) {
        menuItems.push({
          label: suggestion,
          click: () => contents.replaceMisspelling(suggestion)
        })
      }
      menuItems.push({ type: 'separator' })
    }

    // Link handling
    if (/^https?:\/\//i.test(params.linkURL)) {
      menuItems.push({
        label: 'Open Link in Browser',
        click: () => void shell.openExternal(params.linkURL).catch(() => {})
      })
      menuItems.push({
        label: 'Copy Link',
        click: () => void clipboard.writeText(params.linkURL).catch(() => {})
      })
      menuItems.push({ type: 'separator' })
    }

    // Editable field actions (input, textarea, contenteditable)
    if (params.isEditable) {
      menuItems.push(
        { label: 'Undo', role: 'undo', enabled: params.editFlags.canUndo },
        { label: 'Redo', role: 'redo', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { label: 'Cut', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
        { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
        { label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll }
      )
    } else if (params.selectionText) {
      // Non-editable text selection
      menuItems.push({ label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy })
    }

    if (params.mediaType === 'image') {
      if (menuItems.length > 0 && menuItems[menuItems.length - 1].type !== 'separator') {
        menuItems.push({ type: 'separator' })
      }
      menuItems.push(
        {
          label: 'Copy Image',
          enabled: params.hasImageContents,
          click: () => contents.copyImageAt(params.x, params.y)
        },
        {
          label: 'Save Image As…',
          enabled: !!params.srcURL,
          click: () => contents.downloadURL(params.srcURL)
        }
      )
    }

    if (menuItems.length > 0) {
      Menu.buildFromTemplate(menuItems).popup()
    }
  })
}
