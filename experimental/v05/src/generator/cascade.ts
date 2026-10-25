import { applyAction, createGame, isVictory, positionError, topRun } from '../game/game.ts';
import type { Level, Location, ProofAction, Tile, TileKind } from '../game/types.ts';

export type ReserveClass = 1 | 2 | 3 | 4;
export interface CascadeConfig { shortDeficits: number[]; longDeficits: number[] }
export interface CascadeConstruction {
  columns: Tile[][];
  solution: ProofAction[];
  config: CascadeConfig;
  seed: string;
  structuralFingerprint: string;
  mixedColumns: number;
  reservePeak: number;
}

const columnAt = (index: number): Location => ({ zone: 'column', index });
const reserveAt = (index: number): Location => ({ zone: 'reserve', index });
const requireCondition = (value: unknown, message: string): void => { if (!value) throw new Error(message); };

/** A deficit of1 denotes height11, deficit2 height10. Across both chains
 * there are six1s and two2s, totaling10. Short/long sums are10-k andk. */
export function configsFor(k: ReserveClass): CascadeConfig[] {
  requireCondition(Number.isInteger(k) && k >= 1 && k <= 4, 'Invalid reserve class');
  const configs: CascadeConfig[] = [];
  for (let first = 0; first < 8; first++) for (let second = first + 1; second < 8; second++) {
    const deficits = Array.from({ length: 8 }, (_, index) => index === first || index === second ? 2 : 1);
    let total = 0;
    for (let index = 0; index < 7; index++) {
      total += deficits[index]!;
      if (total === 10 - k) { configs.push({ shortDeficits: deficits.slice(0, index + 1), longDeficits: deficits.slice(index + 1) }); break; }
      if (total > 10 - k) break;
    }
  }
  return configs;
}

function equalityFingerprint(columns: readonly (readonly Tile[])[]): string {
  return columns.map(column => {
    let bits = `${column.length}:`;
    for (let a = 0; a < column.length; a++) for (let b = a + 1; b < column.length; b++) bits += Number(column[a]!.kind === column[b]!.kind);
    return bits;
  }).sort().join('|');
}

/** Every round is equivariant to a global kind relabeling and a column
 * permutation. Different full strings therefore prove non-equivalence.
 * IDs are deliberately excluded. This is an invariant, not a complete
 * graph-isomorphism test; equal strings alone do not prove equivalence. */
export function structuralFingerprint(columns: readonly (readonly Tile[])[]): string {
  let labels = Array<number>(9).fill(0);
  for (let round = 0; round < 12; round++) {
    const words = columns.map(column => column.map(tile => labels[tile.kind]).join(','));
    const signatures = Array.from({ length: 9 }, (_, kind) => columns.flatMap((column, columnIndex) =>
      column.flatMap((tile, index) => tile.kind === kind ? [`${words[columnIndex]}@${index}`] : [])).sort().join(';'));
    const unique = [...new Set(signatures)].sort();
    labels = signatures.map(signature => unique.indexOf(signature));
  }
  return equalityFingerprint(columns) + '#' + columns.map(column => column.map(tile => labels[tile.kind]).join(',')).sort().join('|');
}

/** Builds the real108-tile layout and records a current-engine winning trace.
 * No search, precomputed JSON, fs, crypto, Node API, or fake reveal is used.
 * The caller should bind its lower-bound certificate after any seed relabeling.
 * The internal algorithm label is the frozenv04 label; callers can name the
 * returned construction in their ownv05 Level envelope. */
