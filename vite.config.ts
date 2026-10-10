import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

// Injects the Node server's random token into index.html (dev only).
// The server writes it to .ultron-token on start.
function ultronToken(): Plugin {
  return {
    name: 'ultron-token',
    apply: 'serve',
    transformIndexHtml(html) {
      let token = '';
      try { token = fs.readFileSync('.ultron-token', 'utf8').trim(); } catch { /* server not up yet */ }
      return html.replace('%ULTRON_TOKEN%', token);
    },
  };
}

export default defineConfig({
  plugins: [react(), ultronToken()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:7777',
      '/ws': { target: 'ws://127.0.0.1:7777', ws: true },
    },
  },
  clearScreen: false,
});
