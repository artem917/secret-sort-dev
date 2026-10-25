import { solveForward } from '../solver/solver.ts';
import { verifyLevel } from './verify.ts';
import { INITIAL_HEIGHTS } from '../game/types.ts';
import type { Level, Tile, TileKind } from '../game/types.ts';
import type { SearchBudget, SearchReport } from '../solver/solver.ts';

export const normalizeSeed = (seed: string): string => seed.trim().slice(0, 64) || 'shuffle-0';
export function shuffleLevel(rawSeed: string): Level {
  const seed = normalizeSeed(rawSeed);
  let value = 2166136261; for (const c of seed) value = Math.imul(value ^ c.charCodeAt(0), 16777619);
  const random = (): number => { value = (value + 0x6d2b79f5) | 0; let t = Math.imul(value ^ (value >>> 15), 1 | value); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const tiles: Tile[] = Array.from({ length: 108 }, (_, id) => ({ id, kind: Math.floor(id / 12) as TileKind, open: false }));
  for (let i = tiles.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [tiles[i], tiles[j]] = [tiles[j]!, tiles[i]!]; }
  let offset = 0;
  return { seed, columns: INITIAL_HEIGHTS.map(height => { const column = tiles.slice(offset, offset + height); offset += height; return column; }), solution: [], algorithm: 'full-shuffle-v4' };
}
export type GenerationResult = { status: 'WIN'; level: Level; report: SearchReport } | { status: 'LOSE' | 'UNKNOWN'; report: SearchReport };
/** One seed always identifies one full shuffle. Never substitute on timeout. */
export function generateVerifiedLevel(seed: string, budget: SearchBudget = {}): GenerationResult {
  const level = shuffleLevel(seed), report = solveForward({ columns: level.columns, reserve: [null, null, null, null] }, budget);
  if (report.status !== 'WIN') return { status: report.status, report };
  level.solution = report.solution;
  if (!verifyLevel(level, 4)) throw new Error('Admission certificate failed independent replay');
  return { status: 'WIN', level, report };
}
