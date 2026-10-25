import './ui/styles.css';
import { applyAction, columnAt, createGame, isBlocked, possibleAction, sameLocation, selectionError, tilesAt } from './game/game.ts';
import { loadGame, loadRecords, loadSettings, recordVictory, saveGame, saveRecords, saveSettings } from './game/storage.ts';
import { generateLevel, normalizeSeed } from './generator/level-generator.ts';
import { verifyLevel } from './generator/verify.ts';
import { mountUI } from './ui/app.ts';
import type { UIEvent, ViewModel } from './ui/app.ts';
import type { GameAction, GameState, Location, ProofAction } from './game/types.ts';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('App root is missing');
const storage = { getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value) };
const loaded = loadGame(storage);
const params = new URLSearchParams(location.search);
const model: ViewModel = {
  screen: 'menu', game: loaded.game, settings: loadSettings(storage, matchMedia('(prefers-reduced-motion: reduce)').matches), records: loadRecords(storage),
  selection: null, hint: null, message: 'Раскрой верхний «?». Он только откроется — перенос выбираешь ты.', error: false,
  warning: loaded.warning, modal: null, seedInput: normalizeSeed(params.get('seed') ?? 'onboarding'),
  tutorialStep: 0, tutorialCount: 0, tutorialKind: 0, victoryDismissed: false, blocked: false, effect: null,
};
let audio: AudioContext | null = null;
let tutorialGame: GameState | null = null;

function render(): void {
  model.blocked = !!model.game && isBlocked(model.game);
  ui.render(model);
  model.effect = null;
}
function message(text: string, error = false): void { model.message = text; model.error = error; }
function persist(): void {
  const ok = (!model.game || saveGame(storage, model.game)) && saveSettings(storage, model.settings) && saveRecords(storage, model.records);
  if (!ok) model.warning = 'Сохранение недоступно. Партия и рекорды остаются только в этой вкладке';
}
function sound(type: 'reveal' | 'move' | 'won'): void {
  if (!model.settings.sound) return;
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = { reveal: 530, move: 680, won: 880 }[type];
    gain.gain.setValueAtTime(.035, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + .12);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .13);
  } catch { /* Audio can be unavailable; input and game state stay usable. */ }
}
function newSeed(): string { const values = crypto.getRandomValues(new Uint32Array(2)); return `s-${values[0]!.toString(36)}-${values[1]!.toString(36)}`; }
function openTutorial(): void { model.modal = 'tutorial'; model.tutorialStep = 0; model.tutorialCount = 0; tutorialGame = createGame(generateLevel('onboarding')); }
function begin(seed: string, reserveCapacity = model.settings.reserveCapacity): void {
  const level = generateLevel(seed);
  if (!verifyLevel(level, reserveCapacity)) { model.warning = 'Раскладка не прошла проверку решения. Начните с другого seed'; render(); return; }
  model.game = createGame(level, reserveCapacity, crypto.randomUUID());
  model.seedInput = level.seed; model.screen = 'game'; model.modal = null; model.selection = null; model.hint = null; model.victoryDismissed = false;
  message('Раскрой верхний «?». Затем выбери открытую фишку и подходящую цель.');
  if (!model.settings.tutorialSeen) openTutorial();
  persist(); render();
}

function act(action: GameAction): void {
  if (!model.game) return;
  const old = model.game;
  const ids = action.type === 'move' ? tilesAt(old, action.from).slice(0, action.count).map(tile => tile.id) : action.type === 'reveal' ? [old.columns[action.column]?.[0]?.id ?? -1] : [];
  const result = applyAction(old, action);
  if (!result.ok) { message(result.reason, true); render(); return; }
  model.game = result.state; model.selection = null; model.hint = null;
  if (action.type === 'move' || action.type === 'reveal') { model.effect = { type: action.type, ids }; sound(action.type); }
  message(action.type === 'reveal' ? 'Секрет открыт. Теперь можно выбрать одну фишку или часть верхней пачки.' : action.type === 'undo' ? 'Последнее действие отменено. Раскрытость восстановлена, стоимость действий сохраняется.' : 'Перенос выполнен. Следующую закрытую фишку раскрывай отдельным нажатием.');
  if (model.game.result) { model.records = recordVictory(model.records, model.game, new Date().toISOString()); model.modal = null; model.victoryDismissed = false; message('Все 108 фишек на своих местах!'); sound('won'); }
  else if (possibleAction(model.game) === null && model.game.history.length) message('Прямых ходов нет. Можно отменить последнее действие или начать тот же seed заново.');
  persist(); render();
}

function cell(location: Location, index: number): void {
  const state = model.game;
  if (!state || model.screen !== 'game' || model.modal) return;
  if (state.result) { message('Партия завершена. Начни новую раскладку.'); render(); return; }
  const selected = model.selection;
  if (selected && !sameLocation(selected.source, location)) { act({ type: 'move', from: selected.source, to: location, count: selected.count }); return; }
  const tiles = tilesAt(state, location);
  if (index < 0 || !tiles[index]) { model.selection = null; message(tiles.length ? 'Нажми на верхнюю закрытую фишку или на открытую пачку.' : 'Пустая колонка: сначала выбери фишки в другой колонке.'); render(); return; }
  if (!tiles[index]!.open) {
    if (location.zone !== 'column' || index !== 0) { message('Можно раскрыть только верхнюю закрытую фишку. Сначала убери фишки над ней.', true); render(); return; }
    act({ type: 'reveal', column: location.index, index }); return;
  }
  const count = location.zone === 'reserve' ? 1 : index + 1;
  const error = selectionError(state, { source: location, count });
  if (error) { message(error, true); render(); return; }
  model.selection = selected?.count === count ? null : { source: location, count };
  model.hint = null;
  message(model.selection ? `Выбрано ${count}. Нажми на подходящую колонку${count === 1 && state.reserve.length ? ' или свободное место резерва' : ''}. Esc — снять выбор.` : 'Выбор снят.');
  render();
}

