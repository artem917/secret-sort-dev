export type TileKind = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export interface Tile { id: number; kind: TileKind; open: boolean }
export interface GameConfig { columns: 10; capacity: 12; reserveCapacity: 0 | 4; historyLimit: 80 }
export const DEFAULT_CONFIG: GameConfig = { columns: 10, capacity: 12, reserveCapacity: 4, historyLimit: 80 };
export const INITIAL_HEIGHTS = [10, 11, 11, 11, 11, 11, 11, 11, 11, 10] as const;
export interface Location { zone: 'column' | 'reserve'; index: number }
export interface Position { columns: Tile[][]; reserve: (Tile | null)[] }
export interface Move { type: 'move'; from: Location; to: Location; count: number }
export interface Reveal { type: 'reveal'; column: number; index: number }
export type ProofAction = Move | Reveal;
export type GameAction = ProofAction | { type: 'undo' } | { type: 'hint' };
export type HistoryEntry =
  | { type: 'reveal'; column: number; id: number }
  | { type: 'move'; from: Location; to: Location; ids: number[] };
export interface FinalResult { score: number; transfers: number; undos: number; hints: number }
export interface GameState extends Position {
  version: 1;
  runId: string;
  seed: string;
  config: GameConfig;
  transfers: number;
  undos: number;
  hints: number;
  history: HistoryEntry[];
  result: FinalResult | null;
}
export interface Level { seed: string; columns: Tile[][]; solution: ProofAction[]; algorithm: 'ordered-donor-v1' }
export interface Selection { source: Location; count: number }
export type ActionResult = { ok: true; state: GameState } | { ok: false; state: GameState; reason: string };
export interface Settings { sound: boolean; animations: boolean; reserveCapacity: 0 | 4; tutorialSeen: boolean }
export interface RecordEntry extends FinalResult { seed: string; runId: string; date: string }
export interface Records { wins: number; bestScore: RecordEntry | null; fewestMoves: RecordEntry | null; completedRuns: string[] }
