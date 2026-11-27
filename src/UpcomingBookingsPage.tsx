import { useEffect, useState } from 'react'
import { listUpcomingBookings } from '../generated/sdk/sdk.gen.ts'
import type { ConfirmedBooking } from '../generated/sdk/types.gen.ts'
import { formatBookingDate, formatSlotTime } from './bookingTime.ts'

type UpcomingBookings =
  | { status: 'loading' | 'failed' }
  | { status: 'loaded'; bookings: ConfirmedBooking[] }

export function UpcomingBookingsPage() {
  const [result, setResult] = useState<UpcomingBookings>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    void listUpcomingBookings({ signal: controller.signal, throwOnError: true })
      .then(({ data }) => {
        if (!controller.signal.aborted) setResult({ status: 'loaded', bookings: data })
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ status: 'failed' })
      })

    return () => controller.abort()
  }, [])

  return (
    <main className="page">
      <title>Предстоящие встречи — Календарь звонков</title>
      <header className="intro">
        <h1>Предстоящие встречи</h1>
        <nav className="page-links" aria-label="Разделы календаря">
          <a href="/admin">Админка</a>
        </nav>
      </header>

      {result.status === 'loading' && <p role="status">Загружаем встречи…</p>}
      {result.status === 'failed' && <p role="alert">Не удалось загрузить встречи. Обновите страницу.</p>}
      {result.status === 'loaded' && result.bookings.length === 0 && (
        <p>Предстоящих встреч пока нет.</p>
      )}
      {result.status === 'loaded' && result.bookings.length > 0 && (
        <ol className="upcoming-bookings" role="list">
          {result.bookings.map((booking) => (
            <li key={booking.startsAt}>
              <h2>{booking.guestName}</h2>
              <p>{booking.eventType.title}</p>
              {booking.topic && <p>Тема: {booking.topic}</p>}
              <p>
                <time dateTime={booking.startsAt}>{formatBookingDate(booking.startsAt)}</time>
                {' · '}{formatSlotTime(booking)} по Москве
              </p>
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}
