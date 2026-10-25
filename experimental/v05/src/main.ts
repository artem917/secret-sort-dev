import './ui/styles.css';
import { applyAction, columnAt, createGame, possibleAction, sameLocation, selectionError, tilesAt } from './game/game.ts';
import { loadRecords, loadSettings, recordVictory, saveRecords, saveSettings } from './game/storage.ts';
import { generateDeal } from './generator/level-generator.ts';
import { levelFor, validateDeal } from './game/deal.ts';
import { loadSession, saveSession } from './game/session.ts';
import { verifyClosedProof } from './solver/solver.ts';
import { ReplayPlayer } from './replay/player.ts';
import type { ReplaySpeed } from './replay/player.ts';
import type { SearchReport } from './solver/solver.ts';
import { mountUI } from './ui/app.ts';
import { createGroupTutorial } from './ui/tutorial.ts';
import { visiblePosition } from './game/visible.ts';
import type { UIEvent, ViewModel } from './ui/app.ts';
import type { Difficulty, GameAction, GameState, Location, ProofAction } from './game/types.ts';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('App root is missing');
const storage = { getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value) };
const loaded = await loadSession(storage);
const params = new URLSearchParams(location.search);
const model: ViewModel = {
  difficulty: 2, disposition: loaded.disposition, solutionAvailable: !!loaded.deal, solutionReason: loaded.solutionReason, replay: null,
  screen: 'menu', game: loaded.game, settings: loadSettings(storage, matchMedia('(prefers-reduced-motion: reduce)').matches), records: loadRecords(storage),
  selection: null, hint: null, message: 'Раскрой верхний «?». Он только откроется — перенос выбираешь ты.', error: false,
  warning: loaded.warning, modal: null,
  tutorialStep: 0, tutorialCount: 0, tutorialKind: 0, victoryDismissed: false, blocked: false, effect: null,
};
let audio: AudioContext | null = null;
let tutorialGame: GameState | null = null;
let deal = loaded.deal;
let provenLossProof = loaded.lossProof;
let analysisWorker: Worker | null = null;
let analysisTimer: ReturnType<typeof setTimeout> | null = null;
let analysisDeadline: ReturnType<typeof setTimeout> | null = null;
let revision = 0;
let lastAnalysis: unknown = null;
let player: ReplayPlayer | null = null;
let replayOpening = false;
model.difficulty = ([1,2,3,4].includes(model.settings.reserveCapacity) ? model.settings.reserveCapacity : 2) as Difficulty;
if (params.get('qa') === '1' && [1,2,3,4].includes(Number(params.get('mode')))) model.difficulty = Number(params.get('mode')) as Difficulty;

