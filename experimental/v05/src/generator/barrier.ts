import { createGame, applyAction, isVictory, positionError } from '../game/game.ts';
import type { Tile, TileKind, ProofAction } from '../game/types.ts';

export type RequiredReserve = 1 | 2 | 3 | 4;
export type ReserveCapacity = 0 | RequiredReserve;
export interface BarrierPort { column: number; kind: TileKind; prefix: number }
export interface BarrierCertificate {
  schema: 'reserve-barrier-v1';
  required: RequiredReserve;
  gateKind: TileKind;
  gateColumns: [number, number];
  gatePrefixes: [number, number];
  otherPorts: BarrierPort[];
  blockedReserve: ReserveCapacity;
  capacity: 12;
  initialHeights: number[];
  /** Collision-free binding to the complete top-first initial tile-ID layout. */
  layoutKey: string;
}
export type BarrierVerification = {
  ok: true;
  required: RequiredReserve;
  blockedReserve: ReserveCapacity;
  minimumReserveForFirstUnlock: number;
  gateReserveFloors: [number, number];
  otherReserveFloors: number[];
  theorem: string;
} | { ok: false; reason: string };
export type WinTraceVerification = {
  ok: true; transfers: number; manualReveals: number; reservePeak: number;
} | { ok: false; reason: string };
export type MinimumClassification = {
  ok: true;
  minimum: RequiredReserve;
  positive: { capacity: RequiredReserve; status: 'WIN'; proof: 'actual-engine-replay'; transfers: number; manualReveals: number; reservePeak: number };
  lower: { capacity: ReserveCapacity; status: 'LOSE'; proof: 'reserve-barrier-v1'; verification: Extract<BarrierVerification, { ok: true }> };
} | { ok: false; reason: string };

type InitialColumns = readonly (readonly Tile[])[];
export const INITIAL_BARRIER_HEIGHTS = [10, 11, 11, 11, 11, 11, 11, 11, 11, 10] as const;
export const layoutKey = (columns: InitialColumns): string => columns.map(c => c.map(t => t.id).join(',')).join('|');
const prefix = (column: readonly Tile[]): number => { if (!column.length) return 0; let n = 1; while (column[n]?.kind === column[0]!.kind) n++; return n; };
const invalid = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

export function makeCertificate(columns: InitialColumns, required: RequiredReserve, gateKind: TileKind = 0, gateColumns: [number, number] = [1, 2]): BarrierCertificate {
  if (columns.length !== 10 || columns.some(c => !c.length)) throw new Error('Certificate requires ten nonempty columns');
  return {
    schema: 'reserve-barrier-v1', required, gateKind, gateColumns: [...gateColumns],
    gatePrefixes: [prefix(columns[gateColumns[0]]!), prefix(columns[gateColumns[1]]!)],
    otherPorts: columns.map((c, column) => ({ column, kind: c[0]!.kind, prefix: prefix(c) })).filter(p => !gateColumns.includes(p.column)),
    blockedReserve: (required - 1) as ReserveCapacity, capacity: 12, initialHeights: [...INITIAL_BARRIER_HEIGHTS], layoutKey: layoutKey(columns),
  };
}

/** Lower-bound checker. It derives the obstruction from actual tile prefixes;
 * no asserted numerical lower bound is trusted. This does not claim WIN at k.
 */
