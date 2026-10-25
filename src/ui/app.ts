import { columnAt, moveError, revealedCount, sameLocation, topRun } from '../game/game.ts';
import type { GameState, Location, ProofAction, Records, Selection, Settings, Tile } from '../game/types.ts';

export const KINDS = [
  ['Персик', 'peach'], ['Клубника', 'strawberry'], ['Фиолетовый зверёк', 'purple-creature'],
  ['Черника', 'blueberry'], ['Баклажан', 'eggplant'], ['Капуста', 'cabbage'],
  ['Драконий фрукт', 'dragon-fruit'], ['Томат', 'tomato'], ['Жёлтый зверёк', 'yellow-creature'],
] as const;
export type Modal = 'rules' | 'settings' | 'tutorial' | 'new' | 'restart' | 'pause' | 'records' | null;
export interface ViewModel {
  screen: 'menu' | 'game'; game: GameState | null; settings: Settings; records: Records;
  selection: Selection | null; hint: ProofAction | null; message: string; error: boolean;
  warning: string | null; modal: Modal; seedInput: string;
  tutorialStep: number; tutorialCount: number; tutorialKind: number; victoryDismissed: boolean; blocked: boolean;
  effect: { type: 'reveal' | 'move'; ids: number[] } | null;
}
export type UIEvent =
  | { type: 'command'; command: string; value?: string }
  | { type: 'cell'; location: Location; index: number }
  | { type: 'setting'; name: string; value: boolean | string };

const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const icon = (kind: number, className = ''): string => `<img class="tile-icon ${className}" src="${import.meta.env.BASE_URL}icons/${KINDS[kind]![1]}.svg" alt="" draggable="false" />`;
const button = (command: string, label: string, className = '', disabled = false): string => `<button type="button" class="button ${className}" data-command="${command}" data-focus-key="${command}" ${disabled ? 'disabled' : ''}>${label}</button>`;
const logo = (small = false): string => `<div class="logo ${small ? 'logo-small' : ''}" aria-label="Секретная сортировка"><span>Секретная</span><strong>сортировка</strong><i aria-hidden="true">${icon(0)}</i></div>`;

function menu(model: ViewModel): string {
  const continuing = model.game && !model.game.result;
  return `<main class="menu-screen">
    <section class="menu-card">
      <div class="edition">108 ФИШЕК · 9 СЕКРЕТОВ</div>${logo()}
      <div class="menu-tiles" aria-hidden="true">${[0, 8, 1, 5, 2].map((kind, i) => `<span style="--tilt:${i % 2 ? 9 : -8}deg">${icon(kind)}</span>`).join('')}</div>
      <h1 class="menu-subtitle">Раскрывай. Перекладывай.<br>Найди место каждому виду.</h1>
      <p class="menu-description">Спокойная головоломка со скрытыми фишками.<br>Никакой спешки — только ты и твоя раскладка.</p>
      ${button(continuing ? 'continue' : 'play', continuing ? '▶ Продолжить' : '▶ Играть', 'green main-play')}
      <p class="continue-note">${continuing ? `Seed: <b>${esc(model.game!.seed)}</b> · переносов: ${model.game!.transfers}` : 'Начни с простой учебной раскладки'}</p>
      <div class="menu-actions">${button('tutorial', 'Как играть', 'cream')}${button('new', 'Новая партия', 'cream')}${button('records', 'Мои рекорды', 'cream')}${button('settings', 'Настройки', 'cream')}</div>
      <div class="menu-bottom">10 колонок × 12 мест <span>·</span> Сохранение в этом браузере</div>
    </section>
  </main>`;
}

