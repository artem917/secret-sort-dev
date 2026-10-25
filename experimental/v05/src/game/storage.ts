import { clonePosition, isVictory, positionError, reverseHistory, scoreFor } from './game.ts';
import type { GameState, RecordEntry, Records, Settings } from './types.ts';

export const SAVE_KEY = 'secret-sort:v05:game:v2';
export const SETTINGS_KEY = 'secret-sort:v05:settings:v1';
export const RECORDS_KEY = 'secret-sort:v05:records:v1';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export const emptyRecords = (): Records => ({ wins: 0, bestScore: null, fewestMoves: null, completedRuns: [] });
const counter = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1_000_000_000;

export function isValidSave(value: unknown): value is GameState {
  try {
    const s = value as GameState;
    if (!s || s.version !== 2 || s.generator !== 'reserve-proof-v5' || typeof s.seed !== 'string' || !s.seed.length || s.seed.length > 64 || typeof s.runId !== 'string' || s.runId.length > 150 || !s.runId.length || !s.config || s.config.columns !== 10 || s.config.capacity !== 12 || s.config.historyLimit !== 80 || ![0, 1, 2, 3, 4].includes(s.config.reserveCapacity) || !counter(s.transfers) || !counter(s.undos) || !counter(s.hints) || !Array.isArray(s.history) || s.history.length > 80 || positionError(s, s.config)) return false;
    const replay = clonePosition(s);
    for (const entry of [...s.history].reverse()) {
      if (!entry || !['move', 'reveal'].includes(entry.type) || reverseHistory(replay, entry) || positionError(replay, s.config)) return false;
    }
    if (s.result === null) return !isVictory(s);
    return isVictory(s) && s.result.score === scoreFor(s.transfers, s.undos, s.hints) && s.result.transfers === s.transfers && s.result.undos === s.undos && s.result.hints === s.hints;
  } catch { return false; }
}

export function loadGame(storage: StoragePort): { game: GameState | null; warning: string | null } {
  try {
    const text = storage.getItem(SAVE_KEY);
    if (!text) return { game: null, warning: null };
    if (text.length > 300_000) return { game: null, warning: 'Сохранение слишком большое. Можно начать новую партию' };
    const data: unknown = JSON.parse(text);
    if (!isValidSave(data)) return { game: null, warning: 'Сохранение повреждено или устарело. Можно начать новую партию' };
    return { game: data, warning: null };
  } catch { return { game: null, warning: 'Сохранение недоступно. Можно играть без него' }; }
}

export function saveGame(storage: StoragePort, game: GameState): boolean {
  try { storage.setItem(SAVE_KEY, JSON.stringify(game)); return true; } catch { return false; }
}

export function loadSettings(storage: StoragePort, reducedMotion = false): Settings {
  const fallback: Settings = { sound: true, animations: !reducedMotion, reserveCapacity: 1, tutorialSeen: false };
  try {
    const data = JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null') as Settings | null;
    return data && typeof data.sound === 'boolean' && typeof data.animations === 'boolean' && [0, 1, 2, 3, 4].includes(data.reserveCapacity) && typeof data.tutorialSeen === 'boolean' ? { sound: data.sound, animations: data.animations, reserveCapacity: data.reserveCapacity, tutorialSeen: data.tutorialSeen } : fallback;
  } catch { return fallback; }
}

export function saveSettings(storage: StoragePort, settings: Settings): boolean {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; } catch { return false; }
}

function validRecord(value: RecordEntry | null): boolean {
  return value === null || (!!value && typeof value.seed === 'string' && value.seed.length <= 64 && typeof value.runId === 'string' && typeof value.date === 'string' && counter(value.transfers) && counter(value.undos) && counter(value.hints) && value.score === scoreFor(value.transfers, value.undos, value.hints));
}

export function loadRecords(storage: StoragePort): Records {
  try {
    const data = JSON.parse(storage.getItem(RECORDS_KEY) ?? 'null') as Records | null;
    if (!data || !counter(data.wins) || !validRecord(data.bestScore) || !validRecord(data.fewestMoves) || !Array.isArray(data.completedRuns) || data.completedRuns.length > 100 || data.completedRuns.some(id => typeof id !== 'string')) return emptyRecords();
    return data;
  } catch { return emptyRecords(); }
}

export function recordVictory(records: Records, game: GameState, date: string): Records {
  if (!game.result || !isVictory(game) || records.completedRuns.includes(game.runId)) return records;
  const result: RecordEntry = { ...game.result, seed: game.seed, runId: game.runId, date, generator: game.generator };
  return { wins: records.wins + 1,
    bestScore: !records.bestScore || result.score > records.bestScore.score ? result : records.bestScore,
    fewestMoves: !records.fewestMoves || result.transfers < records.fewestMoves.transfers ? result : records.fewestMoves,
    completedRuns: [...records.completedRuns, game.runId].slice(-100) };
}

export function saveRecords(storage: StoragePort, records: Records): boolean {
  try { storage.setItem(RECORDS_KEY, JSON.stringify(records)); return true; } catch { return false; }
}
