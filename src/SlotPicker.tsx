import type { Slot } from '../generated/sdk/types.gen.ts'
import { formatSlotTime, slotDate } from './bookingTime.ts'

const fullDate = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
})
const weekday = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'short' })
const shortDate = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })

interface SlotPickerProps {
  days: string[]
  slots: Slot[]
  day: string
  selectedSlot?: Slot
  disabled: boolean
  onDayChange: (day: string) => void
  onSlotChange: (slot: Slot) => void
}

export function SlotPicker({ days, slots, day, selectedSlot, disabled, onDayChange, onSlotChange }: SlotPickerProps) {
  const daySlots = slots.filter((slot) => slotDate(slot.startsAt) === day)

  return (
    <div className="slot-picker">
      <fieldset disabled={disabled}>
        <legend>День звонка</legend>
        <p className="slot-picker-note">Дата и время по Москве</p>
        <div className="day-choices">
          {days.map((choice) => {
            const date = new Date(`${choice}T00:00:00Z`)

            return (
              <label className="slot-option" key={choice}>
                <input
                  type="radio"
                  name="booking-day"
                  aria-label={fullDate.format(date)}
                  checked={day === choice}
                  onChange={() => onDayChange(choice)}
                />
                <span className="slot-option-card">
                  <small>{weekday.format(date)}</small>
                  {shortDate.format(date)}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>Время звонка</legend>
        {daySlots.length === 0 ? <p role="status">На этот день слотов нет.</p> : (
          <div className="time-choices">
            {daySlots.map((slot) => (
              <label className="slot-option" key={slot.startsAt}>
                <input
                  type="radio"
                  name="booking-slot"
                  checked={selectedSlot?.startsAt === slot.startsAt}
                  disabled={!slot.available}
                  onChange={() => onSlotChange(slot)}
                />
                <span className="slot-option-card">
                  {formatSlotTime(slot)}
                  {!slot.available && <small>Занято</small>}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  )
}
