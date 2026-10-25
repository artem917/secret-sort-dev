import type { LevelDraft } from '../game/types.ts';

/** Extension point. Add generation only after the game rules are approved. */
export function generateLevel(): LevelDraft {
  return { status: 'awaiting-rules' };
}
