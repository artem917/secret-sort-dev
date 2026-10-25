import { verifyBarrier, verifyWinTrace } from '../generator/barrier.ts';
import { solveForward } from './solver.ts';
import { positionError } from '../game/game.ts';
import { DEFAULT_CONFIG } from '../game/types.ts';
import type { Position, ProofAction, ReserveCapacity } from '../game/types.ts';
import type { BarrierCertificate } from '../generator/barrier.ts';
import type { SearchBudget, SearchReport } from './solver.ts';

export type CertifiedOutcome = SearchReport | { status: 'LOSE'; reason: 'first-unlock-invariant'; certificate: BarrierCertificate; reserve: number; solution: [] } | { status: 'WIN'; reason: 'verified-trace'; solution: ProofAction[] };
/** Proofs and bounded graph search are distinct routes to the same three outcomes. */
export function solveCertified(position: Position, evidence: { lowerBound?: BarrierCertificate; solution?: ProofAction[] } = {}, budget: SearchBudget = {}): CertifiedOutcome {
  const q = position.reserve.length as ReserveCapacity;
  if (positionError(position, { ...DEFAULT_CONFIG, reserveCapacity: q })) throw new Error('Неверная позиция');
  if (position.reserve.every(t => t === null)) {
    if (evidence.lowerBound) {
      const result = verifyBarrier(position.columns, evidence.lowerBound);
      if (result.ok && q < result.required) return { status: 'LOSE', reason: 'first-unlock-invariant', certificate: structuredClone(evidence.lowerBound), reserve: q, solution: [] };
    }
    if (evidence.solution && verifyWinTrace(position.columns, evidence.solution, q).ok) return { status: 'WIN', reason: 'verified-trace', solution: structuredClone(evidence.solution) };
  }
  return solveForward(position, budget);
}
