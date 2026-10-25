import { INITIAL_HEIGHTS } from '../game/types.ts';
import type { Level, ProofAction, Tile, TileKind } from '../game/types.ts';

export function normalizeSeed(seed: string): string {
  return seed.trim().slice(0, 64) || 'onboarding';
}

function randomFor(seed: string): () => number {
  let a = 2166136261;
  for (const char of seed) a = Math.imul(a ^ char.charCodeAt(0), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
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

/** Constructed backwards with a strict forward certificate; never a blind shuffle. */
export function generateLevel(rawSeed: string): Level {
  const seed = normalizeSeed(rawSeed);
  const onboarding = seed === 'onboarding';
  const random = randomFor(seed);
  const kinds: TileKind[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const colors = onboarding ? kinds : shuffled(kinds, random);
  const order = onboarding ? [...kinds] : shuffled(kinds, random);
  const columns: Tile[][] = colors.map(kind => Array.from({ length: 12 }, (_, i) => ({ id: kind * 12 + i, kind, open: false })));
  columns.push([]);
  const processed = [9];
  const reverse: { from: number; to: number; count: number }[] = [];
  let free: number = INITIAL_HEIGHTS[9];
  for (const donor of order) {
    const deficit = 12 - INITIAL_HEIGHTS[donor];
    const lower = onboarding ? deficit : Math.min(free, Math.max(deficit + 1, Math.ceil(free * .45)));
    const upper = onboarding ? deficit : Math.max(lower, free - (free > deficit + 1 ? 1 : 0));
    let remaining = onboarding ? deficit : lower + Math.floor(random() * (upper - lower + 1));
    while (remaining > 0) {
      const targets = processed.filter(index => columns[index]!.length < INITIAL_HEIGHTS[index]!);
      const to = targets[Math.floor(random() * targets.length)]!;
      const maximum = Math.min(INITIAL_HEIGHTS[to]! - columns[to]!.length, remaining);
      const count = onboarding ? maximum : 1 + Math.floor(random() * maximum);
      columns[to]!.unshift(...columns[donor]!.splice(0, count));
      reverse.push({ from: donor, to, count });
      remaining -= count;
    }
    processed.push(donor);
    free -= deficit;
  }
  const initial = columns.map(col => col.map(tile => ({ ...tile })));
  const solution: ProofAction[] = [];
  const reveal = (column: number): void => {
    const tile = columns[column]![0];
    if (tile && !tile.open) {
      tile.open = true;
      solution.push({ type: 'reveal', column, index: 0 });
    }
  };
  const move = (from: number, to: number, count: number): void => {
    columns[to]!.unshift(...columns[from]!.splice(0, count));
    solution.push({ type: 'move', from: { zone: 'column', index: from }, to: { zone: 'column', index: to }, count });
  };
  // Invert chunks as singles so each hidden tile can be manually exposed first.
  for (const step of [...reverse].reverse()) {
    for (let i = 0; i < step.count; i++) {
      reveal(step.to);
      reveal(step.from);
      move(step.to, step.from, 1);
    }
  }
  // Rotate homogeneous stacks into the empty column to reveal remaining tiles.
  let empty = 9;
  for (let from = 0; from < 9; from++) {
    if (columns[from]!.every(tile => tile.open)) continue;
    const to = empty;
    let prefix = 0;
    while (columns[from]![prefix]?.open) prefix++;
    if (prefix) move(from, to, prefix);
    while (columns[from]!.length) { reveal(from); move(from, to, 1); }
    empty = from;
  }
  return { seed, columns: initial, solution, algorithm: 'ordered-donor-v1' };
}
