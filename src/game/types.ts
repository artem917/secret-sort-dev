/** Domain contracts: no sorting, scoring, timer, or victory rules are defined yet. */
export interface LevelDraft {
  readonly status: 'awaiting-rules';
}

export type LevelGenerator = () => LevelDraft;

export type GameState =
  | { readonly screen: 'start' }
  | { readonly screen: 'workspace'; readonly draft: LevelDraft };

export type GameAction =
  | { readonly type: 'open-workspace' }
  | { readonly type: 'return-to-start' };
