import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // If serving from a subdirectory on Vercel, leave base as '/'
  // If embedding via iframe from a custom domain, also leave as '/'
  base: '/',
})
