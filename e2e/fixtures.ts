import { test as base } from '@playwright/test'
import { createServer } from 'vite'
import type { AppOptions } from '../server/app.ts'
import { withTestServer } from '../server/test-server.ts'

export const test = base.extend<{ appOptions: AppOptions }>({
  appOptions: [{}, { option: true }],
  baseURL: async ({ appOptions }, provide, testInfo) => {
    await withTestServer(appOptions, async (api) => {
      const frontend = await createServer({
        cacheDir: testInfo.outputPath('vite-cache'),
        server: {
          host: '127.0.0.1',
          port: 0,
          proxy: { '/api': api, '/health': api },
        },
      })

      try {
        await frontend.listen()
        const frontendUrl = frontend.resolvedUrls?.local[0]
        if (!frontendUrl) throw new Error('Vite did not start a local web server')

        await provide(frontendUrl)
      } finally {
        await frontend.close()
      }
    })
  },
})

export { expect } from '@playwright/test'
