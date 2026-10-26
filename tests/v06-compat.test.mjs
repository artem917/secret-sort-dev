import test from 'node:test';
import assert from 'node:assert/strict';
import {generateDeal} from '../experimental/v05/src/generator/level-generator.ts';
import {createGame,applyAction} from '../experimental/v05/src/game/game.ts';
import {levelFor} from '../experimental/v05/src/game/deal.ts';
const target=process.env.SECRET_SORT_TARGET??'v06',session=await import(`../experimental/${target}/src/game/session.ts`);
test('v06 legacy save imports exact board but normalizes starting flips and drops solver ending',async()=>{
  const deal=await generateDeal('perturbed-r1-11',1);let game=createGame(levelFor(deal),1,'legacy');
  for(const action of deal.solution.slice(0,13)){const next=applyAction(game,action);assert.ok(next.ok);game=next.state;}
  const map=new Map([[session.SESSION_KEY,JSON.stringify({schema:1,game,deal,disposition:'proven-lose'})]]),port={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
  const loaded=await session.loadSession(port);
  assert.ok(loaded.game);assert.equal(loaded.game.version,3);assert.equal(loaded.disposition,'playing');
  assert.deepEqual(loaded.game.columns,game.columns);assert.equal(loaded.game.history.filter(e=>e.type==='reveal').length,0);
  assert.equal(loaded.deal.columns.flat().filter(t=>t.open).length,10);
  assert.ok(loaded.deal.solution.every(a=>a.type==='move'));
});