function tileButton(tile: Tile | null, location: Location, index: number, row: number, model: ViewModel): string {
  const state = model.game!;
  const source = model.selection;
  const selected = source && sameLocation(source.source, location) && index >= 0 && index < source.count;
  const actionable = location.zone === 'reserve' || index === 0 || (index >= 0 && index < topRun(state, location));
  const hintSource = model.hint?.type === 'reveal' ? location.zone === 'column' && location.index === model.hint.column && index === 0 : model.hint?.type === 'move' && sameLocation(model.hint.from, location) && index >= 0 && index < model.hint.count;
  const key = location.zone === 'reserve' ? `reserve-${location.index}` : tile ? `tile-${tile.id}` : `empty-${location.index}-${row}`;
  const label = location.zone === 'reserve' ? `Резерв ${location.index + 1}` : `Колонка ${location.index + 1}, ${index === 0 ? 'верхняя фишка' : `позиция ${row + 1}`}`;
  const detail = tile ? tile.open ? KINDS[tile.kind][0] : 'закрытая фишка' : 'пустое место';
  return `<button type="button" class="cell ${!tile ? 'vacant' : tile.open ? 'open' : 'closed'} ${selected ? 'selected' : ''} ${hintSource ? 'hint-source' : ''} ${actionable ? 'accessible' : ''}" data-zone="${location.zone}" data-place="${location.index}" data-index="${index}" data-row="${row}" data-focus-key="${key}" ${tile ? `data-tile-id="${tile.id}"` : ''} aria-label="${label}: ${detail}${selected ? `, выбрано ${source!.count}` : ''}" aria-pressed="${!!selected}" tabindex="${location.zone === 'reserve' || (location.index === 0 && index === 0) ? 0 : -1}">${tile ? tile.open ? icon(tile.kind) : '<span class="question" aria-hidden="true">?</span>' : location.zone === 'reserve' ? `<span class="reserve-number" aria-hidden="true">${location.index + 1}</span>` : ''}</button>`;
}

function board(model: ViewModel): string {
  const state = model.game!;
  return `<div class="board-scroll" aria-label="Игровое поле, 10 колонок. Стрелки — навигация, Enter — действие">
    <div class="board" role="group" aria-label="10 колонок по 12 мест">${state.columns.map((col, index) => {
      const location = columnAt(index);
      const canReceive = model.selection && !moveError(state, { type: 'move', from: model.selection.source, to: location, count: model.selection.count });
      const hintTarget = model.hint?.type === 'move' && sameLocation(model.hint.to, location);
      return `<div class="column ${canReceive ? 'can-receive' : ''} ${hintTarget ? 'hint-target' : ''}" data-column="${index}" role="group" aria-label="Колонка ${index + 1}, фишек ${col.length} из 12">
        <button class="column-heading" type="button" data-zone="column" data-place="${index}" data-index="-1" data-row="-1" data-focus-key="column-${index}" aria-label="Колонка ${index + 1}, цель переноса">${index + 1}<small>${col.length}/12</small></button>
        ${Array.from({ length: 12 }, (_, row) => { const tileIndex = row - (12 - col.length); return tileButton(col[tileIndex] ?? null, location, tileIndex, row, model); }).join('')}
      </div>`;
    }).join('')}</div>
  </div>`;
}

function reserve(model: ViewModel): string {
  const state = model.game!;
  return `<aside class="reserve-panel" aria-label="Отдельное временное хранилище"><div class="reserve-title">Резерв <span>${state.reserve.filter(Boolean).length}/${state.reserve.length}</span></div>
    ${state.reserve.length ? `<div class="reserve-slots">${state.reserve.map((tile, index) => tileButton(tile, { zone: 'reserve', index }, 0, 0, model)).join('')}</div><p>По одной<br>открытой фишке</p>` : '<p class="reserve-off">Режим<br>без резерва</p>'}
  </aside>`;
}

