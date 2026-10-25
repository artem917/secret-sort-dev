import { applyAction, createGame, isVictory, positionError } from '../game/game.ts';
import type { GameState, Level, ProofAction, ReserveCapacity, Selection } from '../game/types.ts';

export type ReplaySpeed = 1 | 2 | 4;
export interface ReplayView {
  state: GameState; index: number; total: number; playing: boolean; speed: ReplaySpeed;
  phase: 'ready' | 'selected' | 'moving' | 'won'; selection: Selection | null;
  action: ProofAction | null; effect: { type: 'reveal' | 'move'; ids: number[]; autoRevealId: number | null } | null;
}
export interface ReplayClock { set(callback: () => void, milliseconds: number): unknown; clear(handle: unknown): void }
const realClock: ReplayClock = { set: (fn, ms) => setTimeout(fn, ms), clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) };

/** Isolated, real-engine frames. No storage, records, victory events or live game reference. */
export class ReplayPlayer {
  private readonly frames: GameState[];
  private readonly actions: ProofAction[];
  private index = 0;
  private speed: ReplaySpeed = 1;
  private playing = false;
  private phase: ReplayView['phase'] = 'ready';
  private timer: unknown = null;
  private closed = false;
  private pending: ProofAction | null = null;
  private effect: ReplayView['effect'] = null;
  private readonly onChange: (view: ReplayView) => void;
  private readonly reducedMotion: boolean;
  private readonly clock: ReplayClock;
  constructor(level: Level, reserve: ReserveCapacity, onChange: (view: ReplayView) => void, reducedMotion = false, clock: ReplayClock = realClock) {
    this.onChange = onChange; this.reducedMotion = reducedMotion; this.clock = clock;
    this.actions = structuredClone(level.solution);
    this.frames = [createGame(level, reserve, 'isolated-replay')];
    for (const action of this.actions) {
      if (!action || !['move', 'reveal'].includes(action.type)) throw new Error('Недопустимое действие в решении');
      const result = applyAction(this.frames.at(-1)!, action);
      if (!result.ok || positionError(result.state, result.state.config)) throw new Error('Решение не прошло проверку движком');
      this.frames.push(result.state);
    }
    if (!isVictory(this.frames.at(-1)!)) throw new Error('Последовательность не заканчивается победой');
  }
  get view(): ReplayView {
    return { state: structuredClone(this.frames[this.index]!), index: this.index, total: this.actions.length, playing: this.playing, speed: this.speed, phase: this.phase,
      selection: this.phase === 'selected' && this.pending?.type === 'move' ? { source: { ...this.pending.from }, count: this.pending.count } : null,
      action: this.pending ? structuredClone(this.pending) : null, effect: this.effect ? structuredClone(this.effect) : null };
  }
  private emit(): void { if (!this.closed) { this.onChange(this.view); this.effect = null; } }
  private clear(): void { if (this.timer !== null) this.clock.clear(this.timer); this.timer = null; }
  private schedule(fn: () => void, ms: number): void { this.clear(); this.timer = this.clock.set(() => { this.timer = null; if (!this.closed) fn(); }, ms / this.speed); }
  private advance(): void {
    if (this.closed) return;
    if (this.index >= this.actions.length) { this.playing = false; this.phase = 'won'; this.pending = null; this.emit(); return; }
    this.pending = this.actions[this.index]!; this.phase = 'selected'; this.emit();
    this.schedule(() => {
      const before = this.frames[this.index]!, action = this.pending!;
      const ids = action.type === 'reveal' ? [before.columns[action.column]![0]!.id] : (action.from.zone === 'column' ? before.columns[action.from.index]! : [before.reserve[action.from.index]!]).slice(0, action.count).map(t => t.id);
      this.index++; this.phase = 'moving';
      const entry = this.frames[this.index]!.history.at(-1);
      this.effect = { type: action.type, ids, autoRevealId: entry?.type === 'move' ? entry.autoRevealedId : null }; this.emit();
      this.schedule(() => {
        this.pending = null; this.phase = this.index === this.actions.length ? 'won' : 'ready';
        if (this.phase === 'won') this.playing = false;
        this.emit(); if (this.playing) this.advance();
      }, this.reducedMotion ? 120 : 500);
    }, this.reducedMotion ? 0 : 160);
  }
  play(): void { if (this.closed || this.playing) return; this.clear(); if (this.index === this.actions.length) this.index = 0; this.playing = true; this.advance(); }
  pause(): void { if (this.closed) return; this.clear(); this.playing = false; this.pending = null; this.effect = null; this.phase = this.index === this.actions.length ? 'won' : 'ready'; this.emit(); }
  next(): void { if (this.closed) return; this.pause(); this.advance(); }
  previous(): void { if (this.closed) return; this.pause(); this.index = Math.max(0, this.index - 1); this.phase = 'ready'; this.emit(); }
  restart(): void { if (this.closed) return; this.pause(); this.index = 0; this.phase = 'ready'; this.emit(); }
  setSpeed(speed: ReplaySpeed): void { if (![1, 2, 4].includes(speed) || this.closed) return; const resume = this.playing; this.pause(); this.speed = speed; this.emit(); if (resume) this.play(); }
  close(): void { this.clear(); this.playing = false; this.pending = null; this.effect = null; this.closed = true; }
}
