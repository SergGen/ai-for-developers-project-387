import { fileURLToPath } from 'node:url'
import { createApp } from './app.ts'

const production = process.env.NODE_ENV === 'production'
const frontendDirectory = production ? fileURLToPath(new URL('../dist/', import.meta.url)) : undefined
const port = Number(process.env.PORT ?? 3000)

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer from 1 to 65535')
}

const app = createApp({ frontendDirectory })
const address = await app.listen({ host: production ? '0.0.0.0' : '127.0.0.1', port })

console.log(`Server listening at ${address}`)
