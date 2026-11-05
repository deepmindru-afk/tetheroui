import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: 'src/preload/index.ts',
          guest: 'src/preload/guest.ts',
          spotlight: 'src/preload/spotlight.ts'
        }
      }
    }
  },
  renderer: {
    build: {
      rollupOptions: {
        input: { index: 'src/renderer/index.html', spotlight: 'src/renderer/spotlight.html' }
      }
    },
    plugins: [tailwindcss(), svelte()]
  }
})
