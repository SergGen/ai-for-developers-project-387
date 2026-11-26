import { BookingPage } from './BookingPage.tsx'
import { CatalogPage } from './CatalogPage.tsx'
import { OwnerPage } from './OwnerPage.tsx'
import { UpcomingBookingsPage } from './UpcomingBookingsPage.tsx'
import './App.css'

function App() {
  if (window.location.pathname === '/admin/upcoming' || window.location.pathname === '/admin/upcoming/') {
    return <UpcomingBookingsPage />
  }

  if (window.location.pathname === '/admin' || window.location.pathname === '/admin/') {
    return <OwnerPage />
  }

  if (window.location.pathname === '/book' || window.location.pathname === '/book/') {
    return <CatalogPage />
  }

  const eventType = /^\/book\/([^/]+)\/?$/.exec(window.location.pathname)
  if (eventType) return <BookingPage eventTypePath={eventType[1]} />

  return (
    <main className="page">
      <title>Запись на звонок — Календарь звонков</title>
      <header className="intro">
        <h1>Запись на звонок</h1>
        <p>Выберите удобное время для звонка и запишитесь без регистрации.</p>
        <nav className="page-links" aria-label="Разделы календаря">
          <a href="/admin">Админка</a>
        </nav>
      </header>

      <section className="booking-guide" aria-labelledby="booking-guide-title">
        <h2 id="booking-guide-title">Как записаться</h2>
        <ol className="booking-steps">
          <li>Выберите тип встречи</li>
          <li>Выберите свободное время</li>
          <li>Подтвердите запись</li>
        </ol>
        <a className="booking-link" href="/book">Записаться</a>
      </section>
    </main>
  )
}

export default App
