import { DEFAULT_CONFIG, INITIAL_HEIGHTS } from './types.ts';
import type { ActionResult, GameAction, GameConfig, GameState, HistoryEntry, Level, Location, Move, Position, ProofAction, Selection, Tile } from './types.ts';

export const columnAt = (index: number): Location => ({ zone: 'column', index });
export const reserveAt = (index: number): Location => ({ zone: 'reserve', index });
export const sameLocation = (a: Location, b: Location): boolean => a.zone === b.zone && a.index === b.index;
export const scoreFor = (transfers: number, undos: number, hints: number): number => Math.max(0, 10000 - 30 * transfers - 250 * undos - 500 * hints);

export function clonePosition(position: Position): Position {
  return { columns: position.columns.map(col => col.map(tile => ({ ...tile }))), reserve: position.reserve.map(tile => tile ? { ...tile } : null) };
}

export function positionError(position: Position, config: GameConfig): string | null {
  if (!Array.isArray(position.columns) || position.columns.length !== 10 || !Array.isArray(position.reserve) || position.reserve.length !== config.reserveCapacity) return 'Неверный размер поля';
  const ids = new Set<number>();
  const kinds = Array<number>(9).fill(0);
  for (const col of position.columns) {
    if (!Array.isArray(col) || col.length > 12) return 'Переполнение колонки';
    let hidden = false;
    for (const tile of col) {
      if (!tile || typeof tile.open !== 'boolean') return 'Повреждённая фишка';
      if (!tile.open) hidden = true;
      else if (hidden) return 'Открытая фишка под закрытой';
    }
  }
  const tiles = [...position.columns.flat(), ...position.reserve.filter((tile): tile is Tile => tile !== null)];
  for (const tile of tiles) {
    if (!tile || !Number.isInteger(tile.id) || tile.id < 0 || tile.id >= 108 || !Number.isInteger(tile.kind) || tile.kind < 0 || tile.kind > 8 || Math.floor(tile.id / 12) !== tile.kind || typeof tile.open !== 'boolean' || ids.has(tile.id)) return 'Неверные ID или виды фишек';
    ids.add(tile.id);
    kinds[tile.kind] = (kinds[tile.kind] ?? 0) + 1;
  }
  if (ids.size !== 108 || kinds.some(count => count !== 12)) return 'Должно быть 108 фишек: 9 видов по 12';
  if (position.reserve.some(tile => tile !== null && !tile.open)) return 'Закрытая фишка в резерве';
  return null;
}

export function createGame(level: Level, reserveCapacity: 0 | 4 = 4, runId = `${level.seed}:session`): GameState {
  const config: GameConfig = { ...DEFAULT_CONFIG, reserveCapacity };
  const position: Position = { columns: level.columns.map(col => col.map(tile => ({ ...tile }))), reserve: Array<Tile | null>(reserveCapacity).fill(null) };
  const error = positionError(position, config);
  if (error || position.columns.some((col, i) => col.length !== INITIAL_HEIGHTS[i]) || position.columns.flat().some(tile => tile.open)) throw new Error(error ?? 'Некорректная стартовая раскладка');
  return { ...position, version: 2, generator: level.algorithm, runId, seed: level.seed, config, transfers: 0, undos: 0, hints: 0, history: [], result: null };
}

export function validLocation(position: Position, location: Location): boolean {
  return !!location && Number.isInteger(location.index) && location.index >= 0 && (location.zone === 'column' ? location.index < 10 : location.zone === 'reserve' && location.index < position.reserve.length);
}

export function tilesAt(position: Position, location: Location): Tile[] {
  if (!validLocation(position, location)) return [];
  if (location.zone === 'column') return position.columns[location.index] ?? [];
  const tile = position.reserve[location.index];
  return tile ? [tile] : [];
}

export function topRun(position: Position, location: Location): number {
  const tiles = tilesAt(position, location);
  const first = tiles[0];
  if (!first?.open) return 0;
  let count = 0;
  while (tiles[count]?.open && tiles[count]?.kind === first.kind) count++;
  return count;
}

export function selectionError(position: Position, selection: Selection): string | null {
  if (!validLocation(position, selection.source)) return 'Такого места нет';
  if (!Number.isInteger(selection.count) || selection.count < 1 || selection.count > topRun(position, selection.source)) return 'Выбирайте только верхнюю открытую пачку одного вида';
  return null;
}

export function moveError(position: Position, move: Move): string | null {
  const error = selectionError(position, { source: move.from, count: move.count });
  if (error) return error;
  if (!validLocation(position, move.to)) return 'Такого места нет';
  if (sameLocation(move.from, move.to)) return 'Выберите другую колонку или резерв';
  if (move.to.zone === 'reserve') {
    if (move.count !== 1) return 'В резерв помещается одна фишка. Выберите верхнюю';
    return position.reserve[move.to.index] ? 'Это место резерва занято' : null;
  }
  const target = tilesAt(position, move.to);
  if (target.length + move.count > 12) return `В колонке свободно ${12 - target.length}, выбрано ${move.count}`;
  if (target[0] && !target[0].open) return 'Сначала раскройте верхнюю фишку цели';
  if (target[0] && target[0].kind !== tilesAt(position, move.from)[0]?.kind) return 'Перенос возможен только на такой же вид или в пустую колонку';
  return null;
}

function take(position: Position, from: Location, count: number): Tile[] {
  if (from.zone === 'column') return position.columns[from.index]!.splice(0, count);
  const tile = position.reserve[from.index]!;
  position.reserve[from.index] = null;
  return [tile];
}

