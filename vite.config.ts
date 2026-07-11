import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  server: {
    // Bind all interfaces (IPv4 + IPv6). Vite defaults to IPv6 `::1` only, but
    // Tailscale Funnel dials 127.0.0.1 (IPv4) → without this the tunnel 502s.
    host: true,
    // Vite rejects unknown Host headers by default; allow any *.ts.net so a
    // Tailscale Funnel (e.g. dragon.taild1fa8.ts.net) can reach the dev server.
    // Dev-only — has no effect on the built Worker.
    allowedHosts: ['.ts.net'],
  },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
