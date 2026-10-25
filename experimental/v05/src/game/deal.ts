import { createGame } from './game.ts';
import { verifyLevel } from '../generator/verify.ts';
import { verifyBarrier } from '../generator/barrier.ts';
import type { BarrierCertificate } from '../generator/barrier.ts';
import type { Difficulty, Level, Tile, ProofAction } from './types.ts';

export interface CertifiedDeal {
  schema: 1; algorithm: 'reserve-proof-v5'; algorithmVersion: 1;
  id: string; seed: string; difficulty: Difficulty; columns: Tile[][];
  solution: ProofAction[]; certificate: BarrierCertificate; integrity: string;
}
export const levelFor = (deal: CertifiedDeal): Level => ({ seed: deal.seed, algorithm: deal.algorithm, columns: structuredClone(deal.columns), solution: structuredClone(deal.solution) });
function payload(deal: CertifiedDeal): string {
  return JSON.stringify({ schema: deal.schema, algorithm: deal.algorithm, algorithmVersion: deal.algorithmVersion, id: deal.id, seed: deal.seed, difficulty: deal.difficulty, columns: deal.columns, solution: deal.solution, certificate: deal.certificate });
}
export async function integrityFor(deal: CertifiedDeal): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload(deal)));
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function sealDeal(deal: Omit<CertifiedDeal, 'integrity'>): Promise<CertifiedDeal> {
  const value = { ...structuredClone(deal), integrity: '' }; value.integrity = await integrityFor(value); return value;
}
export async function validateDeal(value: unknown): Promise<{ ok: true; deal: CertifiedDeal } | { ok: false; reason: string }> {
  try {
    const d = value as CertifiedDeal;
    if (!d || d.schema !== 1 || d.algorithm !== 'reserve-proof-v5' || d.algorithmVersion !== 1 || typeof d.id !== 'string' || !d.id.length || d.id.length > 150 || typeof d.seed !== 'string' || !d.seed.length || d.seed.length > 64 || ![1, 2, 3, 4].includes(d.difficulty) || typeof d.integrity !== 'string' || !/^[0-9a-f]{64}$/.test(d.integrity)) return { ok: false, reason: 'Исходная раскладка или версия решения недоступна.' };
    if (await integrityFor(d) !== d.integrity) return { ok: false, reason: 'Сохранённое решение повреждено: проверка целостности не пройдена.' };
    const lower = verifyBarrier(d.columns, d.certificate, d.difficulty - 1);
    if (!lower.ok || lower.required !== d.difficulty) return { ok: false, reason: 'Не подтверждён необходимый резерв этой раскладки.' };
    const level = levelFor(d); createGame(level, d.difficulty);
    if (!Array.isArray(d.solution) || d.solution.length > 2000 || d.solution.some(a => !a || !['move', 'reveal'].includes(a.type)) || !verifyLevel(level, d.difficulty)) return { ok: false, reason: 'Сохранённая последовательность не приводит к победе.' };
    return { ok: true, deal: structuredClone(d) };
  } catch { return { ok: false, reason: 'Сохранённое решение отсутствует или повреждено.' }; }
}
