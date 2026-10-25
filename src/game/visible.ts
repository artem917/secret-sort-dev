import type { Position } from './types.ts';

export interface VisibleTile { kind: number; open: boolean }
export interface VisiblePosition { columns: VisibleTile[][]; reserve: (VisibleTile | null)[] }

/** Information the player can see. No seed, tile IDs, or hidden kinds escape. */
export function visiblePosition(position: Position): VisiblePosition {
  const mask = (tile: { kind: number; open: boolean }): VisibleTile => ({ kind: tile.open ? tile.kind : -1, open: tile.open });
  return { columns: position.columns.map(col => col.map(mask)), reserve: position.reserve.map(tile => tile ? mask(tile) : null) };
}
