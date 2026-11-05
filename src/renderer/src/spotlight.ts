import { mount } from 'svelte'
import './app.css'
import Spotlight from './components/Spotlight.svelte'

mount(Spotlight, { target: document.getElementById('app')! })
