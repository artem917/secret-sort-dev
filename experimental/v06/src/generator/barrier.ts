import { createGame, applyAction, isVictory, positionError } from '../game/game.ts';
import { verifyPortsBarrier } from './ports-barrier.ts';
import type { Tile, ProofAction, ReserveCapacity } from '../game/types.ts';
export { makePortsCertificate as makeCertificate, verifyPortsBarrier as verifyBarrier } from './ports-barrier.ts';
export type { PortsBarrierCertificate as BarrierCertificate } from './ports-barrier.ts';

export function verifyWinTrace(columns: readonly (readonly Tile[])[], solution: readonly ProofAction[], reserveCapacity: ReserveCapacity) {
  try {
    let state = createGame({ seed: 'verification', columns: structuredClone(columns) as Tile[][], solution: [], algorithm: 'reserve-proof-v6' }, reserveCapacity);
    let reservePeak = 0;
    for (const [index, action] of solution.entries()) {
      if (action.type !== 'move') return { ok: false as const, reason: `non-move-${index}` };
      const next = applyAction(state, action);
      if (!next.ok) return { ok: false as const, reason: `action-${index}: ${next.reason}` };
      state = next.state;
      if (positionError(state, state.config)) return { ok: false as const, reason: `invariant-${index}` };
      reservePeak = Math.max(reservePeak, state.reserve.filter(Boolean).length);
    }
    return isVictory(state) ? { ok: true as const, transfers: state.transfers, manualReveals: 0, reservePeak } : { ok: false as const, reason: 'not-victory' };
  } catch { return { ok: false as const, reason: 'malformed-win-trace' }; }
}
export function classifyMinimum(columns: readonly (readonly Tile[])[], certificate: unknown, solution: readonly ProofAction[]) {
  const lower = verifyPortsBarrier(columns, certificate);
  if (!lower.ok) return lower;
  const positive = verifyWinTrace(columns, solution, lower.required);
  if (!positive.ok) return positive;
  if (positive.reservePeak !== lower.required) return { ok: false as const, reason: 'reserve-peak' };
  return { ok: true as const, minimum: lower.required, positive, lower };
}