function game(model: ViewModel): string {
  const state = model.game!;
  return `<main class="game-screen">
    <header class="game-header">${logo(true)}<div class="statistics"><div><b data-stat="transfers">${state.transfers}</b><span>переносов</span></div><div><b data-stat="revealed">${revealedCount(state)}<small>/108</small></b><span>раскрыто</span></div><div><b>${state.undos}</b><span>отмен</span></div><div><b>${state.hints}</b><span>подсказок</span></div></div>${button('settings', '⚙<span class="sr-only">Настройки</span>', 'icon-button cream')}</header>
    <div class="game-layout"><aside class="game-notes panel"><div class="eyebrow">ТВОЯ ПАРТИЯ</div><h1>Собери все<br>девять видов</h1><p>Собери 9 колонок по 12 одинаковых фишек. Одна колонка останется пустой.</p><div class="seed-display">Seed <strong>${esc(state.seed)}</strong></div><p class="small-text">Начало: все фишки скрыты.<br>Решение существует.<br>Время не ограничено.</p>${button('rules', 'Правила и управление', 'cream')}${button('pause', 'Ⅱ Пауза', 'cream')}</aside>
    <section class="play-area" aria-label="Партия">
      <div class="board-topline"><span class="seed-mobile">Seed: <b>${esc(state.seed)}</b></span><span class="selection-status">${model.selection ? `Выбрано: <b>${model.selection.count}</b> ${button('cancel', 'Снять выбор', 'text-button')}` : 'Нажми на верхний «?»'}</span><span class="scroll-note">Поле ↔ ↕</span></div>
      <div class="column-jumps" aria-label="Перейти к колонке">${state.columns.map((_, i) => `<button type="button" data-jump="${i}" aria-label="Перейти к колонке ${i + 1}">${i + 1}</button>`).join('')}</div>
      <div class="play-surface">${board(model)}${reserve(model)}</div>
      <div class="message ${model.error ? 'error-message' : ''}" role="${model.error ? 'alert' : 'status'}" aria-live="polite">${esc(model.message)}</div>
      <nav class="game-controls" aria-label="Действия партии">${button('undo', '↶ <span>Отмена хода</span>', 'coral', !state.history.length || !!state.result)}${button('hint', '☀ <span>Подсказка<small>бесплатно</small></span>', 'gold', !!state.result)}${button('new', '✦ <span>Новая партия</span>', 'green')}${button('menu', '⌂ <span>В меню</span>', 'blue')}${button('pause', 'Ⅱ <span>Пауза</span>', 'cream mobile-pause')}</nav>
    </section></div>
  </main>`;
}

function rules(): string {
  return `<h2 id="dialog-title">Как играть</h2><ol class="rules-list"><li><b>Раскрывай по одной.</b> Нажми только на верхнюю закрытую фишку. Раскрытие ничего не переносит.</li><li><b>Выбирай размер пачки.</b> Клик по 1-й открытой фишке выбирает одну, по 5-й одинаковой подряд — верхние пять. Повторный клик снимает выбор.</li><li><b>Выбери цель.</b> Пустая колонка или такой же открытый вид. Вместимость — 12. На «?» и другой вид переносить нельзя.</li><li><b>Используй резерв.</b> В каждое место помещается одна открытая фишка. Возврат — по обычным правилам.</li><li><b>Победа:</b> девять открытых колонок по 12 одинаковых фишек, десятая и резерв пусты.</li></ol><p>Стрелки перемещают фокус по полю, Enter/пробел нажимают фишку. Esc — снять выбор/закрыть окно. U или Ctrl+Z — отмена, H — возможный ход.</p><p class="small-text">Отмена возвращает последнее раскрытие или перенос. Храним 80 действий. Счётчики переносов, отмен и подсказок накопительные; отмена не обнуляет стоимость. После победы: max(0, 10000 − 30×переносы − 250×отмены − 500×подсказки).</p>${button('tutorial', 'Пройти мини-тренировку', 'green')}`;
}

function tutorial(model: ViewModel): string {
  const step = model.tutorialStep;
  const title = ['Открой секрет', 'Выбери ровно пять', 'Переложи пачку', 'Всё готово!'][step]!;
  const subtitle = ['Нажми на верхнюю закрытую фишку. Она только раскроется.', 'Каждая фишка задаёт размер: первая — одна, пятая — пять. Нажми пятую.', 'Пять выбраны. Нажми на пустую колонку справа.', 'В партии используй резерв по одной фишке и освобождай новые «?».'][step]!;
  return `<div class="eyebrow">МИНИ-ТРЕНИРОВКА · ${Math.min(step + 1, 3)}/3</div><h2 id="dialog-title">${title}</h2><p>${subtitle}</p><div class="tutorial-area">${step === 0 ? `<button class="cell closed tutorial-reveal" data-command="tutorial-reveal" type="button" aria-label="Раскрыть учебную фишку"><span class="question">?</span></button>` : step < 3 ? `<div class="tutorial-stack" aria-label="Учебная пачка из пяти"><span>Источник</span>${Array.from({ length: 5 }, (_, i) => `<button class="cell open ${i < model.tutorialCount ? 'selected' : ''}" type="button" data-command="tutorial-select" data-value="${i + 1}" aria-label="Выбрать ${i + 1} учебных фишек">${icon(model.tutorialKind)}</button>`).join('')}</div><div class="tutorial-target"><span>Цель</span><button class="cell vacant ${step === 2 ? 'hint-target' : ''}" type="button" data-command="tutorial-transfer" aria-label="Перенести учебную пачку в пустую колонку">${step === 2 ? '↓' : ''}</button></div>` : `<div class="tutorial-complete">${[0, 1, 8].map(kind => icon(kind)).join('')}<strong>Теперь твой ход</strong></div>`}</div>${step === 1 ? `<p>Выбрано: <b>${model.tutorialCount}</b></p>` : ''}<div class="dialog-actions">${button('tutorial-finish', step === 3 ? (model.screen === 'game' ? 'К моей партии' : 'Играть') : 'Пропустить', step === 3 ? 'green' : 'cream')}</div>`;
}

