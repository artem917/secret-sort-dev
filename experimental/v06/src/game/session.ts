import { isValidSave } from './storage.ts';
import { validateDeal, upgradeV05Deal } from './deal.ts';
import { isValidSave as validV05 } from '../../../v05/src/game/storage.ts';
import type { CertifiedDeal } from './deal.ts';
import type { GameState } from './types.ts';

export const SESSION_KEY = 'secret-sort:v06:session:v2';
export type Disposition = 'playing' | 'surrendered';
type Port = Pick<Storage, 'getItem' | 'setItem'>;
export interface Session { game: GameState | null; deal: CertifiedDeal | null; disposition: Disposition; warning: string | null; solutionReason: string | null }
export async function loadSession(storage: Port): Promise<Session> {
  const empty: Session = { game: null, deal: null, disposition: 'playing', warning: null, solutionReason: null };
  try {
    const text = storage.getItem(SESSION_KEY); if (!text) return empty;
    if (text.length > 1_000_000) return { ...empty, warning: 'Сохранение слишком большое.' };
    const data = JSON.parse(text);
    if (data.schema === 1 && validV05(data.game)) {
      const converted = await upgradeV05Deal(data.deal);
      if (!converted || converted.seed !== data.game.seed || converted.difficulty !== data.game.config.reserveCapacity) return { ...empty, warning: 'Старое сохранение не прошло проверку.' };
      const tops = new Set(converted.columns.map(c => c[0]!.id));
      data.game = { ...data.game, version: 3, generator: 'reserve-proof-v6', history: data.game.history.filter((e: {type: string; id?: number}) => e.type !== 'reveal' || !tops.has(e.id!)) };
      for (const col of data.game.columns) if (col[0] && tops.has(col[0].id)) col[0].open = true;
      data.deal = converted;
    }
    if (![1,2].includes(data.schema) || !isValidSave(data.game) || !['playing', 'surrendered', 'proven-lose'].includes(data.disposition)) return { ...empty, warning: 'Сохранение партии повреждено.' };
    // Only an explicit player surrender can persist an ended disposition.
    // A legacy solver flag and its proof never control whether play is allowed.
    const disposition: Disposition = data.disposition === 'surrendered' ? 'surrendered' : 'playing';
    const checked = await validateDeal(data.deal);
    if (!checked.ok || checked.deal.seed !== data.game.seed || checked.deal.difficulty !== data.game.config.reserveCapacity) return { ...empty, game: data.game, disposition, solutionReason: checked.ok ? 'Решение относится к другой раскладке.' : checked.reason };
    return { game: data.game, deal: checked.deal, disposition, warning: null, solutionReason: null };
  } catch { return { ...empty, warning: 'Сохранение недоступно. Можно играть без него.' }; }
}
export function saveSession(storage: Port, game: GameState, deal: CertifiedDeal | null, disposition: Disposition): boolean {
  try { storage.setItem(SESSION_KEY, JSON.stringify({ schema: 2, game, deal, disposition })); return true; } catch { return false; }
}
