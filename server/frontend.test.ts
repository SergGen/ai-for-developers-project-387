import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { createApp } from './app.ts'

test('serves frontend routes and assets alongside the API', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'booking-frontend-'))
  const app = createApp({ frontendDirectory: directory })

  try {
    await writeFile(join(directory, 'index.html'), '<!doctype html><title>Календарь</title>')
    await writeFile(join(directory, 'test.js'), 'export {}')

    for (const path of ['/', '/book/', '/book/intro', '/admin', '/admin/upcoming/']) {
      const page = await app.inject(path)
      expect(page.statusCode).toBe(200)
      expect(page.body).toContain('<title>Календарь</title>')
    }

    expect((await app.inject('/test.js')).body).toBe('export {}')
    expect((await app.inject('/missing.js')).statusCode).toBe(404)
    expect((await app.inject('/api/event-types')).json()).toEqual([])
    expect((await app.inject('/api/missing')).statusCode).toBe(404)
  } finally {
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