function modalContent(model: ViewModel): string {
  switch (model.modal) {
    case 'rules': return rules();
    case 'tutorial': return tutorial(model);
    case 'settings': return `<h2 id="dialog-title">Настройки</h2><label class="setting"><span>Звуки<small>Короткие звуки действий</small></span><input data-setting="sound" type="checkbox" ${model.settings.sound ? 'checked' : ''} data-focus-key="sound" /></label><label class="setting"><span>Анимации<small>Учитывается reduced-motion системы</small></span><input data-setting="animations" type="checkbox" ${model.settings.animations ? 'checked' : ''} data-focus-key="animations" /></label><label class="setting"><span>Резерв в новой партии</span><select data-setting="reserveCapacity" data-focus-key="reserveCapacity"><option value="4" ${model.settings.reserveCapacity === 4 ? 'selected' : ''}>4 места</option><option value="0" ${model.settings.reserveCapacity === 0 ? 'selected' : ''}>Без резерва</option></select></label><p class="small-text">Ёмкость резерва — правило нашей версии. Изменение действует на новые партии. Музыки и рекламы нет.</p>${button('close', 'Готово', 'green')}`;
    case 'new': return `<h2 id="dialog-title">Новая партия</h2><p>Каждый seed задаёт одну и ту же проверенную раскладку.${model.game && !model.game.result ? ' Текущая партия будет заменена.' : ''}</p><form data-form="new-seed"><label class="seed-label" for="seed">Seed раскладки</label><input id="seed" name="seed" class="seed-input" maxlength="64" required value="${esc(model.seedInput)}" data-focus-key="seed-input" autocomplete="off" spellcheck="false" /><div class="dialog-actions"><button class="button green" type="submit">Начать с этим seed</button>${button('random-seed', 'Другой seed', 'cream')}</div></form><p class="small-text">Для простого знакомства введи <b>onboarding</b>. Резерв новой партии: ${model.settings.reserveCapacity}.</p>`;
    case 'restart': return `<h2 id="dialog-title">Заново с тем же seed?</h2><p>Раскладка <b>${esc(model.game?.seed)}</b> начнётся с нуля. Открытия и счётчики сбросятся.</p><div class="dialog-actions">${button('confirm-restart', 'Начать заново', 'coral')}${button('close', 'Продолжить', 'cream')}</div>`;
    case 'pause': return `<div class="eyebrow">МОЖНО НЕ СПЕШИТЬ</div><h2 id="dialog-title">Пауза</h2><p>${model.warning ? 'Партия остаётся в этой вкладке: сохранение недоступно.' : 'Партия сохранена в этом браузере. Все фишки дождутся тебя.'}</p><div class="dialog-actions">${button('close', '▶ Продолжить', 'green')}${button('restart', 'Заново · тот же seed', 'blue')}${button('rules', 'Правила', 'cream')}${button('menu', 'В меню', 'cream')}</div>`;
    case 'records': return `<h2 id="dialog-title">Мои рекорды</h2><p>Только этот браузер · завершено партий: <b>${model.records.wins}</b></p>${model.records.bestScore ? `<div class="record"><span>Лучшие очки</span><strong>${model.records.bestScore.score}</strong><small>Seed: ${esc(model.records.bestScore.seed)}</small></div>` : '<p>Первый рекорд появится после победы.</p>'}${model.records.fewestMoves ? `<div class="record"><span>Меньше всего переносов</span><strong>${model.records.fewestMoves.transfers}</strong><small>Seed: ${esc(model.records.fewestMoves.seed)}</small></div>` : ''}${button('close', 'Понятно', 'green')}`;
    default: return '';
  }
}

