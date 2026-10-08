import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { SERVER_ONLY_FILES, SERVER_ONLY_PACKAGES } from './scripts/quality/server-only'

const config = defineConfig({
  plugins: [
    devtools(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart({
      // The production build fails when client code imports a server-only
      // module; dev serves a mock instead. Lists: scripts/quality/server-only.ts.
      importProtection: {
        client: {
          specifiers: SERVER_ONLY_PACKAGES,
          files: ['**/*.server.*', ...SERVER_ONLY_FILES.map((file) => `**/${file}`)],
        },
      },
    }),
    // Must follow tanstackStart(). Nitro builds the server output Vercel serves.
    nitro(),
    viteReact({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
})

export default config
