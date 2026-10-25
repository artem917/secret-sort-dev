import { applyAction, createGame, isVictory, positionError } from '../game/game.ts';
import type { Level } from '../game/types.ts';

/** Replay through the production rules before admitting a new generated game. */
export function verifyLevel(level: Level, reserveCapacity: 0 | 4 = 4): boolean {
  try {
    let state = createGame(level, reserveCapacity);
    for (const action of level.solution) {
      const next = applyAction(state, action);
      if (!next.ok || positionError(next.state, next.state.config)) return false;
      state = next.state;
    }
    return isVictory(state) && state.result !== null;
  } catch { return false; }
}