function overlay(model: ViewModel): string {
  let content = '';
  if (model.modal) content = modalContent(model);
  else if (model.screen === 'game' && model.game?.result && !model.victoryDismissed) {
    const result = model.game.result;
    content = `<div class="victory-star" aria-hidden="true">★</div><div class="eyebrow">ВСЕ 108 НА СВОИХ МЕСТАХ</div><h2 id="dialog-title">Секрет раскрыт!</h2><div class="result-score" data-testid="final-score">${result.score}<span>очков</span></div><p>${result.transfers} переносов · ${result.undos} отмен · ${result.hints} подсказок</p><p class="small-text">Seed: ${esc(model.game.seed)}<br>${model.warning ? 'Результат доступен в этой вкладке; сохранение недоступно.' : 'Результат сохранён в локальных рекордах.'}</p><div class="dialog-actions">${button('new', 'Новая партия', 'green')}${button('inspect-win', 'Посмотреть доску', 'cream')}${button('menu', 'В меню', 'blue')}</div>`;
  } else if (model.screen === 'game' && model.blocked) content = `<h2 id="dialog-title">Ходов нет</h2><p>Нет доступного раскрытия, переноса или отмены. Фишки сохранены — можно начать эту раскладку заново.</p><div class="dialog-actions">${button('restart', 'Заново · тот же seed', 'green')}${button('new', 'Новая партия', 'blue')}${button('menu', 'В меню', 'cream')}</div>`;
  if (!content) return '';
  return `<div class="modal-backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1">${model.modal ? button('close', '×<span class="sr-only">Закрыть окно</span>', 'dialog-close') : ''}${content}</section></div>`;
}

