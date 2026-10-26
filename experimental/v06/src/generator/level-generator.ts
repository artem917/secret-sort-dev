import { templatesFor, templateById, columnsForTemplate, solutionForTemplate } from './interleaved-data.ts';
import { makeCertificate, classifyMinimum } from './barrier.ts';
import { sealDeal } from '../game/deal.ts';
import type { CertifiedDeal } from '../game/deal.ts';
import type { Difficulty, Location, ProofAction, TileKind } from '../game/types.ts';

export const normalizeSeed = (seed: string): string => seed.trim().slice(0, 64) || 'reserve-class-1';
export function seedHash(seed: string): number { let n = 2166136261; for (const ch of seed) n = Math.imul(n ^ ch.charCodeAt(0), 16777619); return n >>> 0; }
function randomFor(seed: string): () => number {
  let n = seedHash(seed);
  return () => { n = (n + 0x6d2b79f5) | 0; let t = Math.imul(n ^ (n >>> 15), 1 | n); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffled<T>(values: T[], random: () => number): T[] { const copy = [...values]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j]!, copy[i]!]; } return copy; }
/** Structural variants precede symmetries. The proof is rebound to every actual layout. */
export async function generateDeal(rawSeed: string, difficulty: Difficulty): Promise<CertifiedDeal> {
  const seed = normalizeSeed(rawSeed), random = randomFor(seed), explicit = templateById(seed), pool = templatesFor(difficulty);
  if (explicit && explicit.required !== difficulty) throw new Error('Раскладка относится к другому режиму');
  const template = explicit ?? pool[seedHash(seed) % pool.length]!, built = { columns: columnsForTemplate(template), solution: solutionForTemplate(template) };
  const colors: TileKind[] = explicit ? [0,1,2,3,4,5,6,7,8] : shuffled<TileKind>([0, 1, 2, 3, 4, 5, 6, 7, 8], random);
  const tens = shuffled([0, 9], random), elevens = shuffled([1, 2, 3, 4, 5, 6, 7, 8], random), order = explicit ? [0,1,2,3,4,5,6,7,8,9] : [tens[0]!, ...elevens, tens[1]!], mapping: number[] = [];
  order.forEach((old, index) => { mapping[old] = index; });
  const columns = order.map(old => built.columns[old]!.map(t => ({ id: colors[t.kind]! * 12 + t.id % 12, kind: colors[t.kind]!, open: t.open })));
  const map = (location: Location): Location => location.zone === 'reserve' ? { ...location } : { zone: 'column', index: mapping[location.index]! };
  const solution: ProofAction[] = built.solution.map(a => ({ ...a, from: map(a.from), to: map(a.to) }));
  const certificate = makeCertificate(columns, difficulty);
  const classified = classifyMinimum(columns, certificate, solution);
  if (!classified.ok || classified.minimum !== difficulty) throw new Error('Не подтверждён математический класс');
  return sealDeal({ schema: 2, algorithm: 'reserve-proof-v6', algorithmVersion: 2, origin: 'interleaved-ports-v2', template: template.id, id: `ss6-${difficulty}-${seedHash(seed).toString(16).padStart(8, '0')}`, seed, difficulty, columns, solution, certificate });
}
