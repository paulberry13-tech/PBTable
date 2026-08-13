import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Fixed dev port so the in-app browser preview can always find it.
export default defineConfig({
  server: { port: 5173, strictPort: true },
  plugins: [react()],
})
