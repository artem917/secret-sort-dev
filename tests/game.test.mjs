import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, columnAt as c, reserveAt as r, clonePosition, isBlocked, isVictory, legalMoves, moveError, positionError, possibleAction, revealedCount, scoreFor, selectionError, topRun } from '../src/game/game.ts';
import { createGame } from '../src/game/game.ts';
import { DEFAULT_CONFIG, INITIAL_HEIGHTS } from '../src/game/types.ts';
import { generateLevel } from '../src/generator/level-generator.ts';
import { verifyLevel } from '../src/generator/verify.ts';
import { adRewardProvider } from '../src/game/ad-reward-provider.ts';
import { emptyRecords, isValidSave, loadGame, loadRecords, loadSettings, recordVictory, saveGame, saveRecords, saveSettings, SAVE_KEY } from '../src/game/storage.ts';

const initial = (seed = 'certified-2', reserve = 4) => createGame(generateLevel(seed), reserve, `test-${seed}`);
const tile = (kind = 0, n = 0, open = true) => ({ id: kind * 12 + n, kind, open });
const mini = (cols, reserve = [null, null, null, null]) => ({ ...initial(), columns: [...cols, ...Array.from({ length: 10 - cols.length }, () => [])], reserve });
const move = (from, to, count = 1) => ({ type: 'move', from, to, count });
const reveal = (column, index = 0) => ({ type: 'reveal', column, index });
function accept(state, action) { const result = applyAction(state, action); assert.equal(result.ok, true, result.reason); return result.state; }
function memory() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }
function won(seed = 'certified-2') { const level = generateLevel(seed); let state = createGame(level, 4, `win-${seed}`); for (const action of level.solution) state = accept(state, action); return state; }

