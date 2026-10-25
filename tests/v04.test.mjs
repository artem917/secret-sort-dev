import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solveForward, verifyClosedProof, canonicalPositionKey } from '../experimental/v04/src/solver/solver.ts';
import { shuffleLevel, generateVerifiedLevel } from '../experimental/v04/src/generator/level-generator.ts';
import { applyAction, createGame, legalMoves, isVictory, positionError, possibleAction } from '../experimental/v04/src/game/game.ts';
import { DEFAULT_CONFIG } from '../experimental/v04/src/game/types.ts';
import { visiblePosition } from '../experimental/v04/src/game/visible.ts';
import * as storage from '../experimental/v04/src/game/storage.ts';
import { SAVE_KEY as STABLE_SAVE, SETTINGS_KEY as STABLE_SETTINGS, RECORDS_KEY as STABLE_RECORDS } from '../src/game/storage.ts';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/v04/${name}.json`, import.meta.url)));
const stateFor = position => ({ ...structuredClone(position), version: 2, generator: 'full-shuffle-v4', seed: 'witness', runId: 'witness', config: { ...DEFAULT_CONFIG }, transfers: 0, undos: 0, hints: 0, history: [], result: null });
function replay(state, actions) {
  for (const action of actions) {
    const result = applyAction(state, action); assert.ok(result.ok, result.reason); state = result.state;
    assert.equal(positionError(state, state.config), null);
  }
  return state;
}
const position = state => ({ columns: state.columns, reserve: state.reserve });

test('v04 transfer engine, masked projection and mobile styles remain identical to stable source', () => {
  for (const file of ['game/game.ts', 'game/visible.ts', 'ui/styles.css']) assert.equal(readFileSync(`experimental/v04/src/${file}`, 'utf8'), readFileSync(`src/${file}`, 'utf8'));
});
test('v04 seeds give deterministic full108 Fisher-Yates, nine complete inventories, normal initial heights', () => {
  const distinct = new Set();
  for (let i = 0; i < 100; i++) {
    const level = shuffleLevel(`shuffle-${i}`);
    assert.deepEqual(level, shuffleLevel(`shuffle-${i}`));
    const state = createGame(level, 4); assert.equal(positionError(state, state.config), null);
    assert.ok(state.columns.flat().every(t => !t.open));
    distinct.add(level.columns.flat().map(t => t.id).join(','));
  }
  assert.equal(distinct.size, 100);
});
test('v04 UNKNOWN budgets never become LOSE and do not silently change the seeded layout', () => {
  const root = shuffleLevel('shuffle-11'), p = { columns: root.columns, reserve: Array(4).fill(null) };
  for (const budget of [{ maxStates: 1, maxMs: 8000 }, { maxStates: 80_000, maxMs: 0 }]) {
    const result = solveForward(p, budget); assert.equal(result.status, 'UNKNOWN'); assert.equal(result.solution.length, 0); assert.equal(result.closedProof, undefined);
    assert.equal(generateVerifiedLevel(root.seed, budget).status, 'UNKNOWN');
    assert.deepEqual(shuffleLevel(root.seed), root);
  }
});
test('v04 all32 frozen full-shuffle seeds admitted only with replayable production-engine WIN proofs', () => {
  for (let i = 0; i < 32; i++) {
    const result = generateVerifiedLevel(`shuffle-${i}`);
    assert.equal(result.status, 'WIN', `shuffle-${i} ${result.report.reason}`);
    assert.ok(isVictory(replay(createGame(result.level, 4), result.level.solution)));
  }
});
test('v04 WIN parent has reachable legal move to certified11-state forward LOSE; Undo restores exact parent', () => {
  const w = fixture('shuffle-risk-witness'), root = shuffleLevel(w.seed);
  assert.deepEqual(root.columns, w.root.columns);
  const parent = replay(createGame(root, 4), w.rootToParent);
  assert.deepEqual(position(parent), position(w.parent));
  assert.ok(isVictory(replay(parent, w.parentWinningActions)));
  const child = replay(parent, [w.badAction]);
  const outcome = solveForward(child);
  assert.equal(outcome.status, 'LOSE'); assert.equal(outcome.discovered, 11); assert.equal(outcome.frontier, 0); assert.ok(outcome.generated > 0);
  assert.ok(verifyClosedProof(child, outcome.closedProof));
  const damaged = structuredClone(outcome.closedProof); damaged.keys.pop(); assert.equal(verifyClosedProof(child, damaged), false);
  const restored = replay(child, [{ type: 'undo' }]);
  assert.deepEqual(position(restored), position(parent)); assert.equal(restored.undos, 1);
  assert.ok(isVictory(replay(restored, w.parentWinningActions)));
});
test('v04 independent actual-engine traversal agrees with the closed11-state LOSE certificate', () => {
  const w = fixture('shuffle-risk-witness');
  const child = replay(replay(createGame(shuffleLevel(w.seed), 4), w.rootToParent), [w.badAction]);
  const queue = [child], visited = new Set([canonicalPositionKey(child)]);
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]; assert.ok(!isVictory(node));
    assert.ok(node.columns.every(c => !c.length || c[0].open));
    for (const action of legalMoves(node)) {
      const next = replay(node, [action]), key = canonicalPositionKey(next);
      if (!visited.has(key)) { visited.add(key); queue.push(next); }
    }
  }
  assert.equal(visited.size, 11);
  assert.deepEqual(visited, new Set(solveForward(child).closedProof.keys));
});
test('v04 same visible history, both parents WIN, same move LOSE inA and WIN inB: hidden-information fairness limitation', () => {
  const pair = fixture('reachable-hidden-risk-pair');
  assert.deepEqual(pair.completionA.rootToParent, pair.completionB.rootToParent);
  let parents = [pair.completionA, pair.completionB].map(c => createGame({ ...c.root, algorithm: 'full-shuffle-v4' }, 4));
  const compare = () => {
    assert.deepEqual(visiblePosition(parents[0]), visiblePosition(parents[1]));
    assert.deepEqual(parents[0].columns.flat().filter(t => t.open), parents[1].columns.flat().filter(t => t.open));
  };
  compare();
  for (const action of pair.completionA.rootToParent) { parents = parents.map(p => replay(p, [action])); compare(); }
  assert.deepEqual(visiblePosition(parents[0]), visiblePosition(parents[1]));
  assert.deepEqual(possibleAction(parents[0]), possibleAction(parents[1]), 'ordinary hint does not read hidden content');
  for (let i = 0; i < 2; i++) assert.ok(isVictory(replay(parents[i], [pair.completionA, pair.completionB][i].parentWinningActions)));
  const a = replay(parents[0], [pair.commonAction]), b = replay(parents[1], [pair.commonAction]);
  const ar = solveForward(a), br = solveForward(b);
  assert.equal(ar.status, 'LOSE'); assert.ok(verifyClosedProof(a, ar.closedProof));
  assert.equal(br.status, 'WIN'); assert.ok(isVictory(replay(b, br.solution)));
});
test('v04 isolated saves preserve atomic autoReveal/Undo through F5 without touching v03 keys', () => {
  const stable = new Map([[STABLE_SAVE, 'stable-game'], [STABLE_SETTINGS, 'stable-settings'], [STABLE_RECORDS, 'stable-records']]);
  const port = { getItem: k => stable.get(k) ?? null, setItem: (k, v) => stable.set(k, v) };
  assert.equal(storage.loadGame(port).game, null);
  const before = replay(createGame(shuffleLevel('shuffle-12'), 4), [{ type: 'reveal', column: 0, index: 0 }]);
  const stored = replay(before, [{ type: 'move', from: { zone: 'column', index: 0 }, to: { zone: 'reserve', index: 0 }, count: 1 }]);
  assert.ok(storage.saveGame(port, stored));
  const loaded = storage.loadGame(port).game; assert.ok(loaded); assert.deepEqual(loaded, stored);
  assert.deepEqual(position(replay(loaded, [{ type: 'undo' }])), position(before));
  assert.equal(port.getItem(STABLE_SAVE), 'stable-game'); assert.equal(port.getItem(STABLE_SETTINGS), 'stable-settings'); assert.equal(port.getItem(STABLE_RECORDS), 'stable-records');
});
test('v04 solver rejects invalid inventory and corrupted hidden prefixes', () => {
  const p = stateFor({ columns: shuffleLevel('invalid').columns, reserve: Array(4).fill(null) });
  p.columns[0][1].open = true; assert.throws(() => solveForward(p)); p.columns[0][1].open = false;
  p.columns[0][0].id = p.columns[0][1].id; assert.throws(() => solveForward(p));
});
test('v04 actual group choice in shuffle0 leads from WIN to a closed4-state LOSE component', () => {
  const w = fixture('group-risk-witness');
  const parent = replay(createGame(shuffleLevel(w.seed), 4), w.rootToParent);
  assert.equal(w.badAction.count, 2); assert.ok(isVictory(replay(parent, w.parentWinningActions)));
  const child = replay(parent, [w.badAction]), result = solveForward(child);
  assert.equal(result.status, 'LOSE'); assert.equal(result.discovered, 4); assert.ok(verifyClosedProof(child, result.closedProof));
  assert.deepEqual(position(replay(child, [{type:'undo'}])), position(parent));
});
test('v04 solved root WIN is valid even with zero search time, malformed proof cannot claim LOSE', () => {
  const root = shuffleLevel('shuffle-0'), accepted = generateVerifiedLevel(root.seed);
  assert.equal(accepted.status, 'WIN');
  const won = replay(createGame(root,4), accepted.level.solution), result = solveForward(won,{maxStates:1,maxMs:0});
  assert.equal(result.status,'WIN'); assert.deepEqual(result.solution,[]);
  assert.equal(verifyClosedProof(won,{version:1,keys:[canonicalPositionKey(won)]}),false);
  assert.equal(verifyClosedProof(won,{version:1,keys:['garbage#-1,-1,-1,-1']}),false);
});
