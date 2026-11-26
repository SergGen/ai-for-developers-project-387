import { createApp } from './app.ts'
import type { AppOptions } from './app.ts'

export async function withTestServer(options: AppOptions, run: (address: string) => Promise<void>) {
  const app = createApp(options)

  try {
    const address = await app.listen({ host: '127.0.0.1', port: 0 })
    await run(address)
  } finally {
    await app.close()
  }
}