function render(): void {
  model.blocked = false;
  ui.render(model);
  model.effect = null;
}
function message(text: string, error = false): void { model.message = text; model.error = error; }
function persist(): void {
  const ok = (!model.game || saveSession(storage, model.game, deal, model.disposition, provenLossProof)) && saveSettings(storage, model.settings) && saveRecords(storage, model.records);
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
function openTutorial(): void { model.modal = 'tutorial'; model.tutorialStep = 0; model.tutorialCount = 0; tutorialGame = createGroupTutorial(); tutorialGame.columns[0]!.forEach(tile => { tile.open = false; }); }
function stopAnalysis(): void {
  revision++; analysisWorker?.terminate(); analysisWorker = null;
  if (analysisTimer !== null) clearTimeout(analysisTimer); analysisTimer = null;
  if (analysisDeadline !== null) clearTimeout(analysisDeadline); analysisDeadline = null;
}
function analyze(): void {
  stopAnalysis(); if (!model.game || model.game.result || model.disposition !== 'playing' || model.replay) return;
  const current = revision, position = structuredClone({ columns: model.game.columns, reserve: model.game.reserve });
  analysisTimer = setTimeout(() => {
    analysisTimer = null;
    try {
      const worker = new Worker(new URL('./solver/analysis.worker.ts', import.meta.url), { type: 'module' }); analysisWorker = worker;
      const finish = (): void => { worker.terminate(); if (analysisWorker === worker) analysisWorker = null; if (analysisDeadline !== null) clearTimeout(analysisDeadline); analysisDeadline = null; };
      analysisDeadline = setTimeout(() => { finish(); if (current === revision) lastAnalysis = { status: 'UNKNOWN', reason: 'analysis-watchdog' }; }, 1800);
      worker.onmessage = event => {
        finish(); if (current !== revision || model.replay || model.disposition !== 'playing' || model.game?.result) return;
        const result = event.data as SearchReport, { solution: unusedSolution, closedProof, ...stats } = result;
        void unusedSolution; lastAnalysis = { ...stats, proofStates: closedProof?.keys.length ?? 0 };
        if (result.status === 'LOSE' && closedProof && verifyClosedProof(position, closedProof)) {
          provenLossProof = structuredClone(closedProof);
          model.disposition = 'proven-lose'; model.modal = 'ended'; model.selection = null; model.hint = null;
          message('Победного продолжения без отмены нет. Можно отменить последний ход.'); persist(); render();
        }
      };
      worker.onerror = () => { finish(); if (current === revision) lastAnalysis = { status: 'UNKNOWN', reason: 'analysis-unavailable' }; };
      worker.postMessage(position);
    } catch { lastAnalysis = { status: 'UNKNOWN', reason: 'analysis-unavailable' }; }
  }, 180);
}
async function begin(seed: string): Promise<void> {
  stopAnalysis(); model.modal = 'generating'; model.selection = null; model.hint = null; render();
  try {
    const nextDeal = await generateDeal(seed, model.difficulty), checked = await validateDeal(nextDeal);
    if (!checked.ok) throw new Error(checked.reason);
    deal = checked.deal; model.game = createGame(levelFor(deal), deal.difficulty, crypto.randomUUID());
    provenLossProof = null; lastAnalysis = null;
    model.solutionAvailable = true; model.solutionReason = null; model.disposition = 'playing'; model.screen = 'game'; model.modal = null; model.victoryDismissed = false;
    message('Раскрой верхние «?». Весь необходимый резерв уже доступен.');
    if (!model.settings.tutorialSeen) openTutorial(); persist(); render();
  } catch { model.modal = 'generation-failed'; render(); }
}
function repeat(): void {
  if (!deal || !model.solutionAvailable) return; stopAnalysis();
  model.game = createGame(levelFor(deal), deal.difficulty, crypto.randomUUID()); model.disposition = 'playing'; model.screen = 'game'; model.modal = null;
  provenLossProof = null; lastAnalysis = null;
  model.selection = null; model.hint = null; model.victoryDismissed = false; message('Исходный порядок всех 108 фишек восстановлен.'); persist(); render();
}
async function openReplay(): Promise<void> {
  if (!deal || !model.solutionAvailable || replayOpening) return;
  replayOpening = true; stopAnalysis();
  try {
    const checked = await validateDeal(deal);
    if (!checked.ok) { model.solutionAvailable = false; model.solutionReason = checked.reason; render(); return; }
    player?.close();
    player = new ReplayPlayer(levelFor(checked.deal), checked.deal.difficulty, view => { model.replay = view; model.effect = view.effect; render(); }, !model.settings.animations || matchMedia('(prefers-reduced-motion: reduce)').matches);
    model.replay = player.view; model.modal = null; model.selection = null; model.hint = null; render();
  } catch { model.solutionAvailable = false; model.solutionReason = 'Последовательность не прошла повторную проверку.'; render(); }
  finally { replayOpening = false; }
}
function closeReplay(): void {
  player?.close(); player = null; ui.stopAnimations(); model.replay = null; model.effect = null;
  model.modal = model.screen === 'game' && model.disposition !== 'playing' ? 'ended' : null; render();
}

function act(action: GameAction): void {
  if (!model.game || model.replay || model.disposition === 'surrendered') return;
  if (model.disposition === 'proven-lose' && action.type !== 'undo') return;
  stopAnalysis();
  const old = model.game;
  const ids = action.type === 'move' ? tilesAt(old, action.from).slice(0, action.count).map(tile => tile.id) : action.type === 'reveal' ? [old.columns[action.column]?.[0]?.id ?? -1] : [];
  const result = applyAction(old, action);
  if (!result.ok) { message(result.reason, true); render(); return; }
  model.game = result.state;
  if (action.type === 'undo') { model.disposition = 'playing'; model.modal = null; provenLossProof = null; }
  model.selection = null; model.hint = null;
  if (action.type === 'move' || action.type === 'reveal') {
    const entry = model.game.history.at(-1);
    model.effect = { type: action.type, ids, autoRevealId: entry?.type === 'move' ? entry.autoRevealedId : null }; sound(action.type);
  }
  message(action.type === 'reveal' ? 'Секрет открыт. Теперь можно выбрать одну фишку или часть верхней пачки.' : action.type === 'undo' ? 'Перенос и его автоматическое раскрытие отменены вместе. Стоимость действий сохраняется.' : 'Перенос выполнен. Новая верхняя закрытая фишка источника открывается автоматически.');
  if (model.game.result) { model.records = recordVictory(model.records, model.game, new Date().toISOString()); model.modal = null; model.victoryDismissed = false; message('Все 108 фишек на своих местах!'); sound('won'); }
  else if (possibleAction(model.game) === null && model.game.history.length) message('Прямых ходов нет. Можно отменить последнее действие или повторить раскладку.');
  persist(); render(); if (!model.game.result) analyze();
}

function cell(location: Location, index: number): void {
  const state = model.game;
  if (!state || model.screen !== 'game' || model.modal || model.replay || model.disposition !== 'playing') return;
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
  if (startPlaying && model.screen === 'menu') { if (model.game && !model.game.result) { model.screen = 'game'; render(); } else begin(newSeed()); }
  else render();
}

function handle(event: UIEvent): void {
  if (model.replay) {
    if (event.type !== 'command') return;
    switch (event.command) {
      case 'replay-close': closeReplay(); return;
      case 'replay-toggle': if (model.replay.playing) player?.pause(); else player?.play(); return;
      case 'replay-next': player?.next(); return;
      case 'replay-back': player?.previous(); return;
      case 'replay-restart': player?.restart(); return;
      case 'replay-speed': player?.setSpeed(Number(event.value) as ReplaySpeed); return;
      default: return;
    }
  }
  if (model.modal === 'generating') return;
  if (event.type === 'cell') { cell(event.location, event.index); return; }
  if (event.type === 'setting') {
    if (event.name === 'sound') model.settings.sound = event.value === true;
    if (event.name === 'animations') model.settings.animations = event.value === true;
    persist(); render(); return;
  }
  switch (event.command) {
    case 'play': void begin(params.get('qa') === '1' ? params.get('seed') ?? newSeed() : newSeed()); return;
    case 'continue': if (model.game && !model.game.result) { model.screen = 'game'; model.modal = null; model.modal = model.disposition === 'playing' ? null : 'ended'; message('Партия восстановлена.'); render(); if (model.disposition === 'playing') analyze(); } return;
    case 'new': model.modal = 'new'; render(); return;
    case 'confirm-new': void begin(newSeed()); return;
    case 'restart': model.modal = 'restart'; render(); return;
    case 'confirm-restart': repeat(); return;
    case 'choose-mode': if ([1,2,3,4].includes(Number(event.value))) { model.difficulty = Number(event.value) as Difficulty; model.settings.reserveCapacity = model.difficulty; persist(); render(); } return;
    case 'replay-open': void openReplay(); return;
    case 'surrender': model.modal = 'confirm-surrender'; render(); return;
    case 'confirm-surrender': stopAnalysis(); model.disposition = 'surrendered'; model.modal = 'ended'; model.selection = null; model.hint = null; persist(); render(); return;
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
      tutorialGame = createGroupTutorial();
      model.tutorialKind = 0; model.tutorialStep = 1; sound('reveal'); render(); return;
    }
    case 'tutorial-select': {
      const count = Number(event.value);
      if (!tutorialGame || model.tutorialStep < 1 || model.tutorialStep > 2 || selectionError(tutorialGame, { source: columnAt(0), count })) return;
      model.tutorialCount = count; model.tutorialStep = count === 5 ? 2 : 1; render(); return;
    }
    case 'tutorial-transfer': {
      if (!tutorialGame || model.tutorialStep !== 2) return;
      const next = applyAction(tutorialGame, { type: 'move', from: columnAt(0), to: columnAt(9), count: 5 });
      if (!next.ok) throw new Error('Tutorial move failed'); tutorialGame = next.state; model.tutorialStep = 3; sound('move'); render(); return;
    }
    case 'tutorial-finish': finishTutorial(model.tutorialStep === 3); return;
    case 'inspect-win': model.victoryDismissed = true; render(); return;
  }
}