export function verifyBarrier(columns: InitialColumns, certificate: unknown, claimedReserve?: number): BarrierVerification {
  try {
    if (!certificate || typeof certificate !== 'object') return invalid('schema-or-required');
    const c = certificate as BarrierCertificate, k = c.required;
    if (c.schema !== 'reserve-barrier-v1' || !Number.isInteger(k) || k < 1 || k > 4) return invalid('schema-or-required');
    const allowed = ['schema', 'required', 'gateKind', 'gateColumns', 'gatePrefixes', 'otherPorts', 'blockedReserve', 'capacity', 'initialHeights', 'layoutKey'];
    if (Object.keys(c).some(key => !allowed.includes(key)) || allowed.some(key => !Object.prototype.hasOwnProperty.call(c, key))) return invalid('certificate-fields');
    const q = claimedReserve ?? c.blockedReserve;
    if (c.capacity !== 12 || c.blockedReserve !== k - 1 || q !== k - 1) return invalid('capacity-claim');
    if (JSON.stringify(c.initialHeights) !== JSON.stringify(INITIAL_BARRIER_HEIGHTS) || !Array.isArray(columns) || columns.length !== 10 || columns.some((col, i) => !Array.isArray(col) || col.length !== INITIAL_BARRIER_HEIGHTS[i])) return invalid('initial-heights');
    const all = columns.flat(), ids = new Set<number>(), counts = Array<number>(9).fill(0);
    for (const tile of all) {
      if (!tile || tile.open !== false || !Number.isInteger(tile.id) || tile.id < 0 || tile.id >= 108 || !Number.isInteger(tile.kind) || tile.kind < 0 || tile.kind > 8 || Math.floor(tile.id / 12) !== tile.kind || ids.has(tile.id)) return invalid('inventory-or-hidden');
      ids.add(tile.id); counts[tile.kind]!++;
    }
    if (all.length !== 108 || ids.size !== 108 || counts.some(n => n !== 12)) return invalid('inventory-counts');
    if (c.layoutKey !== layoutKey(columns)) return invalid('layout-binding');
    if (!Number.isInteger(c.gateKind) || c.gateKind < 0 || c.gateKind > 8 || !Array.isArray(c.gateColumns) || c.gateColumns.length !== 2 || new Set(c.gateColumns).size !== 2 || c.gateColumns.some(i => !Number.isInteger(i) || i < 0 || i >= 10 || columns[i]!.length !== 11)) return invalid('gate-columns');
    const gates = c.gateColumns.map(i => columns[i]!), actual = gates.map(prefix);
    if (gates.some(col => col[0]!.kind !== c.gateKind) || JSON.stringify(actual) !== JSON.stringify([k + 1, 11 - k]) || JSON.stringify(c.gatePrefixes) !== JSON.stringify(actual) || actual.some((n, i) => n >= gates[i]!.length) || actual[0]! + actual[1]! !== 12) return invalid('gate-prefixes');
    if (!Array.isArray(c.otherPorts) || c.otherPorts.length !== 8) return invalid('other-ports');
    const seenColumns = new Set(c.gateColumns), seenKinds = new Set<number>([c.gateKind]), floors: number[] = [];
    for (const port of c.otherPorts) {
      if (!port || Object.keys(port).sort().join(',') !== 'column,kind,prefix' || !Number.isInteger(port.column) || port.column < 0 || port.column >= 10 || seenColumns.has(port.column)) return invalid('port-columns');
      const col = columns[port.column]!, n = prefix(col);
      if (port.kind !== col[0]!.kind || seenKinds.has(port.kind) || port.prefix !== n || n < k) return invalid('port-prefixes');
      seenColumns.add(port.column); seenKinds.add(port.kind); floors.push(n);
    }
    if (seenColumns.size !== 10 || seenKinds.size !== 9) return invalid('port-coverage');
    // Until a fixed initial suffix is exposed (or a pure port emptied), every
    // non-gate kind has one port; emptying it needs its full prefix in reserve.
    // All twelve gate tiles must fit above the other gate's fixed suffix plus
    // reserve. Incoming same-kind tiles do not evade this total-mass argument.
    const gateFloors: [number, number] = [gates[1]!.length - actual[1]!, gates[0]!.length - actual[0]!];
    const minimum = Math.min(...floors, ...gateFloors);
    if (minimum !== k || gateFloors.some(n => n <= q) || floors.some(n => n <= q)) return invalid('first-unlock-bound');
    return { ok: true, required: k, blockedReserve: q as ReserveCapacity, minimumReserveForFirstUnlock: minimum, gateReserveFloors: gateFloors, otherReserveFloors: floors,
      theorem: 'No first fixed-suffix exposure or empty port is possible below this reserve floor; the nonwinning initial position cannot reach victory without such an unlock.' };
  } catch { return invalid('malformed-certificate'); }
}

export function verifyWinTrace(columns: InitialColumns, solution: readonly ProofAction[], reserveCapacity: ReserveCapacity): WinTraceVerification {
  try {
    if (!Array.isArray(solution) || !Number.isInteger(reserveCapacity) || reserveCapacity < 0 || reserveCapacity > 4) return invalid('win-input');
    let state = createGame({ seed: 'barrier-verification', columns: columns.map(c => c.map(t => ({ ...t }))), solution: [], algorithm: 'reserve-proof-v5' }, reserveCapacity);
    let reservePeak = 0, manualReveals = 0;
    for (const [index, action] of solution.entries()) {
      if (!action || action.type !== 'move' && action.type !== 'reveal') return invalid(`forbidden-proof-action-${index}`);
      const next = applyAction(state, action);
      if (!next.ok) return invalid(`action-${index}: ${next.reason}`);
      state = next.state;
      const error = positionError(state, state.config); if (error) return invalid(`invariant-${index}: ${error}`);
      reservePeak = Math.max(reservePeak, state.reserve.filter(Boolean).length);
      if (action.type === 'reveal') manualReveals++;
    }
    return isVictory(state) ? { ok: true, transfers: state.transfers, manualReveals, reservePeak } : invalid('not-victory');
  } catch { return invalid('malformed-win-trace'); }
}

/** Exact Rmin classification from two independently checked proofs. Invalid
 * data returns no classification. No search timeout is ever interpreted LOSE.
 */
export function classifyMinimum(columns: InitialColumns, certificate: unknown, solution: readonly ProofAction[]): MinimumClassification {
  const lower = verifyBarrier(columns, certificate);
  if (!lower.ok) return invalid(`lower: ${lower.reason}`);
  const positive = verifyWinTrace(columns, solution, lower.required);
  if (!positive.ok) return invalid(`positive: ${positive.reason}`);
  if (positive.reservePeak !== lower.required) return invalid('positive-reserve-peak');
  return { ok: true, minimum: lower.required,
    positive: { capacity: lower.required, status: 'WIN', proof: 'actual-engine-replay', transfers: positive.transfers, manualReveals: positive.manualReveals, reservePeak: positive.reservePeak },
    lower: { capacity: lower.blockedReserve, status: 'LOSE', proof: 'reserve-barrier-v1', verification: lower } };
}