test('exactly 108 unique IDs, nine kinds, 12 of each', () => {
  const s = initial(); const all = s.columns.flat();
  assert.equal(all.length, 108); assert.equal(new Set(all.map(t => t.id)).size, 108);
  for (let kind = 0; kind < 9; kind++) assert.equal(all.filter(t => t.kind === kind).length, 12);
  assert.equal(positionError(s, s.config), null);
});
test('ten columns capacity12, exact nonempty initial heights, reserve separate', () => {
  const s = initial(); assert.deepEqual(s.columns.map(col => col.length), [...INITIAL_HEIGHTS]);
  assert.equal(s.config.capacity, 12); assert.equal(s.columns.length, 10); assert.equal(s.reserve.length, 4);
});
test('all occupied positions initially hidden; vacancies are not tiles', () => { const s = initial(); assert.equal(revealedCount(s), 0); assert.equal(s.columns.flat().every(t => !t.open), true); assert.equal(s.columns.reduce((n, col) => n + 12 - col.length, 0), 12); });
test('only index0 hidden can be revealed, with no transfer', () => { const s = initial(); const a = accept(s, reveal(0)); assert.equal(a.columns[0][0].open, true); assert.equal(revealedCount(a), 1); assert.equal(a.transfers, 0); assert.equal(s.columns[0][0].open, false); });
test('revealing deep, open, absent, negative and fractional positions is rejected', () => { const s = initial(); for (const action of [reveal(0, 1), reveal(-1), reveal(10), reveal(.5)]) assert.equal(applyAction(s, action).ok, false); assert.equal(applyAction(accept(s, reveal(0)), reveal(0)).ok, false); });
test('choose exactly k=1..5 within a top group', () => { const s = mini([Array.from({ length: 5 }, (_, i) => tile(0, i))]); assert.equal(topRun(s, c(0)), 5); for (let k = 1; k <= 5; k++) assert.equal(selectionError(s, { source: c(0), count: k }), null); });
test('selection never crosses a hidden or different-kind tile', () => { for (const boundary of [tile(0, 5, false), tile(1)]) { const s = mini([[tile(), tile(0, 1), boundary]]); assert.equal(topRun(s, c(0)), 2); assert.ok(selectionError(s, { source: c(0), count: 3 })); } });
test('reject zero, negative, fractional and oversized group selection', () => { const s = mini([[tile()]]); for (const count of [0, -1, 1.5, 2, NaN]) assert.ok(selectionError(s, { source: c(0), count })); });
test('matching open target receives whole group in order', () => { const s = mini([[tile(), tile(0, 1)], [tile(0, 2)]]); const a = accept(s, move(c(0), c(1), 2)); assert.deepEqual(a.columns[1].map(t => t.id), [0, 1, 2]); assert.equal(a.columns[0].length, 0); assert.equal(a.transfers, 1); });
test('empty target receives selected prefix only; no auto-merge', () => { const s = mini([[tile(), tile(0, 1), tile(0, 2)], []]); const a = accept(s, move(c(0), c(1), 2)); assert.equal(a.columns[0].length, 1); assert.equal(a.columns[1].length, 2); });
test('group of five really moves as one transfer', () => { const s = mini([Array.from({ length: 5 }, (_, i) => tile(0, i)), []]); const a = accept(s, move(c(0), c(1), 5)); assert.equal(a.transfers, 1); assert.equal(a.columns[1].length, 5); });
test('different kind and closed destination reject moves', () => { for (const target of [tile(1), tile(0, 3, false)]) { const s = mini([[tile()], [target]]); assert.equal(applyAction(s, move(c(0), c(1))).ok, false); } });
test('capacity12 enforced; groups never silently truncated', () => { const s = mini([[tile(), tile(0, 1)], Array.from({ length: 11 }, (_, i) => tile(0, i))]); const result = applyAction(s, move(c(0), c(1), 2)); assert.equal(result.ok, false); assert.equal(result.state, s); assert.equal(accept(s, move(c(0), c(1))).columns[1].length, 12); });
test('hidden source, same location and invalid indices rejected', () => { const s = mini([[tile(0, 0, false)]]); for (const action of [move(c(0), c(1)), move(c(0), c(0)), move(c(-1), c(1)), move(c(0), r(4))]) assert.equal(applyAction(s, action).ok, false); });
test('one open tile enters free reserve regardless of kind', () => { const s = mini([[tile(3)]]); const a = accept(s, move(c(0), r(2))); assert.equal(a.reserve[2].kind, 3); assert.equal(a.columns[0].length, 0); });
test('occupied reserve and groups in reserve rejected', () => { const s = mini([[tile(), tile(0, 1)]], [tile(2), null, null, null]); assert.equal(applyAction(s, move(c(0), r(0))).ok, false); assert.equal(applyAction(s, move(c(0), r(1), 2)).ok, false); });
test('reserve returns to empty/matching columns, rejects mismatching/hidden', () => { const s = mini([[], [tile(0, 1)], [tile(1)], [tile(0, 2, false)]], [tile(), null, null, null]); for (const index of [0, 1]) assert.equal(applyAction(s, move(r(0), c(index))).ok, true); for (const index of [2, 3]) assert.equal(applyAction(s, move(r(0), c(index))).ok, false); });
test('zero-reserve mode genuinely removes reserve actions', () => { const s = initial('certified-2', 0); assert.equal(s.reserve.length, 0); assert.equal(applyAction(accept(s, reveal(0)), move(c(0), r(0))).ok, false); });
test('reveal undo restores exact hidden state and increments undo count', () => { const s = initial(); const a = accept(accept(s, reveal(0)), { type: 'undo' }); assert.deepEqual(clonePosition(a), clonePosition(s)); assert.equal(a.undos, 1); assert.equal(a.history.length, 0); });
test('transfer undo restores source, target and reserve; transfer counter never decreases', () => { const s = accept(initial(), reveal(0)); const a = accept(accept(s, move(c(0), r(0))), { type: 'undo' }); assert.deepEqual(clonePosition(a), clonePosition(s)); assert.equal(a.transfers, 1); assert.equal(a.undos, 1); });
test('removing top automatically reveals exactly the next tile', () => { const s = accept(initial(), reveal(0)); const a = accept(s, move(c(0), r(0))); assert.equal(a.columns[0][0].open, true); assert.equal(a.columns[0][1].open, false); });
test('undo history is bounded80 and empty undo has no penalty', () => { let s = mini([[tile()], []]); for (let i = 0; i < 100; i++) s = accept(s, move(c(i % 2), c(1 - i % 2))); assert.equal(s.history.length, 80); const b = initial(); assert.equal(applyAction(b, { type: 'undo' }).state.undos, 0); });
test('all published certificate actions preserve total inventory and type counts', () => { const level = generateLevel('certified-2'); let s = createGame(level); for (const action of level.solution) { s = accept(s, action); assert.equal(positionError(s, s.config), null); } assert.equal(s.transfers, level.solution.filter(a => a.type === 'move').length); assert.equal(revealedCount(s), 108); });
test('victory exactly9x12 + one empty + empty reserve, all visible', () => { const s = won(); assert.equal(isVictory(s), true); const hidden = structuredClone(s); hidden.columns.find(col => col.length)[0].open = false; assert.equal(isVictory(hidden), false); const held = structuredClone(s); held.reserve[0] = held.columns.find(col => col.length).shift(); assert.equal(isVictory(held), false); });
test('incomplete or nonhomogeneous board is not victory', () => { const s = won(); const cols=s.columns.filter(col=>col.length); [cols[0][0],cols[1][0]]=[cols[1][0],cols[0][0]]; assert.equal(isVictory(s), false); });
function blocked() {
  const heights = [12,12,12,12,12,12,12,12,1,11], tops = [0,0,1,2,3,4,5,6,7,8];
  const pools = Array.from({length:9}, (_,kind) => Array.from({length:12}, (_,i) => tile(kind,i)));
  const columns = tops.map(kind => [pools[kind].shift()]);
  for (let col=0;col<10;col++) while(columns[col].length<heights[col]) columns[col].push(pools.find(pool=>pool.length).shift());
  return { ...initial('blocked',0), columns };
}
test('true blocked state detected without false timer loss', () => { const s = blocked(); assert.equal(positionError(s,s.config),null); assert.equal(legalMoves(s).length,0); assert.equal(isBlocked(s),true); });
test('reveal, reserve move, or undo each prevent false blocked loss', () => { const s = blocked(); s.columns[8][0].open=false; assert.equal(isBlocked(s),false); const a=blocked(); a.reserve=[null,null,null,null]; a.config={...DEFAULT_CONFIG}; assert.equal(isBlocked(a),false); const b=blocked(); b.history=[{type:'reveal',column:0,id:b.columns[0][0].id}]; assert.equal(isBlocked(b),false); });
test('hints are legal, visible-information actions and cost once', () => { for (const s of [initial(), accept(initial(),reveal(0))]) { const hint=possibleAction(s); assert.ok(hint); assert.equal(applyAction(s,hint).ok,true); const a=accept(s,{type:'hint'}); assert.equal(a.hints,1); assert.deepEqual(clonePosition(a),clonePosition(s)); } });
test('no-action hint has no fake reward or charge', () => { const s=blocked(); assert.equal(possibleAction(s),null); assert.equal(applyAction(s,{type:'hint'}).ok,false); assert.equal(s.hints,0); });
test('score formula and clamp, no per-reveal scoring', () => { assert.equal(scoreFor(108,0,0),6760); assert.equal(scoreFor(108,1,1),6010); assert.equal(scoreFor(1000,1000,1000),0); const s=accept(initial(),reveal(0)); assert.equal(s.result,null); });
test('undo cycling cannot farm moves or score', () => { let s=accept(initial(),reveal(0)); for(let i=0;i<5;i++) { s=accept(s,move(c(0),r(0))); s=accept(s,{type:'undo'}); } assert.equal(s.transfers,5); assert.equal(s.undos,5); assert.ok(scoreFor(s.transfers,s.undos,0)<10000); });
test('final score finalized once; no action can mutate completed result', () => { const s=won(); assert.equal(s.result.score,scoreFor(s.transfers,0,0)); for(const action of [reveal(0),{type:'undo'},{type:'hint'},move(c(0),c(1))]) assert.equal(applyAction(s,action).state,s); });
test('save/F5-compatible roundtrip retains position, history and penalties', () => { const storage=memory(); let s=accept(initial(),reveal(0)); s=accept(s,move(c(0),r(0))); s=accept(s,{type:'hint'}); assert.equal(saveGame(storage,s),true); const loaded=loadGame(storage); assert.equal(loaded.warning,null); assert.deepEqual(loaded.game,s); assert.deepEqual(clonePosition(accept(loaded.game,{type:'undo'})),clonePosition(accept(s,{type:'undo'}))); });
test('corrupted, old, missing-tile and forged-history saves fail closed', () => { const storage=memory(); for(const value of ['{bad',JSON.stringify({...initial(),version:99}),JSON.stringify({...initial(),columns:[]}),JSON.stringify({...initial(),history:[{type:'move',from:c(0),to:c(1),ids:[999]}]})]) { storage.setItem(SAVE_KEY,value); assert.equal(loadGame(storage).game,null); } });
test('duplicate IDs, hidden reserve, overcapacity and inconsistent result rejected', () => { const cases=[]; let s=initial(); s.columns[0][0].id=s.columns[0][1].id; cases.push(s); s=initial(); s.reserve[0]=s.columns[0].shift(); cases.push(s); s=initial(); s.columns[0].push(...s.columns[1].splice(0,3)); cases.push(s); s=won(); s.result.score=999999; cases.push(s); for(const data of cases) assert.equal(isValidSave(data),false); });
test('storage denied/quota errors do not crash play', () => { const denied={getItem(){throw Error('denied')},setItem(){throw Error('quota')}}; assert.equal(saveGame(denied,initial()),false); assert.equal(loadGame(denied).game,null); assert.deepEqual(loadRecords(denied),emptyRecords()); assert.equal(saveSettings(denied,loadSettings(denied)),false); });
test('settings persist real sound/animation/reserve choices', () => { const storage=memory(); const settings={sound:false,animations:false,reserveCapacity:0,tutorialSeen:true}; assert.equal(saveSettings(storage,settings),true); assert.deepEqual(loadSettings(storage),settings); assert.equal(loadSettings(memory(),true).animations,false); });
test('local records track both bestscore and fewestmoves; victory counted once', () => { let s=won(); let records=recordVictory(emptyRecords(),s,'2026-10-25'); assert.equal(records.wins,1); assert.equal(records.bestScore.seed,s.seed); assert.equal(recordVictory(records,s,'2026-10-25'),records); const best=s.result.score, fewer=s.transfers-1; s={...s,runId:'second',transfers:fewer,hints:1,result:{score:scoreFor(fewer,0,1),transfers:fewer,undos:0,hints:1}}; records=recordVictory(records,s,'2026-10-25'); assert.equal(records.bestScore.score,best); assert.equal(records.fewestMoves.transfers,fewer); const storage=memory(); assert.equal(saveRecords(storage,records),true); assert.deepEqual(loadRecords(storage),records); });
test('restarting same seed produces identical hidden initial position', () => { const s=initial('hello'); assert.deepEqual(s.columns,initial('hello').columns); assert.notDeepEqual(s.columns,initial('another').columns); });
test('onboarding seed has full certified solution in both reserve modes', () => { const level=generateLevel('onboarding'); assert.equal(verifyLevel(level,0),true); assert.equal(verifyLevel(level,4),true); });
test('at least20 distinct certified layouts, replay through production rules', () => { const signatures=new Set(); for(let i=0;i<20;i++){ const level=generateLevel(`certified-${i}`); signatures.add(JSON.stringify(level.columns.map(col=>col.map(t=>t.kind)))); assert.equal(verifyLevel(level,i%2?0:4),true); } assert.equal(signatures.size,20); });
test('certificate verifier rejects a deliberately illegal solution', () => { const level=generateLevel('certified-2'); level.solution.unshift(move(c(0),c(1),5)); assert.equal(verifyLevel(level),false); });
test('future ad provider is unavailable and never invents a reward', async () => { assert.equal(adRewardProvider.available,false); assert.deepEqual(await adRewardProvider.requestReward('hint'),{rewarded:false}); });
