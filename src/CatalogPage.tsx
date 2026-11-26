import { useEffect, useState } from 'react'
import { listEventTypes } from '../generated/sdk/sdk.gen.ts'
import type { EventType } from '../generated/sdk/types.gen.ts'

type CatalogResult =
  | { status: 'loading' }
  | { status: 'loaded'; eventTypes: EventType[] }
  | { status: 'failed' }

export function CatalogPage() {
  const [result, setResult] = useState<CatalogResult>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    void listEventTypes({ signal: controller.signal, throwOnError: true })
      .then(({ data }) => {
        if (!controller.signal.aborted) setResult({ status: 'loaded', eventTypes: data })
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ status: 'failed' })
      })

    return () => controller.abort()
  }, [])

  return (
    <main className="page">
      <title>Каталог типов встреч — Календарь звонков</title>
      <header className="intro">
        <h1>Каталог типов встреч</h1>
      </header>

      {result.status === 'loading' && <p role="status">Загружаем типы встреч…</p>}
      {result.status === 'failed' && <p role="alert">Не удалось загрузить каталог. Обновите страницу.</p>}
      {result.status === 'loaded' && result.eventTypes.length === 0 && (
        <p>Здесь появятся типы встреч, доступные для записи.</p>
      )}
      {result.status === 'loaded' && result.eventTypes.length > 0 && (
        <ul className="catalog">
          {result.eventTypes.map(({ id, title, description, durationMinutes }) => (
            <li key={id}>
              <h2><a href={`/book/${encodeURIComponent(id)}`}>{title}</a></h2>
              <p>{description}</p>
              <p>{durationMinutes} мин.</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