function describeHint(hint: ProofAction): string {
  const place = (loc: Location): string => `${loc.zone === 'column' ? 'колонка' : 'резерв'} ${loc.index + 1}`;
  return hint.type === 'reveal' ? `Возможный ход: раскрой верхний «?» в колонке ${hint.column + 1}.` : `Возможный ход: ${place(hint.from)} → ${place(hint.to)}, фишек: ${hint.count}. Это легальный ход, оптимальность не обещается.`;
}
function finishTutorial(startPlaying: boolean): void {
  model.settings.tutorialSeen = true; model.modal = null; tutorialGame = null; persist();
  if (startPlaying && model.screen === 'menu') { if (model.game && !model.game.result) { model.screen = 'game'; render(); } else begin('onboarding'); }
  else render();
}

function handle(event: UIEvent): void {
  if (event.type === 'cell') { cell(event.location, event.index); return; }
  if (event.type === 'setting') {
    if (event.name === 'sound') model.settings.sound = event.value === true;
    if (event.name === 'animations') model.settings.animations = event.value === true;
    if (event.name === 'reserveCapacity') model.settings.reserveCapacity = event.value === '0' ? 0 : 4;
    persist(); render(); return;
  }
  switch (event.command) {
    case 'play': begin(model.seedInput); return;
    case 'continue': if (model.game && !model.game.result) { model.screen = 'game'; model.modal = null; message('Партия восстановлена. Можно продолжать.'); render(); } return;
    case 'new': model.seedInput = newSeed(); model.modal = 'new'; render(); return;
    case 'random-seed': model.seedInput = newSeed(); render(); return;
    case 'new-seed': begin(normalizeSeed(event.value ?? '')); return;
    case 'restart': model.modal = 'restart'; render(); return;
    case 'confirm-restart': if (model.game) begin(model.game.seed, model.game.config.reserveCapacity); return;
    case 'menu': model.screen = 'menu'; model.modal = null; model.selection = null; model.hint = null; persist(); render(); return;
    case 'cancel': model.selection = null; model.hint = null; message('Выбор снят.'); render(); return;
    case 'close': if (model.modal === 'tutorial') { finishTutorial(false); return; } model.modal = null; render(); return;
    case 'rules': model.modal = 'rules'; render(); return;
    case 'settings': model.modal = 'settings'; render(); return;
    case 'records': model.modal = 'records'; render(); return;
    case 'pause': model.modal = 'pause'; persist(); render(); return;
    case 'undo': act({ type: 'undo' }); return;
    case 'hint': {
      if (!model.game || model.screen !== 'game') return;
      const hint = possibleAction(model.game), result = applyAction(model.game, { type: 'hint' });
      if (!result.ok || !hint) { message(result.ok ? 'Доступных ходов нет' : result.reason, true); render(); return; }
      model.game = result.state; model.selection = null; model.hint = hint; message(describeHint(hint)); persist(); render(); return;
    }
    case 'tutorial': openTutorial(); render(); return;
    case 'tutorial-reveal': {
      if (!tutorialGame || model.tutorialStep !== 0) return;
      const result = applyAction(tutorialGame, { type: 'reveal', column: 0, index: 0 });
      if (!result.ok) return;
      const level = generateLevel('certified-2'); tutorialGame = createGame(level);
      for (const action of level.solution.slice(0, 201)) { const next = applyAction(tutorialGame, action); if (!next.ok) throw new Error('Tutorial certificate failed'); tutorialGame = next.state; }
      model.tutorialKind = tutorialGame.columns[8]![0]!.kind; model.tutorialStep = 1; sound('reveal'); render(); return;
    }
    case 'tutorial-select': {
      const count = Number(event.value);
      if (!tutorialGame || model.tutorialStep < 1 || model.tutorialStep > 2 || selectionError(tutorialGame, { source: columnAt(8), count })) return;
      model.tutorialCount = count; model.tutorialStep = count === 5 ? 2 : 1; render(); return;
    }
    case 'tutorial-transfer': {
      if (!tutorialGame || model.tutorialStep !== 2) return;
      const next = applyAction(tutorialGame, { type: 'move', from: columnAt(8), to: columnAt(7), count: 5 });
      if (!next.ok) throw new Error('Tutorial move failed'); tutorialGame = next.state; model.tutorialStep = 3; sound('move'); render(); return;
    }
    case 'tutorial-finish': finishTutorial(model.tutorialStep === 3); return;
    case 'inspect-win': model.victoryDismissed = true; render(); return;
  }
}

const ui = mountUI(root, handle);
const visibility = (): void => { if (document.hidden && model.screen === 'game' && !model.modal && model.game && !model.game.result) { model.modal = 'pause'; persist(); render(); } };
document.addEventListener('visibilitychange', visibility);
// Opt-in, read-only diagnostics. Browser acceptance tests still use real clicks/taps.
declare global { interface Window { __secretSort?: { snapshot: () => unknown; certificate: () => ProofAction[] } } }
if (params.get('qa') === '1') window.__secretSort = Object.freeze({ snapshot: () => structuredClone({ game: model.game, selection: model.selection, screen: model.screen, modal: model.modal, records: model.records, settings: model.settings }), certificate: () => structuredClone(generateLevel(model.game?.seed ?? model.seedInput).solution) });
render();
if (import.meta.hot) import.meta.hot.dispose(() => { ui.destroy(); document.removeEventListener('visibilitychange', visibility); void audio?.close(); delete window.__secretSort; });
