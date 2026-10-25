import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateDeal} from '../experimental/v05/src/generator/level-generator.ts';
import {levelFor} from '../experimental/v05/src/game/deal.ts';
import {createGame,applyAction,isVictory,legalMoves} from '../experimental/v05/src/game/game.ts';
import {visiblePosition} from '../experimental/v05/src/game/visible.ts';
import {solveForward,verifyClosedProof,canonicalPositionKey} from '../experimental/v05/src/solver/solver.ts';
import {makeCertificate,verifyBarrier} from '../experimental/v05/src/generator/barrier.ts';
const read=name=>JSON.parse(readFileSync(new URL(`./fixtures/v05/${name}.json`,import.meta.url)));
const replay=(state,actions)=>{for(const a of actions){const n=applyAction(state,a);assert.ok(n.ok,n.reason);state=n.state;}return state;};
const pos=s=>({columns:s.columns,reserve:s.reserve});
test('v05 actualnormalpoolhasprovenriskychoice inEVERY Rminclass andoneUndo recoversWIN',async()=>{
  for(const w of read('risk-witnesses')){
    const deal=await generateDeal(w.seed,w.required),parent=replay(createGame(levelFor(deal),w.required),w.prefix);
    assert.ok(isVictory(replay(parent,w.winning)));
    const child=replay(parent,[w.bad]);assert.ok(verifyClosedProof(child,w.lose.closedProof));
    const oracle=solveForward(child,{maxStates:10000,maxMs:2000});assert.equal(oracle.status,'LOSE');assert.equal(oracle.discovered,w.lose.discovered);
    const undone=replay(child,[{type:'undo'}]);assert.deepEqual(pos(undone),pos(parent));assert.ok(isVictory(replay(undone,w.winning)));
  }
});
test('v05 independent actualengine exhaustive closures agreeforall4riskychildren, notjustsolver transitions',async()=>{
  for(const w of read('risk-witnesses')){
    const d=await generateDeal(w.seed,w.required),child=replay(replay(createGame(levelFor(d),w.required),w.prefix),[w.bad]);
    const seen=new Set([canonicalPositionKey(child)]),queue=[child];
    for(let i=0;i<queue.length;i++){
      assert.ok(!isVictory(queue[i]));assert.ok(queue[i].columns.every(c=>!c.length||c[0].open));
      for(const action of legalMoves(queue[i])){const next=replay(queue[i],[action]),key=canonicalPositionKey(next);if(!seen.has(key)){seen.add(key);queue.push(next);}}
    }
    assert.deepEqual(seen,new Set(w.lose.closedProof.keys));
  }
});
test('v05 actualGROUPSIZE choice: sameports count1WIN versus count2certifiedLOSE',async()=>{
  const w=read('group-size-risk'),d=await generateDeal(w.seed,1),parent=replay(createGame(levelFor(d),1),w.prefix);
  assert.deepEqual(w.good.from,w.bad.from);assert.deepEqual(w.good.to,w.bad.to);assert.equal(w.good.count,1);assert.equal(w.bad.count,2);
  assert.deepEqual(w.goodContinuation[0],w.good);assert.ok(isVictory(replay(parent,w.goodContinuation)));
  assert.ok(verifyClosedProof(replay(parent,[w.bad]),w.lose.closedProof));
});
test('v05 twoACTUALadmittedpoolmembers haveidenticalvisiblehistory butsameactionLOSEversusWIN',async()=>{
  const pair=read('pool-hidden-pair'),a=await generateDeal(pair.rootIdA,1),b=await generateDeal(pair.rootIdB,1);
  let sa=createGame(levelFor(a),1),sb=createGame(levelFor(b),1);
  assert.deepEqual(visiblePosition(sa),visiblePosition(sb));
  for(const action of pair.commonPrefix){sa=replay(sa,[action]);sb=replay(sb,[action]);assert.deepEqual(visiblePosition(sa),visiblePosition(sb));}
  const ca=replay(sa,[pair.commonAction]),cb=replay(sb,[pair.commonAction]);
  const ar=solveForward(ca,{maxStates:10000,maxMs:2000}),br=solveForward(cb,{maxStates:10000,maxMs:2000});
  assert.equal(ar.status,'LOSE');assert.ok(verifyClosedProof(ca,ar.closedProof));assert.equal(br.status,'WIN');assert.ok(isVictory(replay(cb,br.solution)));
});
test('v05 everyclass has samevisiblehiddencompletions withoppositeoutcomes; Bpoolmembership notassumed',()=>{
  for(const pair of read('hidden-completions')){
    let a=createGame({seed:'hiddenA',columns:pair.columnsA,algorithm:'reserve-proof-v5',solution:[]},pair.required),b=createGame({seed:'hiddenB',columns:pair.columnsB,algorithm:'reserve-proof-v5',solution:[]},pair.required);
    for(const columns of [pair.columnsA,pair.columnsB])assert.ok(verifyBarrier(columns,makeCertificate(columns,pair.required)).ok);
    assert.deepEqual(visiblePosition(a),visiblePosition(b));
    for(const action of pair.prefix){a=replay(a,[action]);b=replay(b,[action]);assert.deepEqual(visiblePosition(a),visiblePosition(b));}
    assert.ok(isVictory(replay(a,pair.parentWinA)));assert.ok(isVictory(replay(b,pair.parentWinB)));
    const w=read('risk-witnesses').find(w=>w.required===pair.required);
    assert.ok(verifyClosedProof(replay(a,[pair.action]),w.lose.closedProof));assert.ok(isVictory(replay(replay(b,[pair.action]),pair.childWinB)));
  }
});