const ui = mountUI(root, handle);
const visibility = (): void => { if (document.hidden && model.replay) { player?.pause(); return; } if (document.hidden && model.screen === 'game' && !model.modal && model.game && !model.game.result) { model.modal = 'pause'; persist(); render(); } };
document.addEventListener('visibilitychange', visibility);
// Opt-in, read-only diagnostics. Browser acceptance tests still use real clicks/taps.
declare global { interface Window { __secretSortV05?: { snapshot: () => unknown; deal: () => unknown; certificate: () => ProofAction[]; visible: () => ReturnType<typeof visiblePosition> | null; analysis: () => unknown; animations: () => number } } }
if (params.get('qa') === '1') window.__secretSortV05 = Object.freeze({ snapshot: () => structuredClone({ game: model.game, selection: model.selection, screen: model.screen, modal: model.modal, records: model.records, settings: model.settings, disposition: model.disposition, difficulty: model.difficulty, replay: model.replay, solutionAvailable: model.solutionAvailable, solutionReason: model.solutionReason }), deal: () => structuredClone(deal), certificate: () => structuredClone(deal?.solution ?? []), visible: () => model.game ? visiblePosition(model.game) : null, analysis: () => structuredClone(lastAnalysis), animations: () => ui.animationCount() });
render();
if (import.meta.hot) import.meta.hot.dispose(() => { stopAnalysis(); player?.close(); ui.destroy(); document.removeEventListener('visibilitychange', visibility); void audio?.close(); delete window.__secretSortV05; });
