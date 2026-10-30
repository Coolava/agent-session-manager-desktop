import {defineConfig} from 'vite'
import {svelte} from '@sveltejs/vite-plugin-svelte'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [svelte()],
  build: mode === 'desktop' ? {
    outDir: '../desktop/assets',
    emptyOutDir: true,
    rollupOptions: { input: 'desktop.html' },
  } : undefined,
}))
