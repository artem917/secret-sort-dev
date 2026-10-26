import { applyAction, positionError } from '../game/game.ts';
import { DEFAULT_CONFIG } from '../game/types.ts';
import type { GameState, Position, ProofAction, ReserveCapacity } from '../game/types.ts';

export interface SearchBudget { maxStates?: number; maxMs?: number }
export interface ClosedProof { version: 1; keys: string[] }
export interface SearchReport {
  status: 'WIN' | 'LOSE' | 'UNKNOWN';
  reason: 'replayable-forward-trace' | 'reachable-graph-exhausted' | 'time-budget' | 'state-budget';
  expanded: number; discovered: number; generated: number; duplicates: number;
  frontier: number; elapsedMs: number; solution: ProofAction[];
  closedProof?: ClosedProof;
}
interface State { cols: string[]; reserve: number[]; key: string }
interface Edge { f: number; t: number; k: number }
interface Node extends State { parent: number; action: Edge | null; depth: number }
const OFFSET = 65;
const kind = (s: string): number => (s.charCodeAt(0) - OFFSET) >> 1;
const isOpen = (s: string): boolean => !!s && ((s.charCodeAt(0) - OFFSET) & 1) === 1;
const encode = (position: Position): string[] => position.columns.map(c => c.map(t => String.fromCharCode(OFFSET + 2 * t.kind + Number(t.open))).join(''));
const openTop = (s: string): string => s && !isOpen(s) ? String.fromCharCode(s.charCodeAt(0) + 1) + s.slice(1) : s;
function run(s: string): number { if (!isOpen(s)) return 0; let n = 1; while (s[n] === s[0]) n++; return n; }
function canonical(cols: string[], reserve: number[]): State {
  const c = [...cols].sort(), r = [...reserve].sort((a, b) => a - b);
  return { cols: c, reserve: r, key: c.join('|') + '#' + r.join(',') };
}
function initial(position: Position): State { return canonical(encode(position).map(openTop), position.reserve.map(t => t?.kind ?? -1)); }
export function canonicalPositionKey(position: Position): string { return initial(position).key; }
function victory(s: State): boolean {
  if (s.reserve.some(k => k >= 0)) return false;
  const full = s.cols.filter(c => c.length === 12);
  return full.length === 9 && s.cols.filter(c => !c).length === 1 && new Set(full.map(kind)).size === 9 && full.every(c => [...c].every(x => x === c[0] && isOpen(x)));
}
// Orders the frontier only. No heuristic removes an edge or declares LOSE.
function priority(s: State, depth: number): number {
  let transitions = 0, hidden = 0, fragments = 0;
  const seenKinds = new Set<number>();
  for (const c of s.cols) {
    let last = -1;
    for (const ch of c) { const n = ch.charCodeAt(0) - OFFSET, k = n >> 1; if (!(n & 1)) hidden++; if (last >= 0 && last !== k) transitions++; last = k; }
    if (c) { fragments++; seenKinds.add(kind(c)); }
  }
  return transitions * 35 + hidden * 2 + s.reserve.filter(k => k >= 0).length * 4 + (fragments - seenKinds.size) * 3 + depth * .015;
}
export function* canonicalSuccessors(s: State): Generator<{ state: State; action: Edge }> {
  const n = s.cols.length, total = n + s.reserve.length;
  const get = (i: number): string => i < n ? s.cols[i]! : s.reserve[i - n]! < 0 ? '' : String.fromCharCode(OFFSET + 2 * s.reserve[i - n]! + 1);
  for (let f = 0; f < total; f++) {
    const source = get(f), length = run(source); if (!length) continue;
    // Every legal packet size, including partial runs and reserve-to-reserve.
    for (let k = 1; k <= length; k++) for (let t = 0; t < total; t++) {
      if (f === t) continue;
      const target = get(t);
      if (t >= n) { if (k !== 1 || target) continue; }
      else if (target.length + k > 12 || target && target[0] !== source[0]) continue;
      const cols = [...s.cols], reserve = [...s.reserve], packet = source.slice(0, k);
      if (f < n) cols[f] = openTop(source.slice(k)); else reserve[f - n] = -1;
      if (t < n) cols[t] = packet + target; else reserve[t - n] = kind(packet);
      yield { state: canonical(cols, reserve), action: { f, t, k } };
    }
  }
}
class Heap {
  values: { id: number; p: number }[] = [];
  push(value: { id: number; p: number }): void {
    const a = this.values; a.push(value); let i = a.length - 1;
    while (i) { const p = (i - 1) >> 1; if (a[p]!.p <= value.p) break; a[i] = a[p]!; i = p; } a[i] = value;
  }
  pop(): { id: number; p: number } {
    const a = this.values, root = a[0]!, last = a.pop()!;
    if (a.length) { let i = 0; while (true) { let c = i * 2 + 1; if (c >= a.length) break; if (c + 1 < a.length && a[c + 1]!.p < a[c]!.p) c++; if (a[c]!.p >= last.p) break; a[i] = a[c]!; i = c; } a[i] = last; } return root;
  }
  get length(): number { return this.values.length; }
}
function lift(position: Position, moves: Edge[]): ProofAction[] {
  let actual: GameState = { ...structuredClone(position), version: 3, generator: 'reserve-proof-v6', runId: 'solver-replay', seed: 'solver-replay', config: { ...DEFAULT_CONFIG, reserveCapacity: position.reserve.length as ReserveCapacity }, transfers: 0, undos: 0, hints: 0, history: [], result: null };
  const solution: ProofAction[] = [];
  const apply = (action: ProofAction): void => { const result = applyAction(actual, action); if (!result.ok) throw new Error(`Solver trace rejected: ${result.reason}`); actual = result.state; solution.push(action); };
  // Free exposed-top reveals commute with legal moves and only add choices.
  for (let column = 0; column < actual.columns.length; column++) if (actual.columns[column]![0] && !actual.columns[column]![0]!.open) apply({ type: 'reveal', column, index: 0 });
  for (const { f, t, k } of moves) {
    const columns = encode(actual).map((value, index) => ({ value, index })).sort((a, b) => a.value < b.value ? -1 : a.value > b.value ? 1 : a.index - b.index);
    const reserve = actual.reserve.map((tile, index) => ({ value: tile?.kind ?? -1, index })).sort((a, b) => a.value - b.value || a.index - b.index);
    const loc = (i: number) => i < 10 ? { zone: 'column' as const, index: columns[i]!.index } : { zone: 'reserve' as const, index: reserve[i - 10]!.index };
    apply({ type: 'move', from: loc(f), to: loc(t), count: k });
  }
  if (!victory(initial(actual))) throw new Error('Solver trace failed victory verification');
  return solution;
}

