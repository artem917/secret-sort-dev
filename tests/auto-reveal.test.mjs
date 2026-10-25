import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createGame, clonePosition, columnAt as c, reserveAt as r, positionError } from '../src/game/game.ts';
import { generateLevel } from '../src/generator/level-generator.ts';
import { isValidSave, loadGame, saveGame, SAVE_KEY, LEGACY_SAVE_KEY } from '../src/game/storage.ts';
import { createGroupTutorial } from '../src/ui/tutorial.ts';
import { createGame as oldCreate, applyAction as oldApply } from './fixtures/v02/game/game.ts';
import { generateLevel as oldGenerate } from './fixtures/v02/generator/level-generator.ts';

const accept=(s,a)=>{const n=applyAction(s,a);assert.equal(n.ok,true,n.reason);return n.state;};
const move=(from,to,count=1)=>({type:'move',from,to,count});
const initial=()=>createGame(generateLevel('atomic-undo'));
function memory(){const data=new Map();return{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};}

test('column-to-reserve autoReveal is one transfer and one history entry',()=>{
  const before=accept(initial(),{type:'reveal',column:0,index:0});
  const nextId=before.columns[0][1].id;
  const after=accept(before,move(c(0),r(0)));
  assert.equal(after.columns[0][0].id,nextId);assert.equal(after.columns[0][0].open,true);assert.equal(after.columns[0][1].open,false);
  assert.equal(after.history.length,before.history.length+1);assert.equal(after.history.at(-1).autoRevealedId,nextId);assert.equal(after.transfers,1);
  assert.equal(positionError(after,after.config),null);
  const undo=accept(after,{type:'undo'});assert.deepEqual(clonePosition(undo),clonePosition(before));assert.equal(undo.undos,1);
});
test('group transfer and its reveal undo together, including the hidden flag',()=>{
  const before=createGroupTutorial(), hiddenId=before.columns[0][5].id;
  const after=accept(before,move(c(0),c(9),5));
  assert.equal(after.columns[9].length,5);assert.equal(after.columns[0][0].open,true);assert.equal(after.columns[0][0].id,hiddenId);assert.equal(after.columns[0][1].open,false);
  assert.equal(after.history.length,1);assert.equal(after.transfers,1);assert.equal(positionError(after,after.config),null);
  assert.deepEqual(clonePosition(accept(after,{type:'undo'})),clonePosition(before));
});
test('partial selection keeps already-open source top open; undo does not reclose it',()=>{
  const before=createGroupTutorial();const after=accept(before,move(c(0),c(9),2));
  assert.equal(after.history.at(-1).autoRevealedId,null);assert.equal(after.columns[0][0].open,true);
  assert.deepEqual(clonePosition(accept(after,{type:'undo'})),clonePosition(before));
});
test('empty source and reserve source never invent an autoReveal',()=>{
  let s=createGroupTutorial();s.columns[9]=s.columns[0].splice(1);s.columns[9].forEach(t=>t.open=true);
  const after=accept(s,move(c(0),r(0)));assert.equal(after.columns[0].length,0);assert.equal(after.history.at(-1).autoRevealedId,null);
  const back=accept(after,move(r(0),c(0)));assert.equal(back.history.at(-1).autoRevealedId,null);assert.deepEqual(clonePosition(back),clonePosition(s));
});
test('illegal destination leaves position, hidden flags, history and counters unchanged',()=>{
  const before=accept(initial(),{type:'reveal',column:0,index:0});
  const result=applyAction(before,move(c(0),c(1)));assert.equal(result.ok,false);assert.equal(result.state,before);assert.equal(before.columns[0][1].open,false);
});
test('atomic reveal survives save/F5 and is reclosed by a single undo after resume',()=>{
  const before=accept(initial(),{type:'reveal',column:0,index:0}), after=accept(before,move(c(0),r(0))), storage=memory();
  assert.equal(saveGame(storage,after),true);const loaded=loadGame(storage);assert.equal(loaded.warning,null);assert.equal(loaded.game.version,2);
  assert.deepEqual(clonePosition(accept(loaded.game,{type:'undo'})),clonePosition(before));
});
test('tampered autoReveal ID or omitted v2 metadata fails save validation',()=>{
  const s=accept(accept(initial(),{type:'reveal',column:0,index:0}),move(c(0),r(0)));
  const bad=structuredClone(s);bad.history.at(-1).autoRevealedId=999;assert.equal(isValidSave(bad),false);
  const missing=structuredClone(s);delete missing.history.at(-1).autoRevealedId;assert.equal(isValidSave(missing),false);
});
test('reverse50 mixed operations restores exact original position without losing tiles',()=>{
  const level=generateLevel('reverse-prefix-50');let s=createGame(level);const original=clonePosition(s);
  for(const action of level.solution.slice(0,50))s=accept(s,action);
  for(let i=0;i<50;i++){s=accept(s,{type:'undo'});assert.equal(positionError(s,s.config),null);}
  assert.deepEqual(clonePosition(s),original);assert.equal(s.undos,50);
});
test('valid v0.2 save migrates board and old undo exactly, without erasing backup',()=>{
  const level=oldGenerate('saved-v02');let old=oldCreate(level,4,'old-session');old=oldApply(old,{type:'reveal',column:0,index:0}).state;
  const before=clonePosition(old);old=oldApply(old,move(c(0),r(0))).state;
  const storage=memory(),text=JSON.stringify(old);storage.setItem(LEGACY_SAVE_KEY,text);
  const loaded=loadGame(storage);assert.equal(loaded.warning,null);assert.equal(loaded.game.version,2);assert.equal(loaded.game.generator,'ordered-donor-v1');
  assert.deepEqual(clonePosition(loaded.game),clonePosition(old));assert.deepEqual(clonePosition(accept(loaded.game,{type:'undo'})),before);
  assert.equal(storage.getItem(LEGACY_SAVE_KEY),text);
});
test('corrupted v2 save does not silently fall back to stale v1 position',()=>{
  const storage=memory();storage.setItem(LEGACY_SAVE_KEY,JSON.stringify(oldCreate(oldGenerate('legacy'))));storage.setItem(SAVE_KEY,'{bad');
  assert.equal(loadGame(storage).game,null);assert.ok(loadGame(storage).warning);
});
test('migrated legacy party uses atomic autoReveal only for new transfers',()=>{
  const storage=memory();storage.setItem(LEGACY_SAVE_KEY,JSON.stringify(oldCreate(oldGenerate('legacy-newmove'))));
  const original=loadGame(storage).game, before=accept(original,{type:'reveal',column:0,index:0}), after=accept(before,move(c(0),r(0)));
  assert.equal(after.columns[0][0].open,true);assert.deepEqual(clonePosition(accept(after,{type:'undo'})),clonePosition(before));
});
