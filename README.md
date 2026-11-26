# Календарь звонков (продолжение)


[![hexlet-check](https://github.com/SergGen/ai-for-developers-project-387/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/SergGen/ai-for-developers-project-387/actions)
[![CI](https://github.com/SergGen/ai-for-developers-project-387/actions/workflows/ci.yml/badge.svg)](https://github.com/SergGen/ai-for-developers-project-387/actions/workflows/ci.yml)

Интегрируйте работу агентов в GitHub вокруг сервиса бронирования звонков.

Учебный проект Хекслета: https://ru.hexlet.io/programs/ai-for-developers
Как это должно работать: https://files.hexlet.app/a/2ipc5m

## Исходное решение

Приложение перенесено из проекта 386 (коммит [`6dd6e0a`](https://github.com/SergGen/ai-for-developers-project-386/commit/6dd6e0a683ca03623127c8695989cc053569ff6e)).

- [Спецификация сервиса записи на звонок](https://github.com/SergGen/ai-for-developers-project-386/issues/6)
- [Карта решений для спецификации бронирования](https://github.com/SergGen/ai-for-developers-project-386/issues/1)
- [Исходное решение об отдельной странице каталога](https://github.com/SergGen/ai-for-developers-project-386/blob/6dd6e0a683ca03623127c8695989cc053569ff6e/docs/adr/0001-booking-entry-point.md)

## Стек

- Фронтенд — React, TypeScript и Vite.
- Бекенд — Fastify и TypeScript.
- Проверки — Oxlint, TypeScript и Vitest.

## Установка

Установите [mise](https://mise.jdx.dev/getting-started.html). Из корня репозитория выполните:

```bash
git clone https://github.com/SergGen/ai-for-developers-project-387.git
cd ai-for-developers-project-387
mise trust
mise install
mise run setup
mise exec -- npx playwright install chromium
```

## Использование

Запустите `mise run backend` и `mise run frontend` в отдельных терминалах. Откройте адрес, который выведет Vite, обычно `http://localhost:5173`. Запрос к `http://127.0.0.1:3000/health` вернёт HTTP 200 и `{"status":"ok"}`. Vite проксирует `/health` и `/api` на Fastify.

Типы встреч и записи хранятся в памяти процесса и сбрасываются при перезапуске сервера.

### Запуск в Docker

```bash
docker build -t call-calendar .
docker run --rm -e PORT=8080 -p 127.0.0.1:8080:8080 call-calendar
```

Откройте `http://localhost:8080`. Интерфейс и API работают на одном адресе. `GET /health` возвращает `200`, когда приложение готово. Если `PORT` не задан, сервер использует `3000`. Сервису достаточно одного экземпляра с хранением в памяти.

### Деплой на Render

[Открыть календарь звонков](https://ai-for-developers-project-386-3p1i.onrender.com)

Для бесплатного деплоя создайте в Render Dashboard веб-сервис из публичного GitHub-репозитория. Выберите Docker, тариф Free, корневой `Dockerfile` и `/health` для проверки готовности. Сервер использует `PORT`, заданный платформой. Первый запрос после простоя может отвечать медленнее. [Документация Docker на Render](https://render.com/docs/docker)

#### Подключение Render MCP

Создайте API-ключ в настройках Render и передайте его агенту в переменной окружения `RENDER_API_KEY`. Держите ключ вне репозитория. Запускайте агент из окружения, где переменная уже задана.

- **Codex.** Добавьте блок из [шаблона Codex](deploy/render/codex.config.toml.example) в проектный `.codex/config.toml`. Перезапустите сеанс Codex и проверьте сервер `render` командой `codex mcp list`.
- **OpenCode 2.** Добавьте `mcp.servers.render` из [шаблона OpenCode](deploy/render/opencode.jsonc.example) в проектный `opencode.jsonc`. Запустите `opencode mcp list`.

В каждом клиенте попросите агента показать список сервисов Render, чтобы проверить доступ. Для этой проверки достаточно права чтения веб-сервисов. [Документация Render MCP](https://render.com/docs/mcp-server)

### Сборка и проверки

| Команда | Назначение |
| --- | --- |
| `mise run build` | Проверить типы и собрать фронтенд в `dist/`. |
| `mise exec -- npm run generate` | Пересобрать OpenAPI из TypeSpec, Fetch SDK и типы обработчиков Fastify. Новые файлы появляются в `generated/`. |
| `mise run check` | Пересобрать API, запустить линтер, проверку типов, Vitest и браузерные тесты с настоящим API. Эту же команду выполняет GitHub Actions. |
| `mise exec -- npm run lint` | Запустить только Oxlint. |
| `mise exec -- npm test` | Запустить тесты Vitest. |

В параллельных тестах Playwright каждый экземпляр Vite получает отдельный `cacheDir` через `testInfo.outputPath('vite-cache')`. Общий кэш может вызвать ошибку `ENOTEMPTY` при одновременной записи зависимостей в CI. [Фикстура Playwright](e2e/fixtures.ts)

### OpenCode в GitHub Actions

Workflow OpenCode отвечает на вопросы по проекту в обсуждениях GitHub. Чтобы вызвать агента, начните новый комментарий с `/oc` или `/opencode`. Например, оставьте `/oc explain this issue` под задачей. Поддерживаются комментарии к задачам, pull request и строкам diff. Агент отвечает в том же обсуждении. Ход выполнения доступен в разделе Actions → OpenCode. [Файл workflow](.github/workflows/opencode.yml)

Workflow использует бесплатную модель `opencode/deepseek-v4.1-flash-free` для ответов и служебных запросов. Для настройки установите OpenCode GitHub App, создайте ключ в пространстве Personal в OpenCode Console и добавьте его как секрет репозитория `OPENCODE_API_KEY` в Settings → Secrets and variables → Actions. Бесплатная модель доступна ограниченное время. Если исчерпан дневной лимит, повторите запуск после его обновления. [OpenCode GitHub App](https://github.com/apps/opencode-agent) · [Настройка ключа](https://help.hexlet.io/ai/opencode#ключ-для-github-actions)

Запуск доступен людям с правом записи в репозиторий. Ручной вызов реагирует на создание комментария. Команды ботов и команды в PR из форков отсекаются до запуска модели. В PR из этого репозитория OpenCode работает с кодом из ветки PR. Для одного обсуждения одновременно выполняется один запуск агента. Тайм-аут — 10 минут.

Новое issue от автора с правом записи автоматически проходит предварительный разбор. OpenCode читает описание, сверяет его с приложением и оставляет ответ в issue. В автоматическом запуске инструменты модели ограничены чтением файлов и навыков. Автотриаж пропускает спецификации и готовые тикеты с меткой `ready-for-agent`. Правило назначения метки при создании описано в [настройках трекера](docs/agents/triage-labels.md). Ручной вызов и автотриаж используют общее ограничение параллельных запусков по номеру обсуждения.

Workflow устанавливает закреплённую версию OpenCode CLI и обновляет каталог моделей отдельным шагом. Ключ модели передаётся при вызове `opencode github run`.

### Сценарий записи на звонок

1. Владелец открывает раздел «Админка» и создаёт тип встречи «Встреча 15 минут» с описанием «Короткий звонок для знакомства» и длительностью 15 минут.
2. Гость нажимает «Записаться» на главной странице. В каталоге он видит название, описание и длительность каждого типа и выбирает «Встреча 15 минут».
3. Гость выбирает день в календаре на ближайшие 14 календарных дней. В списке слотов он видит свободные и занятые интервалы, выбирает свободный слот 09:45–10:00, вводит своё имя и нажимает «Подтвердить запись». Регистрация не нужна.
4. Владелец открывает общий список предстоящих встреч и видит там «Встреча 15 минут» на выбранную дату с 09:45 до 10:00.

Длительность слота совпадает с длительностью типа встречи. Запись на 09:45–10:00 блокирует любой пересекающийся интервал для всех типов встреч. Следующая встреча может начаться в 10:00, если время свободно. Если два гостя одновременно пытаются занять пересекающиеся интервалы, подтверждается только одна запись.

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.
