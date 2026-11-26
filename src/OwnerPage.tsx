import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { createEventType } from '../generated/sdk/sdk.gen.ts'

type SaveResult =
  | { status: 'idle' | 'saving' }
  | { status: 'failed'; message: string }
  | { status: 'saved'; title: string }

export function OwnerPage() {
  const [result, setResult] = useState<SaveResult>({ status: 'idle' })
  const saving = result.status === 'saving'

  async function saveEventType(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    const form = event.currentTarget
    const fields = new FormData(form)
    const title = String(fields.get('title'))
    const description = String(fields.get('description'))
    if (!title.trim()) {
      setResult({ status: 'failed', message: 'Введите название типа встречи.' })
      return
    }
    if (!description.trim()) {
      setResult({ status: 'failed', message: 'Введите описание типа встречи.' })
      return
    }

    setResult({ status: 'saving' })

    try {
      const { data } = await createEventType({
        body: {
          title,
          description,
          durationMinutes: Number(fields.get('durationMinutes')),
        },
        throwOnError: true,
      })
      form.reset()
      setResult({ status: 'saved', title: data.title })
    } catch {
      setResult({ status: 'failed', message: 'Не удалось сохранить тип встречи. Попробуйте ещё раз.' })
    }
  }

  return (
    <main className="page">
      <title>Админка — Календарь звонков</title>
      <header className="intro">
        <h1>Админка</h1>
        <nav className="page-links" aria-label="Разделы календаря">
          <a href="/admin/upcoming">Предстоящие встречи</a>
          <a href="/book">Каталог типов встреч</a>
        </nav>
      </header>

      <section className="booking-guide" aria-labelledby="event-type-form-title">
        <h2 id="event-type-form-title">Создать тип встречи</h2>
        <form className="event-type-form" onSubmit={saveEventType}>
          <fieldset disabled={saving}>
            <label>
              Название
              <input name="title" required />
            </label>
            <label>
              Описание
              <textarea name="description" rows={3} required />
            </label>
            <label>
              Длительность в минутах
              <input name="durationMinutes" type="number" min={1} max={540} step={1} required />
            </label>
            <button className="booking-link" type="submit">
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </fieldset>
          <p role="status">
            {result.status === 'saved' && `Тип встречи «${result.title}» сохранён.`}
          </p>
          {result.status === 'failed' && (
            <p role="alert">{result.message}</p>
          )}
        </form>
      </section>
    </main>
  )
}
