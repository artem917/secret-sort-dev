import type { GameAction, GameState, LevelGenerator } from './types.ts';

export function createInitialState(): GameState {
  return { screen: 'start' };
}

/** Pure navigation transitions. The generator is injected; this module has no DOM. */
export function transition(
  state: GameState,
  action: GameAction,
  generateLevel: LevelGenerator,
): GameState {
  switch (action.type) {
    case 'open-workspace':
      return state.screen === 'start'
        ? { screen: 'workspace', draft: generateLevel() }
        : state;
    case 'return-to-start':
      return createInitialState();
  }
}