export function constructionFor(k: ReserveClass, variantIndex: number): CascadeConstruction {
  const configs = configsFor(k);
  requireCondition(Number.isInteger(variantIndex) && variantIndex >= 0 && variantIndex < configs.length, 'Invalid cascade variant');
  const config = configs[variantIndex]!;
  const deltas = [...config.shortDeficits, ...config.longDeficits];
  const available: Record<number, number[]> = { 1: [3, 4, 5, 6, 7, 8], 2: [0, 9] };
  const ports = deltas.map((delta, index) => ({ delta, column: available[delta]!.shift()!, kind: (index + 1) as TileKind, prefix: 0 }));
  const short = ports.slice(0, config.shortDeficits.length), long = ports.slice(config.shortDeficits.length);
  const kinds: TileKind[][] = Array.from({ length: 10 }, () => []);
  kinds[1] = [...Array<TileKind>(k + 1).fill(0), ...Array<TileKind>(10 - k).fill(short[0]!.kind)];
  kinds[2] = [...Array<TileKind>(11 - k).fill(0), ...Array<TileKind>(k).fill(long[0]!.kind)];
  for (const [chain, start] of [[short, 10 - k], [long, k]] as const) {
    let incoming = start;
    for (let index = 0; index < chain.length; index++) {
      const port = chain[index]!, outgoing = incoming - port.delta;
      port.prefix = 12 - incoming;
      requireCondition(outgoing >= 0 && (index < chain.length - 1 || outgoing === 0), 'Invalid cascade chain');
      kinds[port.column] = [...Array<TileKind>(port.prefix).fill(port.kind), ...Array<TileKind>(outgoing).fill(chain[index + 1]?.kind ?? port.kind)];
      incoming = outgoing;
    }
  }
  const used = Array<number>(9).fill(0);
  const columns: Tile[][] = kinds.map(column => column.map(kind => ({ id: kind * 12 + used[kind]!++, kind, open: false })));
  requireCondition(used.every(count => count === 12), 'Cascade inventory mismatch');
  const seed = `cascade-r${k}-${config.shortDeficits.join('')}-${config.longDeficits.join('')}`;
  const level: Level = { seed, columns, solution: [], algorithm: 'reserve-proof-v5' };
  let state = createGame(level, k);
  const solution: ProofAction[] = [];
  let reservePeak = 0;
  const emit = (action: ProofAction): void => {
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(`Cascade action${solution.length}: ${result.reason}`);
    state = result.state;
    const error = positionError(state, state.config); if (error) throw new Error(error);
    solution.push(action); reservePeak = Math.max(reservePeak, state.reserve.filter(Boolean).length);
  };
  const move = (from: Location, to: Location, count = 1): void => emit({ type: 'move', from, to, count });
  for (let column = 0; column < 10; column++) emit({ type: 'reveal', column, index: 0 });
  for (let slot = 0; slot < k; slot++) move(columnAt(1), reserveAt(slot));
  move(columnAt(1), columnAt(2));
  const cascade = (chain: typeof ports, first: number): number => {
    let target = first;
    for (const port of chain) { for (let tile = 0; tile < port.prefix; tile++) move(columnAt(port.column), columnAt(target)); target = port.column; }
    return target;
  };
  const empty = cascade(short, 1);
  while (state.columns[2]![0]?.kind === 0) move(columnAt(2), columnAt(empty));
  for (let slot = 0; slot < k; slot++) move(reserveAt(slot), columnAt(empty));
  cascade(long, 2);
  // Homogeneous incoming tails remain hidden underneath the merged prefix.
  // Rotate the actual empty column through them using legal moves to reveal.
  for (let guard = 0; !isVictory(state) && guard < 10; guard++) {
    const from = state.columns.findIndex(column => column.some(tile => !tile.open));
    const to = state.columns.findIndex(column => column.length === 0);
    requireCondition(from >= 0 && to >= 0, 'Cascade cleanup missing empty column');
    while (state.columns[from]!.length) move(columnAt(from), columnAt(to), topRun(state, columnAt(from)));
  }
  requireCondition(isVictory(state), 'Cascade certificate did not win');
  return { columns, solution, config: { shortDeficits: [...config.shortDeficits], longDeficits: [...config.longDeficits] }, seed, structuralFingerprint: structuralFingerprint(columns), mixedColumns: columns.filter(column => new Set(column.map(tile => tile.kind)).size > 1).length, reservePeak };
}
