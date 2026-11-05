import { mount } from 'svelte'
import './app.css'
import { initI18n } from './lib/i18n'
import Spotlight from './components/Spotlight.svelte'

void initI18n().then(() => mount(Spotlight, { target: document.getElementById('app')! }))