/** DOM rendering and input only. Every real mutation goes through the game engine. */
export function mountUI(root: HTMLElement, onEvent: (event: UIEvent) => void) {
  let modalOpener: string | undefined;
  function click(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const jump = event.target.closest<HTMLElement>('[data-jump]');
    if (jump) {
      const col = root.querySelector<HTMLElement>(`[data-column="${jump.dataset.jump}"]`);
      const tile = col?.querySelector<HTMLElement>('.cell:not(.vacant)');
      tile?.focus({ preventScroll: true }); tile?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return;
    }
    const command = event.target.closest<HTMLButtonElement>('[data-command]');
    if (command && !command.disabled) { onEvent({ type: 'command', command: command.dataset.command!, value: command.dataset.value }); return; }
    const cell = event.target.closest<HTMLElement>('[data-zone]');
    if (cell) onEvent({ type: 'cell', location: { zone: cell.dataset.zone as Location['zone'], index: Number(cell.dataset.place) }, index: Number(cell.dataset.index) });
  }
  function change(event: Event): void {
    if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) return;
    if (event.target.dataset.setting) onEvent({ type: 'setting', name: event.target.dataset.setting, value: event.target instanceof HTMLInputElement ? event.target.checked : event.target.value });
  }
  function submit(event: SubmitEvent): void {
    if (!(event.target instanceof HTMLFormElement)) return;
    event.preventDefault();
    onEvent({ type: 'command', command: event.target.dataset.form!, value: String(new FormData(event.target).get('seed') ?? '') });
  }
  function keydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const dialog = root.querySelector<HTMLElement>('[role="dialog"]');
    if (event.key === 'Escape') { event.preventDefault(); onEvent({ type: 'command', command: dialog ? 'close' : 'cancel' }); return; }
    if (event.key === 'Tab' && dialog) {
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]')];
      if (!dialog.contains(target)) { event.preventDefault(); (event.shiftKey ? focusable.at(-1) : focusable[0])?.focus(); }
      else if (event.shiftKey && (target === focusable[0] || target === dialog)) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && target === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
      return;
    }
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || dialog) return;
    if ((event.ctrlKey && event.key.toLowerCase() === 'z') || event.key.toLowerCase() === 'u') { event.preventDefault(); onEvent({ type: 'command', command: 'undo' }); return; }
    if (event.key.toLowerCase() === 'h') { event.preventDefault(); onEvent({ type: 'command', command: 'hint' }); return; }
    if (target.matches('.cell[data-zone="column"]') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      let col = Number(target.dataset.place), row = Number(target.dataset.row);
      if (event.key === 'ArrowLeft') col--; if (event.key === 'ArrowRight') col++;
      if (event.key === 'ArrowUp') row--; if (event.key === 'ArrowDown') row++;
      if (event.key === 'Home') row = 0; if (event.key === 'End') row = 11;
      const next = root.querySelector<HTMLElement>(`.cell[data-zone="column"][data-place="${Math.max(0, Math.min(9, col))}"][data-row="${Math.max(0, Math.min(11, row))}"]`);
      next?.focus({ preventScroll: true }); next?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  root.addEventListener('click', click); root.addEventListener('change', change); root.addEventListener('submit', submit); root.addEventListener('keydown', keydown);
  return {
    render(model: ViewModel): void {
      const focusKey = (document.activeElement as HTMLElement | null)?.dataset.focusKey;
      const oldDialog = !!root.querySelector('[role="dialog"]');
      const scroll = root.querySelector<HTMLElement>('.board-scroll');
      const scrollLeft = scroll?.scrollLeft ?? 0, scrollTop = scroll?.scrollTop ?? 0;
      const oldRects = new Map<number, DOMRect>();
      if (model.effect) for (const id of model.effect.ids) { const node = root.querySelector<HTMLElement>(`[data-tile-id="${id}"]`); if (node) oldRects.set(id, node.getBoundingClientRect()); }
      root.innerHTML = `<div class="app-shell">${model.screen === 'game' && model.game ? game(model) : menu(model)}${model.warning ? `<div class="storage-warning" role="status">${esc(model.warning)}</div>` : ''}<footer class="app-footer">Секретная сортировка <span>·</span> Авторская веб-версия <span>·</span> v0.2</footer>${overlay(model)}</div>`;
      document.documentElement.dataset.motion = model.settings.animations ? 'on' : 'off';
      const nextScroll = root.querySelector<HTMLElement>('.board-scroll');
      if (nextScroll) { nextScroll.scrollLeft = scrollLeft; nextScroll.scrollTop = scrollTop; }
      const nextDialog = root.querySelector<HTMLElement>('[role="dialog"]');
      if (nextDialog && !oldDialog) modalOpener = focusKey;
      if (nextDialog) root.querySelector('main')?.setAttribute('inert', '');
      const restoreKey = oldDialog && !nextDialog ? modalOpener : focusKey;
      const restore = restoreKey ? root.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(restoreKey)}"]`) : null;
      if (nextDialog) (restore && nextDialog.contains(restore) ? restore : nextDialog).focus({ preventScroll: true });
      else if (restore) restore.focus({ preventScroll: true });
      else if (oldDialog) root.querySelector<HTMLElement>('.cell[tabindex="0"], .main-play')?.focus({ preventScroll: true });
      if (model.settings.animations && !matchMedia('(prefers-reduced-motion: reduce)').matches && model.effect) {
        for (const id of model.effect.ids) {
          const node = root.querySelector<HTMLElement>(`[data-tile-id="${id}"]`);
          if (!node) continue;
          if (model.effect.type === 'reveal') node.animate([{ transform: 'rotateY(-85deg) scale(.9)' }, { transform: 'rotateY(0) scale(1)' }], { duration: 180, easing: 'ease-out' });
          else { const before = oldRects.get(id), after = node.getBoundingClientRect(); if (before) node.animate([{ transform: `translate(${before.x - after.x}px, ${before.y - after.y}px)`, opacity: .7 }, { transform: 'translate(0,0)', opacity: 1 }], { duration: 180, easing: 'ease-out' }); }
        }
      }
    },
    destroy(): void { root.removeEventListener('click', click); root.removeEventListener('change', change); root.removeEventListener('submit', submit); root.removeEventListener('keydown', keydown); root.replaceChildren(); },
  };
}
