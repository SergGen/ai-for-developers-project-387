import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  input: './generated/openapi.json',
  output: {
    path: 'generated/sdk',
    module: { extension: '.ts' },
  },
  plugins: ['@hey-api/typescript', '@hey-api/client-fetch', '@hey-api/sdk', 'fastify'],
})
