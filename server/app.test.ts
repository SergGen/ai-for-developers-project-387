import { expect, test } from 'vitest'
import { withTestServer } from './test-server.ts'

test('the server starts and responds to GET /health', async () => {
  await withTestServer({}, async (address) => {
    const response = await fetch(`${address}/health`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })
})

test('GET /api/event-types returns an empty catalog on a fresh start', async () => {
  await withTestServer({}, async (address) => {
    const response = await fetch(`${address}/api/event-types`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([])
  })
})