/**
 * Exact forward reachability, WITHOUT Undo. WIN has a real-engine replay;
 * LOSE requires exhausting the entire reachable canonical graph. Any bound
 * interruption is UNKNOWN. Column/slot permutations and identical-kind IDs
 * are symmetries; no solved-column, packet-size, depth or cycle pruning.
 */
export function solveForward(position: Position, { maxStates = 80_000, maxMs = 8_000 }: SearchBudget = {}): SearchReport {
  if (!Number.isInteger(maxStates) || maxStates < 1 || !Number.isFinite(maxMs) || maxMs < 0) throw new Error('Invalid search budget');
  const error = positionError(position, { ...DEFAULT_CONFIG, reserveCapacity: position.reserve.length as ReserveCapacity });
  if (error || ![0, 1, 2, 3, 4].includes(position.reserve.length)) throw new Error(error ?? 'Invalid reserve');
  const start = performance.now(), root = initial(position), nodes: Node[] = [{ ...root, parent: -1, action: null, depth: 0 }], seen = new Map([[root.key, 0]]), heap = new Heap();
  heap.push({ id: 0, p: priority(root, 0) }); let expanded = 0, generated = 0, duplicates = 0;
  const report = (status: SearchReport['status'], reason: SearchReport['reason'], solution: ProofAction[] = []): SearchReport => ({ status, reason, expanded, discovered: nodes.length, generated, duplicates, frontier: heap.length, elapsedMs: performance.now() - start, solution });
  const win = (id: number): SearchReport => { const moves: Edge[] = []; for (let i = id; nodes[i]!.parent >= 0; i = nodes[i]!.parent) moves.push(nodes[i]!.action!); moves.reverse(); return report('WIN', 'replayable-forward-trace', lift(position, moves)); };
  if (victory(root)) return win(0);
  while (heap.length) {
    if (performance.now() - start >= maxMs) return report('UNKNOWN', 'time-budget');
    const current = heap.pop(), node = nodes[current.id]!; expanded++;
    for (const { state, action } of canonicalSuccessors(node)) {
      generated++;
      if (seen.has(state.key)) { duplicates++; continue; }
      if (nodes.length >= maxStates) return report('UNKNOWN', 'state-budget');
      const id = nodes.length, depth = node.depth + 1; nodes.push({ ...state, parent: current.id, action, depth }); seen.set(state.key, id);
      if (victory(state)) return win(id);
      heap.push({ id, p: priority(state, depth) });
      if ((generated & 255) === 0 && performance.now() - start >= maxMs) return report('UNKNOWN', 'time-budget');
    }
  }
  return { ...report('LOSE', 'reachable-graph-exhausted'), closedProof: { version: 1, keys: [...seen.keys()] } };
}

/** Check closure independently, including every edge back into a cycle. */
export function verifyClosedProof(position: Position, proof: ClosedProof): boolean {
  try {
    if (positionError(position, { ...DEFAULT_CONFIG, reserveCapacity: position.reserve.length as ReserveCapacity }) || proof?.version !== 1 || !Array.isArray(proof.keys) || !proof.keys.length) return false;
    const keys = new Set(proof.keys);
    if (!keys.has(initial(position).key)) return false;
    for (const key of keys) {
      const parts = key.split('#'); if (parts.length !== 2) return false;
      const cols = parts[0]!.split('|'), reserve = parts[1] === '' ? [] : parts[1]!.split(',').map(Number);
      if (cols.length !== 10 || reserve.length !== position.reserve.length || cols.some(c => c.length > 12 || !/^[A-R]*$/.test(c) || c && !isOpen(c)) || reserve.some(k => !Number.isInteger(k) || k < -1 || k > 8)) return false;
      const counts = Array<number>(9).fill(0);
      for (const c of cols) { let hidden = false; for (const ch of c) { if (!isOpen(ch)) hidden = true; else if (hidden) return false; counts[kind(ch)]!++; } }
      for (const k of reserve) if (k >= 0) counts[k]!++;
      const state = canonical(cols, reserve);
      if (counts.some(n => n !== 12) || state.key !== key || victory(state)) return false;
      for (const { state: next } of canonicalSuccessors(state)) if (!keys.has(next.key)) return false;
    }
    return true;
  } catch { return false; }
}
