# Секретная сортировка

Основа HTML5-игры на Vite + TypeScript. Стартовый экран и экран-заготовка работают на ПК и смартфонах: мышь, касание и клавиатура. Игровые правила, сортировка, очки, таймер и условия победы пока не определены. Декоративные фигуры на стартовом экране не являются игровыми объектами.

## Запуск

Нужен Node.js 24 (от 24.13) и npm.

```sh
npm ci
npm run dev
```

Адрес разработки: `http://127.0.0.1:5173/secret-sort-dev/`.

```sh
npm run build
npm run preview
```

Сборка включает строгую проверку TypeScript. Результат — `dist/`; предпросмотр — `http://127.0.0.1:4173/secret-sort-dev/`.

## Архитектура

```text
src/
  main.ts                       # связывает состояние, генератор и UI
  game/
    types.ts                    # контракты состояния, действий и генератора
    game.ts                     # чистые переходы состояния без DOM
  generator/
    level-generator.ts          # точка расширения для генерации уровней
  ui/
    app.ts                      # HTML-экраны и события ввода
    styles.css                  # адаптивная компоновка и оформление
```

`main.ts` передаёт действия UI в `transition`, затем отображает новое состояние. Генератор передаётся в логику как зависимость. Сейчас `generateLevel()` возвращает только `{ status: 'awaiting-rules' }`. После согласования механики расширяются доменные контракты, логика и генератор; UI получает готовое состояние.

Интерфейс использует семантический HTML, нативные кнопки, видимый фокус, перенос фокуса между экранами, CSS media queries, safe-area отступы и `prefers-reduced-motion`. Ориентация экрана и масштабирование браузера не ограничены.

## GitHub Pages

Сайт: <https://artem917.github.io/secret-sort-dev/>.

В `vite.config.ts` задан `base: '/secret-sort-dev/'`. Workflow `.github/workflows/deploy.yml` автоматически выполняет `npm ci`, проверку TypeScript и production-сборку после каждого push в `main`, затем публикует `dist` в GitHub Pages. Также доступен ручной `workflow_dispatch`.

Источник публикации в Settings → Pages должен быть **GitHub Actions**. Публикация выполняется стандартным `GITHUB_TOKEN` с `pages: write` и `id-token: write` только для deployment job; дополнительные секреты не нужны.

Официальная инструкция: [Vite — GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages).

Реклама, SDK Яндекс Игр и публикация в каталоге Яндекс Игр не подключены.
