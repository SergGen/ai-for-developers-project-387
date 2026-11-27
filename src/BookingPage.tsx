import { useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import { createBooking, listSlots } from '../generated/sdk/sdk.gen.ts'
import type { ConfirmedBooking, Slot, SlotWindow } from '../generated/sdk/types.gen.ts'
import { formatBookingDate, formatSlotTime } from './bookingTime.ts'
import { SlotPicker } from './SlotPicker.tsx'
import './BookingPage.css'

const maxTopicLength = 200

type Availability =
  | { status: 'loading' }
  | { status: 'loaded'; window: SlotWindow }
  | { status: 'missing' }
  | { status: 'failed' }

type ReselectionReason = 'conflict' | 'expired'

type Submission =
  | { status: 'idle' | 'submitting' | 'failed' }
  | { status: 'refreshing' | 'refresh-failed' | 'refreshed'; reason: ReselectionReason }
  | { status: 'confirmed'; booking: ConfirmedBooking }

async function loadAvailability(eventTypePath: string, signal?: AbortSignal): Promise<Availability> {
  try {
    const { data, response } = await listSlots({
      path: { id: decodeURIComponent(eventTypePath) },
      signal,
    })
    if (data) return { status: 'loaded', window: data }

    return { status: response?.status === 404 ? 'missing' : 'failed' }
  } catch {
    return { status: 'failed' }
  }
}

export function BookingPage({ eventTypePath }: { eventTypePath: string }) {
  const [availability, setAvailability] = useState<Availability>({ status: 'loading' })
  const [selectedDay, setSelectedDay] = useState<string>()
  const [selectedSlot, setSelectedSlot] = useState<Slot>()
  const [guestName, setGuestName] = useState('')
  const [topic, setTopic] = useState('')
  const [submission, setSubmission] = useState<Submission>({ status: 'idle' })

  useEffect(() => {
    const controller = new AbortController()

    void loadAvailability(eventTypePath, controller.signal).then((nextAvailability) => {
      if (!controller.signal.aborted) setAvailability(nextAvailability)
    })
    return () => controller.abort()
  }, [eventTypePath])

  const slotWindow = availability.status === 'loaded' ? availability.window : undefined
  const eventType = slotWindow?.eventType
  const title = eventType?.title ?? 'Выбор слота'
  const busy = submission.status === 'submitting' || submission.status === 'refreshing'
  const reselectionReason = 'reason' in submission ? submission.reason : undefined
  const topicTooLong = [...topic.trim()].length > maxTopicLength
  const topicErrorId = 'topic-error'
  const hasSubmissionError =
    reselectionReason === 'conflict' ||
    reselectionReason === 'expired' ||
    submission.status === 'refresh-failed' ||
    submission.status === 'failed'
  const day = selectedDay && slotWindow?.days.includes(selectedDay) ? selectedDay : slotWindow?.days[0]

  function selectDay(day: string) {
    setSelectedDay(day)
    setSelectedSlot(undefined)
    setSubmission({ status: 'idle' })
  }

  function selectSlot(slot: Slot) {
    setSelectedSlot(slot)
    setSubmission({ status: 'idle' })
  }

  async function refreshSlots(reason: ReselectionReason) {
    setSubmission({ status: 'refreshing', reason })
    setSelectedSlot(undefined)
    const nextAvailability = await loadAvailability(eventTypePath)
    if (nextAvailability.status === 'loaded') {
      setAvailability(nextAvailability)
      setSubmission({ status: 'refreshed', reason })
    } else {
      setSubmission({ status: 'refresh-failed', reason })
    }
  }

  async function confirmBooking(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !eventType || !selectedSlot || !guestName.trim() || topicTooLong) return

    setSubmission({ status: 'submitting' })
    try {
      const { data, response } = await createBooking({
        body: { eventTypeId: eventType.id, startsAt: selectedSlot.startsAt, guestName, topic },
      })
      if (data) {
        setSubmission({ status: 'confirmed', booking: data })
      } else if (response?.status === 409) {
        await refreshSlots('conflict')
      } else if (response?.status === 400) {
        await refreshSlots('expired')
      } else {
        setSubmission({ status: 'failed' })
      }
    } catch {
      setSubmission({ status: 'failed' })
    }
  }

  async function retryAvailability() {
    setAvailability({ status: 'loading' })
    setAvailability(await loadAvailability(eventTypePath))
  }

  return (
    <main className="page">
      <title>{`${title} — Календарь звонков`}</title>
      <header className="intro">
        <a className="booking-back" href="/book">К каталогу встреч</a>
        <h1>{title}</h1>
        {eventType && <p>{eventType.description} · {eventType.durationMinutes} мин.</p>}
      </header>

      {availability.status === 'loading' && <p role="status">Загружаем слоты…</p>}
      {availability.status === 'missing' && <p role="alert">Тип встречи не найден.</p>}
      {availability.status === 'failed' && (
        <div className="booking-form">
          <p role="alert">Не удалось загрузить слоты.</p>
          <button className="booking-link" type="button" onClick={retryAvailability}>Повторить загрузку</button>
        </div>
      )}
      <div role="status">
        {submission.status === 'confirmed' && (
          <section className="booking-guide">
            <h2>Запись подтверждена</h2>
            <p>{formatBookingDate(submission.booking.startsAt)} · {formatSlotTime(submission.booking)} по Москве</p>
          </section>
        )}
      </div>
      {slotWindow && day && submission.status !== 'confirmed' && (
        <>
          <SlotPicker
            days={slotWindow.days}
            slots={slotWindow.slots}
            day={day}
            selectedSlot={selectedSlot}
            disabled={busy || submission.status === 'refresh-failed'}
            onDayChange={selectDay}
            onSlotChange={selectSlot}
          />
          <section className="booking-guide" aria-labelledby="confirm-booking-title">
            <h2 id="confirm-booking-title">Подтверждение записи</h2>
            <form className="booking-form" onSubmit={confirmBooking}>
              {selectedSlot && <p>{formatBookingDate(selectedSlot.startsAt)} · {formatSlotTime(selectedSlot)} по Москве</p>}
              <fieldset disabled={busy}>
                <label>
                  Ваше имя
                  <input name="guestName" autoComplete="name" value={guestName}
                    onChange={(event) => setGuestName(event.target.value)} required />
                </label>
                <label>
                  Тема встречи
                  <input name="topic" value={topic}
                    aria-invalid={topicTooLong || undefined}
                    aria-describedby={topicTooLong ? topicErrorId : undefined}
                    onChange={(event) => setTopic(event.target.value)} placeholder="Необязательно" />
                </label>
                <button className="booking-link" type="submit" disabled={!selectedSlot || !guestName.trim() || topicTooLong}>
                  {submission.status === 'submitting' ? 'Подтверждаем…' : 'Подтвердить запись'}
                </button>
              </fieldset>
              {topicTooLong && (
                <p id={topicErrorId} role="alert">Тема встречи не должна превышать {maxTopicLength} символов</p>
              )}
              {hasSubmissionError && (
                <p role="alert">
                  {reselectionReason === 'conflict' && 'Это время уже занято. Выберите другой слот'}
                  {reselectionReason === 'expired' && 'Выбранный слот больше недоступен. Выберите другое время.'}
                  {submission.status === 'refresh-failed' && ' Не удалось обновить слоты.'}
                  {submission.status === 'failed' && 'Не удалось подтвердить запись. Попробуйте ещё раз.'}
                </p>
              )}
              {submission.status === 'refresh-failed' && (
                <button className="booking-link" type="button" onClick={() => refreshSlots(submission.reason)}>
                  Повторить загрузку
                </button>
              )}
            </form>
          </section>
        </>
      )}
    </main>
  )
}
