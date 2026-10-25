import { TEMPLATES } from './template-data.ts';
import type { Level, ProofAction, Tile, TileKind } from '../game/types.ts';

export function normalizeSeed(seed: string): string { return seed.trim().slice(0, 64) || 'mixed-v3'; }
function hash(seed: string): number {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}
function randomFor(seed: string): () => number {
  let value = hash(seed);
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(values: T[], random: () => number): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
function openRun(column: Tile[]): number {
  let count = 0;
  while (column[count]?.open && column[count]?.kind === column[0]?.kind) count++;
  return count;
}
function complete(columns: Tile[][]): boolean {
  const full = columns.filter(col => col.length === 12);
  return full.length === 9 && columns.filter(col => !col.length).length === 1 && new Set(full.map(col => col[0]!.kind)).size === 9 && full.every(col => col.every(tile => tile.open && tile.kind === col[0]!.kind));
}

/**
 * 32 structurally distinct verified reverse packet constructions. Symmetries of
 * kind and equal-height columns preserve the proof. No unverified shuffle,
 * almost-sorted fallback or post-solution hidden flushing is admitted.
 */
export function generateLevel(rawSeed: string): Level {
  const seed = normalizeSeed(rawSeed), random = randomFor(seed);
  const template = TEMPLATES[hash(seed) % TEMPLATES.length]!;
  const colors = shuffled<TileKind>([0, 1, 2, 3, 4, 5, 6, 7, 8], random);
  const columns: Tile[][] = colors.map(kind => Array.from({ length: 12 }, (_, i) => ({ id: kind * 12 + i, kind, open: false })));
  columns.push([]);
  for (const [from, to, count] of template.reverse) columns[to]!.unshift(...columns[from]!.splice(0, count));
  const byHeight = (height: number): number[] => shuffled(columns.map((col, i) => col.length === height ? i : -1).filter(i => i >= 0), random);
  const tens = byHeight(10), elevens = byHeight(11);
  if (tens.length !== 2 || elevens.length !== 8) throw new Error('Invalid packet construction heights');
  const order = [tens[0]!, ...elevens, tens[1]!];
  const mapped = Array<number>(10);
  order.forEach((old, index) => { mapped[old] = index; });
  const initial = order.map(old => columns[old]!.map(tile => ({ ...tile })));
  const solution: ProofAction[] = [];
  const reveal = (column: number): void => {
    const tile = columns[column]![0];
    if (tile && !tile.open) { tile.open = true; solution.push({ type: 'reveal', column: mapped[column]!, index: 0 }); }
  };
  const move = (from: number, to: number, count: number): void => {
    columns[to]!.unshift(...columns[from]!.splice(0, count));
    const next = columns[from]![0];
    if (next) next.open = true;
    solution.push({ type: 'move', from: { zone: 'column', index: mapped[from]! }, to: { zone: 'column', index: mapped[to]! }, count });
  };
  let finished = false;
  for (const [to, from, total] of [...template.reverse].reverse()) {
    if (finished) break;
    let remaining = total;
    while (remaining && !finished) {
      reveal(from); reveal(to);
      const count = Math.min(remaining, openRun(columns[from]!));
      if (!count) throw new Error('Invalid packet certificate');
      move(from, to, count); remaining -= count;
      finished = complete(columns);
    }
  }
  if (!finished) throw new Error('Packet certificate did not finish');
  return { seed, columns: initial, solution, algorithm: 'reverse-packets-v3' };
}
