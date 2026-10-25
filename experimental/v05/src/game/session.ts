import { isValidSave } from './storage.ts';
import { validateDeal } from './deal.ts';
import { verifyClosedProof } from '../solver/solver.ts';
import type { ClosedProof } from '../solver/solver.ts';
import type { CertifiedDeal } from './deal.ts';
import type { GameState } from './types.ts';

export const SESSION_KEY = 'secret-sort:v05:session:v1';
export type Disposition = 'playing' | 'surrendered' | 'proven-lose';
type Port = Pick<Storage, 'getItem' | 'setItem'>;
export interface Session { game: GameState | null; deal: CertifiedDeal | null; disposition: Disposition; warning: string | null; solutionReason: string | null; lossProof: ClosedProof | null }
export async function loadSession(storage: Port): Promise<Session> {
  const empty: Session = { game: null, deal: null, disposition: 'playing', warning: null, solutionReason: null, lossProof: null };
  try {
    const text = storage.getItem(SESSION_KEY); if (!text) return empty;
    if (text.length > 1_000_000) return { ...empty, warning: 'Сохранение слишком большое.' };
    const data = JSON.parse(text);
    if (data.schema !== 1 || !isValidSave(data.game) || !['playing', 'surrendered', 'proven-lose'].includes(data.disposition)) return { ...empty, warning: 'Сохранение партии повреждено.' };
    // Recheck closure, rather than trusting an old persisted assertion of LOSE.
    const lossProof = data.disposition === 'proven-lose' && data.lossProof?.keys?.length <= 8000 && verifyClosedProof(data.game, data.lossProof) ? data.lossProof as ClosedProof : null;
    const disposition = data.disposition === 'proven-lose' && !lossProof ? 'playing' : data.disposition;
    const checked = await validateDeal(data.deal);
    if (!checked.ok || checked.deal.seed !== data.game.seed || checked.deal.difficulty !== data.game.config.reserveCapacity) return { ...empty, game: data.game, disposition, lossProof, solutionReason: checked.ok ? 'Решение относится к другой раскладке.' : checked.reason };
    return { game: data.game, deal: checked.deal, disposition, warning: null, solutionReason: null, lossProof };
  } catch { return { ...empty, warning: 'Сохранение недоступно. Можно играть без него.' }; }
}
export function saveSession(storage: Port, game: GameState, deal: CertifiedDeal | null, disposition: Disposition, lossProof: ClosedProof | null = null): boolean {
  try { storage.setItem(SESSION_KEY, JSON.stringify({ schema: 1, game, deal, disposition, lossProof })); return true; } catch { return false; }
}
