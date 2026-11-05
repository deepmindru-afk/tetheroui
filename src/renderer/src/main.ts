import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
import { initI18n } from './lib/i18n'

async function start(): Promise<void> {
  const config = await window.api.getConfig().catch(() => null)
  await initI18n(config?.language)
  mount(App, { target: document.getElementById('app')! })
}

void start()
