import { solveForward } from './solver.ts';
import type { Position } from '../game/types.ts';
self.onmessage = (event: MessageEvent<Position>): void => {
  try { self.postMessage(solveForward(event.data, { maxStates: 8000, maxMs: 350 })); }
  catch { self.postMessage({ status: 'UNKNOWN', reason: 'analysis-unavailable' }); }
};
