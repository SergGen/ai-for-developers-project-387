// @vitest-environment jsdom

import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { expect, test } from 'vitest'
import App from './App.tsx'

function renderPage(path: string, verify: (page: HTMLElement) => void) {
  window.history.replaceState(null, '', path)
  const container = document.createElement('div')
  const root = createRoot(container)

  try {
    flushSync(() => root.render(<App />))
    verify(container)
  } finally {
    root.unmount()
    window.history.replaceState(null, '', '/')
  }
}

test('the home page explains how to book and links to the catalog', () => {
  renderPage('/', (page) => {
    expect(page.querySelector('h1')?.textContent).toBe('Запись на звонок')
    expect(page.textContent).toContain('Выберите удобное время для звонка')
    expect(Array.from(page.querySelectorAll('ol li'), (step) => step.textContent)).toEqual([
      'Выберите тип встречи',
      'Выберите свободное время',
      'Подтвердите запись',
    ])
    const link = Array.from(page.querySelectorAll('a')).find((item) => item.textContent === 'Записаться')
    expect(link?.getAttribute('href')).toBe('/book')
  })
})

test('the booking address opens the meeting type catalog', () => {
  renderPage('/book', (page) => {
    expect(page.querySelector('h1')?.textContent).toBe('Каталог типов встреч')
  })
})
