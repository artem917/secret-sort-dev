import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const target=process.env.SECRET_SORT_TARGET??'v06';
const game=await import(`../experimental/${target}/src/game/game.ts`);
const session=await import(`../experimental/${target}/src/game/session.ts`);
const raw=JSON.parse(readFileSync(new URL('./fixtures/v05/risk-witnesses.json',import.meta.url)))[0];
const data=await import('../experimental/v05/src/generator/perturbation-data.ts');
const template=data.templateById(raw.seed);
const level={seed:raw.seed,columns:data.columnsForTemplate(template),solution:[],algorithm:target==='v05'?'reserve-proof-v5':'reserve-proof-v6'};
const start=()=>game.createGame(level,1,'regression');
test('v06 new game exposes ten top tiles without player actions or undo entries',()=>{
  const state=start();
  assert.equal(state.columns.flat().filter(t=>t.open).length,10);
  assert.equal(state.columns.flat().filter(t=>!t.open).length,98);
  assert.ok(state.columns.every(c=>c[0].open&&c.slice(1).every(t=>!t.open)));
  assert.equal(state.history.length,0);assert.equal(state.transfers,0);assert.equal(state.undos,0);
});
test('v06 F5 converts an old proven-lose disposition into a playable position',async()=>{
  let state=start();
  for(const action of [...raw.prefix,raw.bad]){
    if(action.type==='reveal'&&state.columns[action.column][0].open)continue;
    const r=game.applyAction(state,action);assert.ok(r.ok,r.reason);state=r.state;
  }
  assert.ok(game.legalMoves(state).length>0,'known losing graph contains legal cyclic moves');
  const values=new Map(),port={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  session.saveSession(port,state,null,'proven-lose',raw.lose.closedProof);
  const loaded=await session.loadSession(port);
  assert.equal(loaded.disposition,'playing');
  assert.deepEqual(loaded.game.columns,state.columns);
  const undone=game.applyAction(loaded.game,{type:'undo'});assert.ok(undone.ok,undone.reason);
});