function put(position: Position, to: Location, tiles: Tile[]): void {
  if (to.zone === 'column') position.columns[to.index]!.unshift(...tiles);
  else position.reserve[to.index] = tiles[0] ?? null;
}

export function isVictory(position: Position): boolean {
  if (position.columns.length !== 10 || position.reserve.some(Boolean)) return false;
  const full = position.columns.filter(col => col.length === 12);
  return full.length === 9 && position.columns.filter(col => col.length === 0).length === 1 && new Set(full.map(col => col[0]?.kind)).size === 9 && full.every(col => col.every(tile => tile.open && tile.kind === col[0]?.kind));
}

export function legalMoves(position: Position): Move[] {
  const sources = [...position.columns.map((_, i) => columnAt(i)), ...position.reserve.map((_, i) => reserveAt(i))];
  const moves: Move[] = [];
  for (const from of sources) {
    for (let count = 1; count <= topRun(position, from); count++) {
      for (const to of sources) {
        const move: Move = { type: 'move', from, to, count };
        if (!moveError(position, move)) moves.push(move);
      }
    }
  }
  return moves;
}

export function possibleAction(position: Position): ProofAction | null {
  // Hints use visible information only, never the certificate or hidden kinds.
  const moves = legalMoves(position);
  const useful = moves.find(move => move.from.zone === 'column' && tilesAt(position, move.from)[move.count]?.open === false && move.to.zone === 'column');
  if (useful) return useful;
  const hiddenColumn = position.columns.findIndex(col => col[0]?.open === false);
  if (hiddenColumn >= 0) return { type: 'reveal', column: hiddenColumn, index: 0 };
  return moves.find(move => move.from.zone === 'reserve' && move.to.zone === 'column') ?? moves.find(move => move.to.zone === 'column') ?? moves[0] ?? null;
}

export const revealedCount = (position: Position): number => [...position.columns.flat(), ...position.reserve].filter(tile => tile?.open).length;
export const isBlocked = (state: GameState): boolean => !isVictory(state) && state.history.length === 0 && possibleAction(state) === null;

export function reverseHistory(position: Position, entry: HistoryEntry): string | null {
  if (entry.type === 'reveal') {
    const tile = position.columns[entry.column]?.[0];
    if (!tile?.open || tile.id !== entry.id) return 'Повреждена история раскрытий';
    tile.open = false;
    return null;
  }
  if (!validLocation(position, entry.from) || !validLocation(position, entry.to) || sameLocation(entry.from, entry.to) || !Array.isArray(entry.ids) || !entry.ids.length || entry.ids.length > 12) return 'Повреждена история переносов';
  const targetTiles = tilesAt(position, entry.to).slice(0, entry.ids.length);
  if (targetTiles.length !== entry.ids.length || targetTiles.some((tile, i) => tile.id !== entry.ids[i] || !tile.open) || (entry.from.zone === 'reserve' && (entry.ids.length !== 1 || position.reserve[entry.from.index])) || (entry.from.zone === 'column' && tilesAt(position, entry.from).length + entry.ids.length > 12)) return 'Повреждена история переносов';
  if (entry.autoRevealedId !== null) {
    const revealed = entry.from.zone === 'column' ? position.columns[entry.from.index]?.[0] : null;
    if (!Number.isInteger(entry.autoRevealedId) || !revealed?.open || revealed.id !== entry.autoRevealedId) return 'Повреждена история автоматического раскрытия';
    revealed.open = false;
  }
  put(position, entry.from, take(position, entry.to, entry.ids.length));
  return null;
}

export function applyAction(state: GameState, action: GameAction): ActionResult {
  const reject = (reason: string): ActionResult => ({ ok: false, state, reason });
  if (state.result) return reject('Партия завершена. Начните новую');
  if (action.type === 'hint') {
    if (!possibleAction(state)) return reject(state.history.length ? 'Прямых ходов нет. Используйте отмену' : 'Доступных ходов нет');
    return { ok: true, state: { ...state, hints: state.hints + 1 } };
  }
  if (action.type === 'undo') {
    const entry = state.history.at(-1);
    if (!entry) return reject('Пока нечего отменять');
    const position = clonePosition(state);
    const error = reverseHistory(position, entry);
    if (error) return reject(error);
    return { ok: true, state: { ...state, ...position, history: state.history.slice(0, -1), undos: state.undos + 1 } };
  }
  const position = clonePosition(state);
  let entry: HistoryEntry;
  if (action.type === 'reveal') {
    const tile = position.columns[action.column]?.[0];
    if (!Number.isInteger(action.column) || action.index !== 0 || !tile || tile.open) return reject('Можно раскрыть только верхнюю закрытую фишку');
    tile.open = true;
    entry = { type: 'reveal', column: action.column, id: tile.id };
  } else {
    const error = moveError(state, action);
    if (error) return reject(error);
    const moved = take(position, action.from, action.count);
    put(position, action.to, moved);
    const top = action.from.zone === 'column' ? position.columns[action.from.index]?.[0] : null;
    const autoRevealedId = top && !top.open ? top.id : null;
    if (top && autoRevealedId !== null) top.open = true;
    entry = { type: 'move', from: { ...action.from }, to: { ...action.to }, ids: moved.map(tile => tile.id), autoRevealedId };
  }
  const next: GameState = { ...state, ...position, transfers: state.transfers + (action.type === 'move' ? 1 : 0), history: [...state.history, entry].slice(-state.config.historyLimit) };
  if (isVictory(next)) next.result = { score: scoreFor(next.transfers, next.undos, next.hints), transfers: next.transfers, undos: next.undos, hints: next.hints };
  return { ok: true, state: next };
}
