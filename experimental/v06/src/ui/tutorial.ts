import { DEFAULT_CONFIG } from '../game/types.ts';
import type { GameState, Tile, TileKind } from '../game/types.ts';

/** A separate, unscored teaching position. It preserves the complete inventory. */
export function createGroupTutorial(): GameState {
  const columns: Tile[][] = Array.from({ length: 9 }, (_, kind) => Array.from({ length: 12 }, (_, i) => ({ id: kind * 12 + i, kind: kind as TileKind, open: kind !== 0 || i < 5 })));
  columns.push([]);
  return { version: 3, generator: 'reserve-proof-v6', seed: 'mini-training', runId: 'mini-training', config: { ...DEFAULT_CONFIG }, columns, reserve: [null, null, null, null], transfers: 0, undos: 0, hints: 0, history: [], result: null };
}
